// OPTIONAL: let an LLM write the final answer from the paragraphs the retriever found.
// Not used by the demo page (which uses the deterministic answerer in src/).
//
//   npm install @anthropic-ai/sdk
//   export ANTHROPIC_API_KEY=...        (never commit a key)
//   node llm/answer-llm.js "How many days of annual leave do I get?"
//
// The retriever still decides WHETHER to answer: if it abstains, the LLM is never called.
// The model is told to answer only from the paragraphs and to cite their ids, and the
// reply is checked: any cited id that was not in the retrieved set is rejected.
import { readFileSync } from "node:fs";
import { createEngine } from "../src/index.js";

export const MODEL = "claude-opus-5-5";

export function buildPrompt(question, sources) {
  const context = sources.map((s) => `[${s.id}] (${s.sectionTitle}) ${s.text}`).join("\n");
  return {
    system: "You answer employee questions using ONLY the handbook paragraphs provided. " +
      "Cite the paragraph id in square brackets after every claim, for example [26.2]. " +
      "If the paragraphs do not contain the answer, reply exactly: I don't know. Ask HR. " +
      "Never use outside knowledge and never guess numbers.",
    user: `Handbook paragraphs:\n${context}\n\nQuestion: ${question}`,
  };
}

export function checkCitations(text, sources) {
  const allowed = new Set(sources.map((s) => s.id));
  const cited = [...text.matchAll(/\[(\d+\.\d+)\]/g)].map((m) => m[1]);
  const invalid = cited.filter((c) => !allowed.has(c));
  return { cited, invalid, ok: invalid.length === 0 && (cited.length > 0 || /don't know/i.test(text)) };
}

export async function answerWithLLM(engine, question, { client } = {}) {
  const retrieved = engine.ask(question);
  if (retrieved.status === "abstain") return { ...retrieved, llm: false };
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY to use the LLM step.");
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    client = new Anthropic();
  }
  const { system, user } = buildPrompt(question, retrieved.sources);
  const msg = await client.messages.create({ model: MODEL, max_tokens: 400, system, messages: [{ role: "user", content: user }] });
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const check = checkCitations(text, retrieved.sources);
  if (!check.ok) return { ...retrieved, llm: false, llmRejected: text, reason: "The model's reply cited a paragraph that was not retrieved, so it was discarded." };
  return { ...retrieved, llm: true, answer: text };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const q = process.argv.slice(2).join(" ");
  if (!q) { console.error('Usage: node llm/answer-llm.js "your question"'); process.exit(1); }
  const engine = createEngine(readFileSync(new URL("../data/handbook.md", import.meta.url), "utf8"));
  const r = await answerWithLLM(engine, q);
  console.log(r.status === "abstain" ? r.message : r.answer);
  for (const s of r.sources || []) console.log(`  [${s.id}] ${s.text}`);
}
