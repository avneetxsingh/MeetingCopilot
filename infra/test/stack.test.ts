import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
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
});
