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

const list = await call("GET", "/v1/sessions");
assert((list.sessions as { sessId?: string }[]).some((s) => s.sessId === session.id), "session in list");
console.log("✓ list works\nSMOKE PASS");
