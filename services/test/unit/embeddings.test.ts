import { beforeEach, describe, expect, test } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { EMBED_DIM, embedText } from "../../src/lib/embeddings";

const brMock = mockClient(BedrockRuntimeClient);
beforeEach(() => brMock.reset());

const bodyBytes = (obj: unknown) => new TextEncoder().encode(JSON.stringify(obj));

describe("embedText", () => {
  test("sends titan v2 request and returns the embedding", async () => {
    const fake = Array.from({ length: EMBED_DIM }, (_, i) => i / EMBED_DIM);
    brMock.on(InvokeModelCommand).resolves({ body: bodyBytes({ embedding: fake }) } as never);
    const out = await embedText("hello roadmap");
    expect(out).toEqual(fake);
    const input = brMock.commandCalls(InvokeModelCommand)[0].args[0].input;
    expect(input.modelId).toBe("amazon.titan-embed-text-v2:0");
    const sent = JSON.parse(new TextDecoder().decode(input.body as Uint8Array));
    expect(sent).toEqual({ inputText: "hello roadmap", dimensions: 1024, normalize: true });
  });
  test("truncates very long input to 8000 chars", async () => {
    brMock.on(InvokeModelCommand).resolves({ body: bodyBytes({ embedding: [0.1] }) } as never);
    await embedText("x".repeat(20000));
    const sent = JSON.parse(new TextDecoder().decode(brMock.commandCalls(InvokeModelCommand)[0].args[0].input.body as Uint8Array));
    expect(sent.inputText.length).toBe(8000);
  });
  test("malformed bedrock output throws 502 embed_failed", async () => {
    brMock.on(InvokeModelCommand).resolves({ body: bodyBytes({ nope: true }) } as never);
    await expect(embedText("t")).rejects.toMatchObject({ status: 502, code: "embed_failed" });
  });
});
