import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { ApiError } from "./errors";

// us-east-1 has an on-demand quota of 0 req/min for Titan Embed Text v2, and it's
// not adjustable via Service Quotas on new accounts. us-east-2 has 6000 req/min
// available on this account, so the Bedrock client targets it directly while the
// rest of the stack (Lambda, DynamoDB, S3 Vectors) stays in us-east-1.
export const BEDROCK_REGION = process.env.BEDROCK_REGION ?? "us-east-2";
const client = new BedrockRuntimeClient({ region: BEDROCK_REGION });
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
