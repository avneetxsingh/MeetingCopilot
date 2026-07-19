# Undertone

Undertone is a real-time audio-intelligence platform: send it live meeting
audio in 30-second chunks and it hands back a transcript plus contextually
relevant AI suggestions, per chunk, in one round trip. It's multi-tenant,
runs on AWS serverless end to end, and every account brings its own Groq API
key — the platform operator pays $0 for inference.

## Architecture

```
┌─ Vercel ─────────────────┐      ┌─ AWS ────────────────────────────────────┐
│  Demo app (meeting        │      │  API Gateway (HTTP API)                  │
│  copilot, rebuilt as      │─────▶│    ├─ POST /sessions        ─┐           │
│  platform customer #1)    │      │    ├─ POST /sessions/{id}/chunks ─▶ Lambda: ingest
│                           │      │    ├─ GET  /sessions/{id}    │      (Groq Whisper →
│  Landing page + docs +    │      │    ├─ GET  /search           │       transcript →
│  developer dashboard      │      │    └─ CRUD /webhooks         │       suggestions →
└──────────────────────────┘      │                               │       embeddings)
                                   │  DynamoDB (sessions, chunks, │           │
                                   │  api keys, webhook subs)     ◀───────────┤
                                   │  S3 (raw audio, exports)     ◀───────────┤
                                   │  S3 Vectors (embeddings)     ◀───────────┤
                                   │  SQS ─▶ Lambda: webhook delivery ─▶ customer URLs
                                   └──────────────────────────────────────────┘
```

Phase 1 implements the core pipeline: `sessions` + `chunks` API, Groq
transcription and suggestions, DynamoDB persistence, and API-key auth. Phase
2 (this repo, today) adds memory/RAG on top: async embeddings, semantic
`/search`, and a `/chat` deep-dive endpoint that grounds replies in a
session's transcript. The Vercel demo app and webhooks are still roadmap —
see the API table below and the design spec for the full three-phase plan.

## Quick Start

**Prerequisites:** an AWS account, the AWS CLI configured (`aws configure`),
and the AWS CDK bootstrapped in your target account/region
(`npx cdk bootstrap`, run once per account/region). Nothing here is deployed
yet — the calls below assume you've deployed your own dev stack first.

Deploy the stack:

```bash
cd infra
npm run deploy
```

This prints three CDK outputs: `ApiUrl`, `TableName`, and `BucketName`. Note
`ApiUrl` and `TableName` — you'll need them next.

Mint an account and platform API key:

```bash
TABLE_NAME=<TableName output> npx tsx scripts/create-account.ts "my account"
```

This prints an account id and an API key of the form `ut_live_...`. The key
is shown exactly once — copy it now. Platform keys are stored as a peppered
HMAC hash, never in plaintext, so if you lose it you'll need to mint a new
account. If you set `UNDERTONE_PEPPER` when deploying the stack, set that same
value for this command too, or hashes won't match at auth time.

Store your Groq key on the account (required before transcription/suggestion
calls will work — Undertone never ships with a shared inference key):

```bash
curl -X PUT "$API/v1/account/groq-key" \
  -H "authorization: Bearer ut_live_..." \
  -H "content-type: application/json" \
  -d '{"groqKey": "gsk_..."}'
```

Create a session, post an audio chunk, and end the session:

```bash
curl -X POST "$API/v1/sessions" \
  -H "authorization: Bearer ut_live_..." \
  -H "content-type: application/json" \
  -d '{"title": "standup"}'
# → { "id": "01H...", "title": "standup", "kind": "meeting", "status": "active", "createdAt": "..." }

curl -X POST "$API/v1/sessions/01H.../chunks" \
  -H "authorization: Bearer ut_live_..." \
  -H "content-type: audio/wav" \
  --data-binary @services/test/fixtures/hello.wav
# → { "seq": 1, "transcript": "...", "suggestions": [ { "type": "...", "preview": "...", "detail_prompt": "..." }, ... ] }

curl -X POST "$API/v1/sessions/01H.../end" \
  -H "authorization: Bearer ut_live_..."
# → { "id": "01H...", "status": "ended", "summary": "...", "actionItems": [...] }
```

Once a stack is deployed, run the end-to-end smoke test — it exercises every
phase-1 and phase-2 endpoint against the live stack and doubles as a demo
rehearsal:

```bash
UNDERTONE_API=$API UNDERTONE_KEY=$KEY npx tsx scripts/smoke.ts
```

## API

Auth on every request: `authorization: Bearer ut_live_...`.

| Method | Path | Description | Status |
|---|---|---|---|
| POST | `/v1/sessions` | create session `{title?, kind?: meeting\|interview\|lecture}` | shipped |
| POST | `/v1/sessions/{id}/chunks` | raw audio body → `{ transcript, suggestions[] }` | shipped |
| GET | `/v1/sessions/{id}` | full session: transcript, suggestion history, status | shipped |
| POST | `/v1/sessions/{id}/end` | close session; generates summary + action items | shipped |
| GET | `/v1/sessions` | list sessions for the account | shipped |
| PUT | `/v1/account/groq-key` | store the account's Groq key (KMS-encrypted) | shipped |
| GET | `/v1/search?q=...` | semantic search across the account's sessions | shipped |
| POST | `/v1/chat` | suggestion/session deep-dive, grounded in transcript | shipped |
| CRUD | `/v1/webhooks` | manage webhook subscriptions | roadmap (phase 3) |

