# Meeting Copilot

A real-time AI meeting copilot that actually pays attention
so you don't have to.

🔗 **Live demo:** https://2winmind.vercel.app

---

## What is this?

You're in a meeting. Someone says something smart.
Someone says something wrong. Someone asks a question
nobody answers. And you're just sitting there nodding.

This app fixes that. It listens to your meeting in real
time, transcribes everything, and every 30 seconds surfaces
3 suggestions that are actually useful — not generic garbage
like "consider asking a follow-up question."

Three columns. No login. No fluff.

- **Left** — Live transcript of everything being said
- **Middle** — 3 AI suggestion cards, refreshed every 30s
- **Right** — Chat panel for deeper answers

<img width="1470" height="809" alt="image" src="https://github.com/user-attachments/assets/1742537b-998a-4205-b20a-12040cfdfb3c" />



---

## Before I wrote a single line of code

I actually downloaded TwinMind and used it. Ran two full
fake meeting sessions with ChatGPT on my laptop, Gemini
on my phone, and TwinMind on my iPad listening to both.

Here's what I found:

TwinMind defaults to questions. Every. Single. Batch.
Didn't matter if someone made a bold claim, expressed
confusion, or forced a decision — it asked a question.
Three questions. Every time.

Five confirmed weaknesses:

| Weakness | What it means |
|---|---|
| Defaults to questions | No variety regardless of context |
| Misses fact-check moments | Bold claims go unchallenged |
| Misses clarification moments | Confusion is ignored |
| No stage awareness | Wrong suggestions at wrong time |
| Generic previews | Could apply to any meeting ever |

So I built something that actually reads the room.

---

## Prompt Strategy

This is the part I'm most proud of and honestly the
whole point of the assignment.

Instead of one flat prompt that says "give 3 suggestions"
(which is what produces generic garbage), I built a
structured reasoning prompt that does three things in
one pass:

**Step 1 — Read the room**
Detects where in the conversation we are:
- OPENING: topic just introduced
- MIDDLE: substance happening
- CLOSING: wrapping up, action items

**Step 2 — Detect the moment**
Reads the last ~60 seconds specifically (last 2 transcript chunks):
- CLAIM → must surface a FACT_CHECK
- QUESTION → must surface an ANSWER
- CONFUSION → must surface a CLARIFICATION
- DECISION → must surface a TALKING_POINT
- CLOSING → must surface an ACTION_ITEM

**Step 3 — Enforce variety**
Hard rules baked into the prompt:
- Maximum 1 QUESTION per batch
- Never 3 of the same type
- Preview must contain the actual insight,
  not a pointer to it

The preview rule is what separates this from TwinMind.

A bad preview: "Consider fact-checking this statistic"

A good preview: "The 90% failure stat is overstated —
fitness app churn is driven by poor onboarding, not
lack of personalization"

Value without clicking. That was the goal.

**Why one prompt instead of chaining multiple?**
Latency. Groq is fast but not free-API-calls fast.
One well-structured prompt on GPT-OSS 120B outperforms
a poorly structured multi-prompt system every time.
The intelligence lives in the instructions, not the
architecture.

---

## Stack

| Thing | Choice | Why |
|---|---|---|
| Framework | Next.js 16.2 + TypeScript | One codebase, API routes built in, one Vercel deploy |
| Styling | Custom CSS (`page.css`) | Single file, full control, no framework overhead |
| Transcription | Groq Whisper Large V3 | Required by spec, genuinely fast |
| Suggestions + Chat | Groq GPT-OSS 120B | Required by spec |
| Deployment | Vercel | Git push to deploy |

No database. No login. No unnecessary complexity.
The assignment said don't over-engineer. I listened.

---

## How the API key works

You paste your own Groq key in the settings screen.
It lives in your browser only. Never touches a server
as a stored secret. Every API call sends it as an
`x-groq-key` header. Get a free key at console.groq.com.

---

## Settings

Click ⚙ Settings in the header to open the settings panel.
Everything is editable at runtime:

| Field | Default |
|---|---|
| Suggestions prompt | Optimized v3 routing prompt |
| Chat system prompt | Meeting copilot system prompt |
| Recent context window | 2 chunks (~60s of "right now") |
| Chat context window | 0 = full transcript sent with answers |

Change the prompts live during a session and the next
refresh uses your edits immediately. Reset to defaults
restores all fields to the optimal values.

<img width="499" height="810" alt="image" src="https://github.com/user-attachments/assets/e91a28be-a485-4e9a-a982-6421ebacb3fd" />


---

## Running locally

```bash
git clone https://github.com/avneetxsingh/TwinMind
cd TwinMind/web
npm install
npm run dev
```

Open http://localhost:3000, paste your Groq API key (`gsk_...`),
start talking.

---

## Project structure

```
web/
├── app/
│   ├── api/
│   │   ├── transcribe/route.ts   # Groq Whisper endpoint
│   │   ├── suggestions/route.ts  # Suggestion generation (JSON mode)
│   │   └── chat/route.ts         # Streaming chat completions
│   ├── page.tsx                  # Root — all state lives here
│   └── page.css                  # All styles (single file, intentional)
├── components/
│   ├── ApiKeyGate.tsx            # Key entry + localStorage persistence
│   ├── SettingsDrawer.tsx        # Runtime-editable prompts + context windows
│   ├── TranscriptPane.tsx        # Left column
│   ├── SuggestionsPane.tsx       # Middle column
│   └── ChatPane.tsx              # Right column
└── lib/
    ├── groq.ts                   # Groq client factory
    ├── prompts.ts                # SUGGESTIONS_PROMPT (v3) + CHAT_SYSTEM_PROMPT
    └── types.ts                  # Shared TypeScript types
```

---

## Export

Hit **↓ Export session** in the header at any point to download
a JSON file with:
- Full transcript with timestamps
- Every suggestion batch with timestamps and types
- Full chat history

TwinMind evaluates submissions using this export.
So I made sure it's clean.

```json
{
  "exportedAt": "2026-04-25T...",
  "transcript": [{ "timestamp": "0:30", "text": "..." }],
  "suggestions": [{ "timestamp": "0:30", "suggestions": [...] }],
  "chat": [{ "role": "user", "content": "..." }, ...]
}
```

---

## Tradeoffs

**One prompt vs prompt chaining**
Chaining would give marginally better separation of concerns
but adds latency and complexity. One well-structured prompt
on GPT-OSS 120B handles phase detection, moment detection,
and suggestion selection cleanly in a single pass.

**~60 second recent context window**
Audio chunks every 30 seconds. The recent window sends the
last 2 chunks (~60s) to weight "right now" more heavily than
the full transcript. The prompt instructs the model to treat
claims and questions within this window as the active trigger —
anything older is background context only.

**No streaming on suggestions**
Suggestions return as a single JSON object. Streaming partial
JSON isn't worth the parsing complexity. Chat streams because
that feels responsive. Suggestions don't because the whole
batch lands at once anyway.
