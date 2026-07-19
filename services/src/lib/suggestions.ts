import { chatJson } from "./groq";
import { SUGGESTIONS_PROMPT } from "./prompts";

export interface Suggestion {
  type: string;
  preview: string;
  detail_prompt: string;
}

export function buildSuggestionInput(transcripts: string[], last: Suggestion[], recentCount = 2): string {
  return [
    `FULL TRANSCRIPT:\n${transcripts.join("\n")}`,
    `RECENT TRANSCRIPT:\n${transcripts.slice(-recentCount).join("\n")}`,
    `LAST SUGGESTIONS:\n${JSON.stringify(last)}`,
  ].join("\n\n");
}

export async function generateSuggestionsSafe(
  groqKey: string,
  transcripts: string[],
  last: Suggestion[],
): Promise<{ suggestions: Suggestion[]; warning?: string }> {
  try {
    const out = (await chatJson(groqKey, SUGGESTIONS_PROMPT, buildSuggestionInput(transcripts, last))) as {
      suggestions?: Suggestion[];
    };
    if (!Array.isArray(out.suggestions)) throw new Error("malformed model output");
    return { suggestions: out.suggestions };
  } catch (e) {
    console.error("suggestion generation failed", e);
    return { suggestions: [], warning: "suggestions_failed" };
  }
}
