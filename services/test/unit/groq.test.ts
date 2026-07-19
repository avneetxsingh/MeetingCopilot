import { afterEach, describe, expect, test } from "vitest";
import { chatJson, transcribe } from "../../src/lib/groq";
import { startFakeGroq } from "../helpers/fakeGroq";

let fake: { url: string; close(): void } | undefined;
afterEach(() => { fake?.close(); delete process.env.GROQ_BASE_URL; });

describe("groq client", () => {
  test("transcribe returns the text field", async () => {
    fake = await startFakeGroq({ transcript: "quarterly roadmap" });
    process.env.GROQ_BASE_URL = fake.url;
    expect(await transcribe("gsk_x", Buffer.from("audio"), "chunk.wav")).toBe("quarterly roadmap");
  });
  test("chatJson parses the model's JSON content", async () => {
    fake = await startFakeGroq({ chat: { suggestions: [] } });
    process.env.GROQ_BASE_URL = fake.url;
    expect(await chatJson("gsk_x", "sys", "user")).toEqual({ suggestions: [] });
  });
  test("groq 401 becomes 402 groq_key_invalid", async () => {
    fake = await startFakeGroq({ status: 401 });
    process.env.GROQ_BASE_URL = fake.url;
    await expect(chatJson("gsk_bad", "s", "u")).rejects.toMatchObject({ status: 402, code: "groq_key_invalid" });
  });
  test("other groq failures become 502 groq_upstream", async () => {
    fake = await startFakeGroq({ status: 500 });
    process.env.GROQ_BASE_URL = fake.url;
    await expect(transcribe("gsk_x", Buffer.from("a"), "c.wav")).rejects.toMatchObject({ status: 502, code: "groq_upstream" });
  });
});
