import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, test } from "vitest";
import { UndertoneStack } from "../lib/undertone-stack";

describe("UndertoneStack", () => {
  const template = Template.fromStack(new UndertoneStack(new App(), "Test"));

  test("one on-demand table with GSI1", () => {
    template.resourceCountIs("AWS::DynamoDB::Table", 1);
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
      GlobalSecondaryIndexes: [{ IndexName: "GSI1" }],
    });
  });
  test("private audio bucket", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true },
    });
  });
  test("six API routes", () => {
    template.resourceCountIs("AWS::ApiGatewayV2::Route", 6);
  });
  test("a KMS key exists for groq keys", () => {
    expect(Object.keys(template.findResources("AWS::KMS::Key")).length).toBe(1);
  });

  test("exact set of six route keys (no duplicates, no missing paths)", () => {
    const routes = template.findResources("AWS::ApiGatewayV2::Route");
    const routeKeys = Object.values(routes).map(
      (r) => (r as { Properties: { RouteKey: string } }).Properties.RouteKey,
    );
    expect([...routeKeys].sort()).toEqual(
      [
        "POST /v1/sessions",
        "GET /v1/sessions",
        "GET /v1/sessions/{id}",
        "POST /v1/sessions/{id}/end",
        "POST /v1/sessions/{id}/chunks",
        "PUT /v1/account/groq-key",
      ].sort(),
    );
  });

  test("table key schema is PK (HASH) + SK (RANGE), both string; GSI1 hashes on GSI1PK", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      AttributeDefinitions: Match.arrayWith([
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
      ]),
      GlobalSecondaryIndexes: [
        Match.objectLike({
          IndexName: "GSI1",
          KeySchema: [{ AttributeName: "GSI1PK", KeyType: "HASH" }],
        }),
      ],
    });
  });

  test("GSI1 projects ALL attributes (auth reads groqKeyEnc off the projected item)", () => {
    const tables = template.findResources("AWS::DynamoDB::Table");
    const gsis = Object.values(tables)[0].Properties.GlobalSecondaryIndexes as Array<{
      Projection: { ProjectionType: string };
    }>;
    expect(gsis[0].Projection.ProjectionType).toBe("ALL");
  });

  test("audio bucket blocks all four public access vectors", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test("IAM least privilege: S3 put, KMS encrypt/decrypt grants are scoped to the right handlers only", () => {
    const policies = template.findResources("AWS::IAM::Policy");
    const statementsByPolicy = Object.values(policies).map(
      (p) =>
        (p as { Properties: { PolicyDocument: { Statement: Array<{ Action: string | string[] }> } } }).Properties
          .PolicyDocument.Statement,
    );

    const actionsFor = (statements: Array<{ Action: string | string[] }>) =>
      statements.flatMap((s) => (Array.isArray(s.Action) ? s.Action : [s.Action]));

    const policiesContaining = (action: string) =>
      statementsByPolicy.filter((statements) => actionsFor(statements).includes(action));

    // postChunk is the only handler that writes audio chunks to S3.
    expect(policiesContaining("s3:PutObject")).toHaveLength(1);
    // putGroqKey is the only handler that encrypts a stored Groq key.
    expect(policiesContaining("kms:Encrypt")).toHaveLength(1);
    // postChunk (to read a decrypted key when calling Groq) and endSession
    // (to decrypt for the final Groq call) are the only two decrypters.
    expect(policiesContaining("kms:Decrypt")).toHaveLength(2);
  });
});
