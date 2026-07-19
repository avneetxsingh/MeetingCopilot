import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as kms from "aws-cdk-lib/aws-kms";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export class UndertoneStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

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
          ...(process.env.GROQ_BASE_URL ? { GROQ_BASE_URL: process.env.GROQ_BASE_URL } : {}),
        },
      });

    const createSession = makeFn("CreateSessionFn", "createSession");
    const getSession = makeFn("GetSessionFn", "getSession");
    const listSessions = makeFn("ListSessionsFn", "listSessions");
    const endSession = makeFn("EndSessionFn", "endSession", 30);
    const putGroqKey = makeFn("PutGroqKeyFn", "putGroqKey");
    const postChunk = makeFn("PostChunkFn", "postChunk", 60);

    // Least privilege: everyone reads (auth GSI lookup); only mutating handlers write.
    for (const f of [createSession, getSession, listSessions, endSession, putGroqKey, postChunk]) {
      table.grantReadData(f);
    }
    for (const f of [createSession, endSession, putGroqKey, postChunk]) table.grantWriteData(f);
    audio.grantPut(postChunk);
    groqKms.grantEncrypt(putGroqKey);
    groqKms.grantDecrypt(postChunk);
    groqKms.grantDecrypt(endSession);

    const api = new apigwv2.HttpApi(this, "Api");
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

    new CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new CfnOutput(this, "TableName", { value: table.tableName });
    new CfnOutput(this, "BucketName", { value: audio.bucketName });
  }
}
