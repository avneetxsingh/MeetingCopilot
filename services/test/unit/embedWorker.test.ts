import { beforeEach, describe, expect, test } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { PutVectorsCommand, S3VectorsClient } from "@aws-sdk/client-s3vectors";
import { handler } from "../../src/handlers/embedWorker";

const brMock = mockClient(BedrockRuntimeClient);
const svMock = mockClient(S3VectorsClient);
beforeEach(() => {
  brMock.reset(); svMock.reset();
  process.env.VECTOR_BUCKET = "vb"; process.env.VECTOR_INDEX = "chunks";
});

const record = (body: unknown) => ({ body: JSON.stringify(body) });
const msg = { acctId: "A1", sessId: "S1", seq: 2, transcript: "we picked postgres", createdAt: "2026-07-19T00:00:00.000Z" };

describe("embedWorker", () => {
  test("embeds each record and writes the vector", async () => {
    brMock.on(InvokeModelCommand).resolves({ body: new TextEncoder().encode(JSON.stringify({ embedding: [0.1, 0.2] })) } as never);
    svMock.on(PutVectorsCommand).resolves({});
    await handler({ Records: [record(msg)] } as never);
    const put = svMock.commandCalls(PutVectorsCommand)[0].args[0].input;
    expect(put.vectors![0].key).toBe("A1/S1/000002");
    expect((put.vectors![0].metadata as Record<string, unknown>).text).toBe("we picked postgres");
  });
  test("throws on embed failure so sqs retries", async () => {
    brMock.on(InvokeModelCommand).rejects(new Error("bedrock down"));
    await expect(handler({ Records: [record(msg)] } as never)).rejects.toThrow();
    expect(svMock.commandCalls(PutVectorsCommand).length).toBe(0);
  });
});
