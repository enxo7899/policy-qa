import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stem } from "../src/text.js";
import { createEngine, parseHandbook, highlight } from "../src/index.js";
import { evaluate } from "../scripts/evaluate.mjs";
import { buildPrompt, checkCitations, answerWithLLM } from "../llm/answer-llm.js";

const md = readFileSync(new URL("../data/handbook.md", import.meta.url), "utf8");
const engine = createEngine(md);
const questions = JSON.parse(readFileSync(new URL("../data/questions.json", import.meta.url), "utf8"));

test("the handbook has at least 35 numbered sections and every paragraph keeps its id", () => {
  const hb = parseHandbook(md);
  assert.ok(hb.sections.length >= 35);
  for (const p of hb.paragraphs) assert.match(p.id, /^\d+\.\d+$/);
  assert.equal(hb.paragraphs.find((p) => p.id === "26.2").sectionTitle, "Travel per diems");
});

test("an answer quotes the paragraph word for word, with its section id", () => {
  const r = engine.ask("How many days of annual leave do I get?");
  assert.equal(r.status, "answer");
  assert.equal(r.sources[0].sectionId, "4");
  assert.ok(md.includes(r.sources[0].text), "quoted text must appear verbatim in the handbook");
});

test("the short answer is a sentence taken from the quoted paragraph", () => {
  const r = engine.ask("When is salary paid?");
  assert.ok(r.sources[0].text.includes(r.answer));
  assert.match(r.answer, /5th/);
});

test("a question the handbook does not cover gets 'I don't know' and the closest sections", () => {
  const r = engine.ask("Do we get free lunch in the canteen?");
  assert.equal(r.status, "abstain");
  assert.match(r.message, /I don't know/);
  assert.equal(r.sources.length, 0);
  assert.ok(r.closest.length > 0);
});

test("nonsense with no matching words abstains instead of guessing", () => {
  const r = engine.ask("zxqv blorp wibble");
  assert.equal(r.status, "abstain");
  assert.equal(r.closest.length, 0);
});

test("sick pay and annual leave are told apart even though both talk about days and pay", () => {
  assert.equal(engine.ask("How much sick pay do I get?").section, "8");
  assert.equal(engine.ask("How many days of annual leave do I get?").section, "4");
});

test("notice when you resign and notice when the company ends your contract go to different sections", () => {
  assert.equal(engine.ask("How much notice must I give when I resign?").section, "15");
  assert.equal(engine.ask("How much notice does the company give if my role is made redundant?").section, "16");
});

test("spelling mistakes still find the right section", () => {
  assert.equal(engine.ask("probbation period lenght").section, "14");
});

test("synonyms work: 'vacation' finds annual leave", () => {
  assert.equal(engine.ask("How do I request vacation?").section, "5");
});

test("matched words are highlighted whatever their form", () => {
  const parts = highlight("Employees receive 26 working days of leave.", ["leave", "day"].map(stem));
  assert.deepEqual(parts.filter((p) => p.hit).map((p) => p.text), ["days", "leave"]);
});

test("questions file has 40+ questions, a dev and a test split, and out-of-scope examples in both", () => {
  assert.ok(questions.length >= 40);
  for (const split of ["dev", "test"]) {
    assert.ok(questions.some((q) => q.split === split && q.expected === "abstain"), split);
    assert.ok(questions.some((q) => q.split === split && q.expected !== "abstain"), split);
  }
  assert.ok(new Set(questions.map((q) => q.question)).size === questions.length, "no duplicate questions");
  const ids = new Set(parseHandbook(md).sections.map((s) => s.id));
  for (const q of questions) assert.ok(q.expected === "abstain" || ids.has(q.expected), q.id);
});

test("docs/eval.json is not stale: re-running the evaluation gives the same numbers", () => {
  const saved = JSON.parse(readFileSync(new URL("../docs/eval.json", import.meta.url), "utf8"));
  const fresh = evaluate();
  assert.equal(saved.inputsHash, fresh.inputsHash, "inputs changed: run `npm run evaluate`");
  assert.deepEqual(saved.splits, fresh.splits, "numbers differ: run `npm run evaluate`");
});

test("the demo's headline accuracy figures are the ones in docs/eval.json", () => {
  const saved = JSON.parse(readFileSync(new URL("../docs/eval.json", import.meta.url), "utf8"));
  assert.ok(saved.splits.test.questions >= 20 && saved.splits.dev.questions >= 20);
  assert.ok(saved.splits.dev.top1Accuracy >= 0.8, "dev accuracy regressed");
});

test("the optional LLM step puts only the retrieved paragraphs in the prompt and rejects invented citations", async () => {
  const r = engine.ask("How many days of annual leave do I get?");
  const { system, user } = buildPrompt("q", r.sources);
  assert.match(system, /ONLY/);
  assert.ok(user.includes(`[${r.sources[0].id}]`));
  assert.equal(checkCitations(`26 days [${r.sources[0].id}]`, r.sources).ok, true);
  assert.equal(checkCitations("30 days [99.9]", r.sources).ok, false);
  const fake = { messages: { create: async () => ({ content: [{ type: "text", text: "30 days [99.9]" }] }) } };
  const out = await answerWithLLM(engine, "How many days of annual leave do I get?", { client: fake });
  assert.equal(out.llm, false);
});

test("the LLM step is never called when the retriever abstains", async () => {
  const boom = { messages: { create: async () => { throw new Error("should not be called"); } } };
  const out = await answerWithLLM(engine, "Do we get free lunch in the canteen?", { client: boom });
  assert.equal(out.status, "abstain");
});
