import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { CampDetail, ResearchFact } from "../types";
import { templateSummary, validateAiOutput, type DraftSummary } from "./summarize";

const MODEL = "claude-opus-5-5";

const SYSTEM = `You write short, neutral research notes about youth sports recruiting camps for parents.
Rules:
- Use ONLY the numbered facts provided. Do not add outside knowledge, guesses, or assumptions.
- End every sentence of "summary" with the fact IDs it relies on, like [F1] or [F2][F5].
- Keep facts, advertised claims, community opinions, and external sources clearly distinguished in wording
  (e.g. "the organizer advertises...", "community reviewers rated...").
- Never write as if you attended. Never describe this as a review.
- Never claim or imply a camp guarantees recruiting exposure, scholarship offers, or roster spots.
- "considerations" are 2-5 practical tradeoffs a parent should weigh, grounded in the facts.
Respond with JSON only: {"summary": string, "considerations": string[]}`;

/**
 * AI-assisted research summary. Falls back to the template if AI is not configured,
 * refuses, or returns output that fails citation validation. Results are saved as
 * drafts and require admin approval before anyone sees them.
 */
export async function draftResearchSummary(camp: CampDetail, facts: ResearchFact[]): Promise<DraftSummary> {
  if (!process.env.ANTHROPIC_API_KEY) return templateSummary(camp, facts);
  const client = new Anthropic();
  const factList = facts.map((f) => `${f.id} (${f.kind.replace("_", " ")}): ${f.text}`).join("\n");
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      // Server-side fallback if the primary model declines.
      ...({ fallbacks: "default" } as Record<string, unknown>),
      messages: [{ role: "user", content: `Facts about "${camp.name}":\n${factList}` }],
    });
    if (response.stop_reason === "refusal") return templateSummary(camp, facts);
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const valid = validateAiOutput(json, facts);
    if (!valid) return templateSummary(camp, facts);
    return { ...valid, method: "ai_assisted", model: response.model ?? MODEL };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.APIConnectionError) {
      console.warn("AI research unavailable, using template:", (e as Error).message);
    } else if (e instanceof Anthropic.APIError) {
      console.error("AI research request failed:", e.status, e.message);
    } else {
      console.error("AI research output could not be parsed:", (e as Error).message);
    }
    return templateSummary(camp, facts);
  }
}
