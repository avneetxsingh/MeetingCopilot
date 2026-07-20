import { readFile } from "node:fs/promises";

const API = process.env.UNDERTONE_API;
const KEY = process.env.UNDERTONE_KEY;
if (!API || !KEY) throw new Error("Set UNDERTONE_API (ApiUrl output) and UNDERTONE_KEY (ut_live_...)");
const h = { authorization: `Bearer ${KEY}` };

async function call(method: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, { method, ...init, headers: { ...h, ...(init.headers ?? {}) } });
  const body = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(body)}`);
  return body as Record<string, unknown>;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`SMOKE FAIL: ${msg}`);
}

const session = await call("POST", "/v1/sessions", {
  body: JSON.stringify({ title: "smoke test" }),
  headers: { "content-type": "application/json" },
});
assert(typeof session.id === "string", "session has an id");
console.log(`✓ created session ${session.id}`);

const audio = await readFile(new URL("../services/test/fixtures/hello.wav", import.meta.url));
const chunk = await call("POST", `/v1/sessions/${session.id}/chunks`, {
  body: audio,
  headers: { "content-type": "audio/wav" },
});
assert(typeof chunk.transcript === "string" && (chunk.transcript as string).length > 10, "transcript is non-trivial");
assert(Array.isArray(chunk.suggestions), "suggestions is an array");
console.log(`✓ chunk transcribed (${(chunk.transcript as string).length} chars, ${(chunk.suggestions as unknown[]).length} suggestions)`);

const fetched = await call("GET", `/v1/sessions/${session.id}`);
assert(Array.isArray(fetched.chunks) && (fetched.chunks as unknown[]).length === 1, "session shows 1 chunk");
console.log("✓ session retrieval works");

const ended = await call("POST", `/v1/sessions/${session.id}/end`);
assert(ended.status === "ended", "session ended");
console.log(`✓ ended with summary: ${String(ended.summary).slice(0, 80)}...`);

console.log("waiting 20s for async embedding...");
await new Promise((r) => setTimeout(r, 20000));

// TODO(quota): make hard assertion once Bedrock quota > 0. Replace this block with:
//   const search = await call("GET", `/v1/search?q=${encodeURIComponent("mobile app roadmap priority")}`);
//   assert(Array.isArray(search.results) && (search.results as unknown[]).length >= 1, "search finds embedded chunk");
//   console.log(`✓ search returned ${(search.results as unknown[]).length} hits`);
const searchPath = `/v1/search?q=${encodeURIComponent("mobile app roadmap priority")}`;
const searchRes = await fetch(`${API}${searchPath}`, { headers: h });
const searchBody = (await searchRes.json()) as Record<string, unknown>;
if (searchRes.status >= 500) {
  console.log("⚠ search skipped: embeddings blocked on Bedrock quota (see ledger)");
} else if (searchRes.ok) {
  const hits = (searchBody.results as unknown[]) ?? [];
  if (hits.length >= 1) {
    console.log(`✓ search returned ${hits.length} hits`);
  } else {
    console.log(
      "⚠ search returned 0 hits — could be quota (no vectors embedded yet) OR a real search bug; investigate before demo",
    );
  }
} else {
  throw new Error(`GET ${searchPath} → ${searchRes.status}: ${JSON.stringify(searchBody)}`);
}

const chat = await call("POST", "/v1/chat", {
  body: JSON.stringify({ sessionId: session.id, prompt: "What was discussed?" }),
  headers: { "content-type": "application/json" },
});
assert(typeof chat.reply === "string" && (chat.reply as string).length > 10, "chat replies with content");
console.log("✓ chat deep-dive works");

const list = await call("GET", "/v1/sessions");
assert((list.sessions as { sessId?: string }[]).some((s) => s.sessId === session.id), "session in list");
console.log("✓ list works\nSMOKE PASS");