`/v1/` is reserved for versioning; breaking changes ship as `/v2/`.

**Known limitation.** `/v1/search` (and the cross-session history that
`/v1/sessions/{id}/chunks` retrieves internally) depends on Bedrock Titan
embeddings, which run through each account's AWS environment. New AWS
accounts often start with a Bedrock model-invocation quota of `0.0` for
Titan Embed Text v2 until you request an increase — check and raise it in
the Service Quotas console (**Service Quotas → AWS services → Amazon
Bedrock → search "Titan Text Embeddings V2"**) before expecting embeddings
or search results to appear. Chunk ingestion and `/v1/chat` are unaffected —
they run through Groq, not Bedrock, and work regardless of Bedrock quota.
`/v1/chat` is a plain (non-streamed) JSON response today; streaming is
roadmap.

## Design decisions

**Single-table DynamoDB.** One table holds accounts, sessions, and chunks:
`ACCT#<id>` / `META` for the account row (hashed platform key, encrypted Groq
key), `ACCT#<id>` / `SESS#<ulid>` for session metadata, and `SESS#<id>` /
`CHUNK#<seq>` for each transcript segment and suggestion batch. A sparse GSI
(`GSI1PK = KEYHASH#<hash>`) maps a hashed API key straight to its account —
auth is always a point lookup, never a scan. ULIDs give sessions
chronological sort order for free.

**Peppered HMAC API-key hashing.** Platform keys (`ut_live_...`) are hashed
with HMAC-SHA256 and a server-side pepper before they ever touch DynamoDB
(see `services/src/lib/auth.ts`). The plaintext key is shown to the caller
exactly once, at creation, and is never stored or logged again. Losing it
means minting a new account.

**KMS-encrypted BYO Groq keys.** Each account supplies its own Groq API key
via `PUT /v1/account/groq-key`; it's encrypted with a dedicated KMS key
before being written to DynamoDB and decrypted in-Lambda only at the moment
of a Groq call. IAM grants are scoped per-Lambda — only the chunk-ingest and
end-session handlers can decrypt; only the groq-key handler can encrypt.

**Graceful degradation on the hot path.** A suggestion-generation failure
never loses a transcript: `postChunk` returns the transcript with an empty
`suggestions` array and a `warning` field rather than failing the whole
request (`services/src/lib/suggestions.ts`'s `generateSuggestionsSafe`).
Symmetrically, `endSession` always transitions the session to `ended` even
if summary generation fails — the session's status is never held hostage by
a downstream AI call. Both paths log the underlying error to CloudWatch and
surface a `warning` string to the caller instead.

**Raw binary audio body, not multipart.** `POST /v1/sessions/{id}/chunks`
takes the audio blob as the literal request body (`content-type: audio/wav`
or similar), not a multipart form. API Gateway HTTP APIs base64-decode
binary bodies for you, and skipping multipart parsing keeps the ingest
Lambda's request handling to a few lines — no form-boundary parsing on the
hot path.

**Fetch-based Groq client with `GROQ_BASE_URL` override.** `services/src/lib/groq.ts`
is a thin wrapper around the global `fetch`, with no Groq SDK dependency. The
base URL reads from `GROQ_BASE_URL` (defaulting to `https://api.groq.com`),
so tests and integration runs can point the Lambdas at a local fake HTTP
server (`services/test/helpers/fakeGroq.ts`) instead of the real Groq API —
no network calls, no real API key, in unit tests.

**Memory/RAG: async, best-effort, cross-session-only.** Each chunk's
transcript is embedded with **Bedrock Titan Text Embeddings V2 at 1024
dimensions** and written to an **account-namespaced S3 Vectors index**
(every vector's metadata carries `acctId`, and every query filters on it
with `{ acctId: { $eq: acctId } }` — one account can never retrieve
another's vectors). Embedding happens off the hot path: `postChunk` enqueues
a message to SQS (with a DLQ for messages that exhaust their retries)
instead of calling Bedrock inline, so a slow or throttled embedding call
never delays the chunk response the caller is waiting on; a separate
`embedWorker` Lambda consumes the queue and writes the vector.
Retrieval of `relevant_history` (injected into the suggestion prompt on
each new chunk) is **best-effort**: if embedding or vector queries fail, the
handler logs the error, treats history as empty, and still returns 200 — a
memory outage never blocks transcription or suggestions. By contrast,
`/v1/search` intentionally fails with a 5xx error on embedding failures to
avoid silently returning empty results. The suggestion-time retrieval is also
**cross-session-only** (`excludeSessId` scopes it to the account's *other*
sessions) — it's meant to surface a relevant decision from a past meeting,
not restate what's already on screen from the current one.
