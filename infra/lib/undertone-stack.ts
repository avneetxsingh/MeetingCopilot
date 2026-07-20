import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3vectors from "aws-cdk-lib/aws-s3vectors";
import * as sqs from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export interface UndertoneStackProps extends StackProps {
  stage?: string;
}

export class UndertoneStack extends Stack {
  constructor(scope: Construct, id: string, props?: UndertoneStackProps) {
    super(scope, id, props);
    const stage = props?.stage ?? "dev";
    // us-east-1 on-demand Titan quota is 0 and non-adjustable; us-west-2 has 6000 rpm.
    // Named const so the Lambda env var and the IAM ARN can never drift apart.
    // Bedrock on-demand quotas are per-region. This account has 0 req/min for
    // Titan Embed V2 in us-east-1 AND us-west-2 (non-adjustable); us-east-2 and
    // eu-west-1 have 6000. Verified empirically, not from docs.
    const bedrockRegion = "us-east-2";

    const table = new dynamodb.Table(this, "Table", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY, // dev stack; prod stage flips to RETAIN
    });
    // Sparse GSI: only account items carry GSI1PK, so this index stays tiny.
    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
    });

    const audio = new s3.Bucket(this, "Audio", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const groqKms = new kms.Key(this, "GroqKeyKms", { description: "Encrypts stored Groq API keys" });

    const vectorBucketName = `undertone-${stage}-vectors`;
    const vectorIndexName = "chunks";
    const vb = new s3vectors.CfnVectorBucket(this, "VectorBucket", { vectorBucketName });
    const vidx = new s3vectors.CfnIndex(this, "VectorIndex", {
      vectorBucketName,
      indexName: vectorIndexName,
      dataType: "float32",
      dimension: 1024,
      distanceMetric: "cosine",
      metadataConfiguration: { nonFilterableMetadataKeys: ["text"] },
    });
    vidx.addDependency(vb);

    const dlq = new sqs.Queue(this, "EmbedDlq", { retentionPeriod: Duration.days(14) });
    const embedQueue = new sqs.Queue(this, "EmbedQueue", {
      visibilityTimeout: Duration.seconds(120),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });

    const makeFn = (name: string, entry: string, timeoutSeconds = 10) =>
      new NodejsFunction(this, name, {
        entry: path.join(here, `../../services/src/handlers/${entry}.ts`),
        runtime: Runtime.NODEJS_22_X,
        timeout: Duration.seconds(timeoutSeconds),
        memorySize: 512,
        environment: {
          TABLE_NAME: table.tableName,
          BUCKET_NAME: audio.bucketName,
          KMS_KEY_ID: groqKms.keyId,
          KEY_PEPPER: process.env.UNDERTONE_PEPPER ?? "dev-pepper-change-me",
          VECTOR_BUCKET: vectorBucketName,
          VECTOR_INDEX: vectorIndexName,
          BEDROCK_REGION: bedrockRegion,
          ...(process.env.GROQ_BASE_URL ? { GROQ_BASE_URL: process.env.GROQ_BASE_URL } : {}),
        },
      });

    const createSession = makeFn("CreateSessionFn", "createSession");
    const getSession = makeFn("GetSessionFn", "getSession");
    const listSessions = makeFn("ListSessionsFn", "listSessions");
    const endSession = makeFn("EndSessionFn", "endSession", 30);
    const putGroqKey = makeFn("PutGroqKeyFn", "putGroqKey");
    const postChunk = makeFn("PostChunkFn", "postChunk", 60);
    const embedWorker = makeFn("EmbedWorkerFn", "embedWorker", 60);
    const search = makeFn("SearchFn", "search", 15);
    const chat = makeFn("ChatFn", "chat", 60);

    postChunk.addEnvironment("EMBED_QUEUE_URL", embedQueue.queueUrl);
    embedWorker.addEventSource(new SqsEventSource(embedQueue, { batchSize: 10 }));
    embedQueue.grantSendMessages(postChunk);

    // Least privilege: everyone reads (auth GSI lookup); only mutating handlers write.
    for (const f of [createSession, getSession, listSessions, endSession, putGroqKey, postChunk]) {
      table.grantReadData(f);
    }
    for (const f of [createSession, endSession, putGroqKey, postChunk]) table.grantWriteData(f);
    audio.grantPut(postChunk);
    groqKms.grantEncrypt(putGroqKey);
    groqKms.grantDecrypt(postChunk);
    groqKms.grantDecrypt(endSession);

    // chat reads session/chunk history (auth GSI + session/chunk items) and decrypts the stored Groq key.
    table.grantReadData(chat);
    groqKms.grantDecrypt(chat);

    // search only needs the auth GSI lookup, but requireAccount runs in EVERY
    // handler — a function without table read cannot authenticate at all.
    table.grantReadData(search);

    const titanArn = `arn:aws:bedrock:${bedrockRegion}::foundation-model/amazon.titan-embed-text-v2:0`;
    const vectorIndexArn = `arn:aws:s3vectors:${this.region}:${this.account}:bucket/${vectorBucketName}/index/${vectorIndexName}`;
    const bedrockInvoke = new iam.PolicyStatement({ actions: ["bedrock:InvokeModel"], resources: [titanArn] });
    for (const f of [embedWorker, postChunk, search]) f.addToRolePolicy(bedrockInvoke);
    embedWorker.addToRolePolicy(
      new iam.PolicyStatement({ actions: ["s3vectors:PutVectors"], resources: [vectorIndexArn] }),
    );
    for (const f of [postChunk, search])
      f.addToRolePolicy(
        new iam.PolicyStatement({
          // GetVectors looks unused but is required by AWS alongside QueryVectors
          // when returnMetadata/returnDistance are set (per the SDK docs) — do not trim.
          actions: ["s3vectors:QueryVectors", "s3vectors:GetVectors"],
          resources: [vectorIndexArn],
        }),
      );

    const api = new apigwv2.HttpApi(this, "Api", {
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ["authorization", "content-type"],
      },
    });
    const route = (routePath: string, method: apigwv2.HttpMethod, f: NodejsFunction) =>
      api.addRoutes({
        path: routePath,
        methods: [method],
        integration: new HttpLambdaIntegration(`${f.node.id}Int`, f),
      });
    route("/v1/sessions", apigwv2.HttpMethod.POST, createSession);
    route("/v1/sessions", apigwv2.HttpMethod.GET, listSessions);
    route("/v1/sessions/{id}", apigwv2.HttpMethod.GET, getSession);
    route("/v1/sessions/{id}/end", apigwv2.HttpMethod.POST, endSession);
    route("/v1/sessions/{id}/chunks", apigwv2.HttpMethod.POST, postChunk);
    route("/v1/account/groq-key", apigwv2.HttpMethod.PUT, putGroqKey);
    route("/v1/search", apigwv2.HttpMethod.GET, search);
    route("/v1/chat", apigwv2.HttpMethod.POST, chat);

    new CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new CfnOutput(this, "TableName", { value: table.tableName });
    new CfnOutput(this, "BucketName", { value: audio.bucketName });
    new CfnOutput(this, "VectorBucketName", { value: vectorBucketName });
    new CfnOutput(this, "EmbedQueueUrl", { value: embedQueue.queueUrl });
  }
}
