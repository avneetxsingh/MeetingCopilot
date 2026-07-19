import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { ApiError } from "./errors";

const client = new BedrockRuntimeClient({});
const MODEL_ID = "amazon.titan-embed-text-v2:0";
export const EMBED_DIM = 1024;

export async function embedText(text: string): Promise<number[]> {
  const res = await client.send(
    new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: new TextEncoder().encode(
        JSON.stringify({ inputText: text.slice(0, 8000), dimensions: EMBED_DIM, normalize: true }),
      ),
    }),
  );
  const parsed = JSON.parse(new TextDecoder().decode(res.body)) as { embedding?: unknown };
  if (!Array.isArray(parsed.embedding)) throw new ApiError(502, "embed_failed", "Bedrock returned no embedding");
  return parsed.embedding as number[];
}
