# Graph Report - .  (2026-07-19)

## Corpus Check
- Corpus is ~20,821 words - fits in a single context window. You may not need a graph.

## Summary
- 141 nodes · 168 edges · 14 communities (9 shown, 5 thin omitted)
- Extraction: 90% EXTRACTED · 9% INFERRED · 1% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.82)
- Token cost: 142,569 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_React UI Components|React UI Components]]
- [[_COMMUNITY_NPM Dependencies|NPM Dependencies]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Prompt Design & Routing Strategy|Prompt Design & Routing Strategy]]
- [[_COMMUNITY_Groq API Integration|Groq API Integration]]
- [[_COMMUNITY_UI Reference Mockup|UI Reference Mockup]]
- [[_COMMUNITY_API Route Handlers|API Route Handlers]]
- [[_COMMUNITY_Three-Column App Shell|Three-Column App Shell]]
- [[_COMMUNITY_Root Layout|Root Layout]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_Global Styles|Global Styles]]
- [[_COMMUNITY_Shared Types|Shared Types]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `Structured Reasoning Prompt Strategy` - 8 edges
3. `getGroqClient()` - 7 edges
4. `Step 2: Detect the Moment` - 7 edges
5. `Live Suggestions Column (Pane 2)` - 7 edges
6. `TwinMind Copilot` - 6 edges
7. `Groq GPT-OSS 120B` - 6 edges
8. `scripts` - 5 edges
9. `app/page.tsx` - 5 edges
10. `TranscriptChunk` - 4 edges

## Surprising Connections (you probably didn't know these)
- `POST()` --calls--> `getGroqClient()`  [EXTRACTED]
  web/app/api/chat/route.ts → web/lib/groq.ts
- `POST()` --calls--> `getGroqClient()`  [EXTRACTED]
  web/app/api/suggestions/route.ts → web/lib/groq.ts
- `POST()` --calls--> `getGroqClient()`  [EXTRACTED]
  web/app/api/transcribe/route.ts → web/lib/groq.ts
- `Props` --references--> `ChatMessage`  [EXTRACTED]
  web/components/ChatPane.tsx → web/lib/types.ts
- `Props` --references--> `Suggestion`  [EXTRACTED]
  web/components/SuggestionsPane.tsx → web/lib/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three-Column UI Layout** — readme_transcriptpane_tsx, readme_suggestionspane_tsx, readme_chatpane_tsx [EXTRACTED 1.00]
- **Suggestion Type Routing via Moment Detection** — readme_fact_check, readme_answer, readme_clarification, readme_talking_point, readme_action_item, readme_question [EXTRACTED 1.00]
- **TwinMind Copilot Tech Stack** — readme_nextjs, readme_custom_css, readme_groq_whisper, readme_groq_gpt_oss_120b, readme_vercel [EXTRACTED 1.00]
- **** — image_mic_transcript_column, image_live_suggestions_column, image_chat_column [EXTRACTED 1.00]

## Communities (14 total, 5 thin omitted)

### Community 0 - "React UI Components"
Cohesion: 0.12
Nodes (15): ApiKeyGate(), Props, ChatPane(), Props, DEFAULT_SETTINGS, Props, Settings, Props (+7 more)

### Community 1 - "NPM Dependencies"
Cohesion: 0.09
Nodes (22): dependencies, groq-sdk, next, react, react-dom, devDependencies, eslint, eslint-config-next (+14 more)

### Community 2 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 3 - "Prompt Design & Routing Strategy"
Cohesion: 0.12
Nodes (19): ACTION_ITEM suggestion type, ANSWER suggestion type, Chat Context Window (0 = full transcript), CLARIFICATION suggestion type, FACT_CHECK suggestion type, Five Confirmed Weaknesses of TwinMind, Step 2: Detect the Moment, One Prompt vs Prompt Chaining (+11 more)

### Community 4 - "Groq API Integration"
Cohesion: 0.19
Nodes (13): Groq API Key Handling (x-groq-key header), components/ApiKeyGate.tsx, app/api/chat/route.ts, Custom CSS (page.css), Groq GPT-OSS 120B, lib/groq.ts, Groq Whisper Large V3, Next.js 16.2 + TypeScript (+5 more)

### Community 5 - "UI Reference Mockup"
Cohesion: 0.21
Nodes (12): "Auto-refresh in 30s" Status Label, New-Batch-on-Top Suggestion Stacking Pattern (older batches fade), Chat / Detailed Answers Column (Pane 3), Export Button (planned, not shown in mockup), Live Suggestions Column (Pane 2), Mic Button Idle State ("Click mic to start"), Mic & Transcript Column (Pane 1), TwinMind Live Suggestions Reference Mockup (+4 more)

### Community 6 - "API Route Handlers"
Cohesion: 0.33
Nodes (6): ChatRequestBody, POST(), POST(), SuggestionsRequestBody, POST(), getGroqClient()

### Community 7 - "Three-Column App Shell"
Cohesion: 0.60
Nodes (6): components/ChatPane.tsx, Export Session Feature, app/page.tsx, components/SuggestionsPane.tsx, Three-Column Layout (Transcript / Suggestions / Chat), components/TranscriptPane.tsx

## Ambiguous Edges - Review These
- `"Auto-refresh in 30s" Status Label` → `New-Batch-on-Top Suggestion Stacking Pattern (older batches fade)`  [AMBIGUOUS]
  image.png · relation: conceptually_related_to

## Knowledge Gaps
- **65 isolated node(s):** `ChatRequestBody`, `SuggestionsRequestBody`, `metadata`, `Props`, `Props` (+60 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `"Auto-refresh in 30s" Status Label` and `New-Batch-on-Top Suggestion Stacking Pattern (older batches fade)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `Structured Reasoning Prompt Strategy` connect `Prompt Design & Routing Strategy` to `Groq API Integration`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `Groq GPT-OSS 120B` connect `Groq API Integration` to `Prompt Design & Routing Strategy`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `ChatRequestBody`, `SuggestionsRequestBody`, `metadata` to the rest of the system?**
  _68 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `React UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.12169312169312169 - nodes in this community are weakly interconnected._
- **Should `NPM Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `TypeScript Config` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._