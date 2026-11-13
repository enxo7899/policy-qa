// Measures the answerer on data/questions.json. Writes docs/eval.json.
// Usage: node scripts/evaluate.mjs            (dev + test, writes docs/eval.json)
//        node scripts/evaluate.mjs --dev      (dev only, prints, writes nothing: use this while tuning)
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createEngine } from "../src/index.js";

const root = new URL("..", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

export function inputsHash() {
  const h = createHash("sha256");
  for (const f of ["data/handbook.md", "data/questions.json", "src/text.js", "src/chunker.js", "src/bm25.js", "src/answer.js", "src/config.js"]) h.update(f + "\n" + read(f));
  return h.digest("hex").slice(0, 16);
}

export function evaluate() {
  const engine = createEngine(read("data/handbook.md"));
  const questions = JSON.parse(read("data/questions.json"));
  const result = { generatedBy: "node scripts/evaluate.mjs", inputsHash: inputsHash(), config: engine.cfg, splits: {} };
  for (const split of ["dev", "test"]) {
    const qs = questions.filter((q) => q.split === split);
    const rows = qs.map((q) => {
      const r = engine.ask(q.question);
      const predicted = r.status === "abstain" ? "abstain" : r.section;
      return { id: q.id, question: q.question, kind: q.kind, expected: q.expected, predicted, status: r.status, ok: predicted === q.expected,
        score: r.score, coverage: r.coverage, margin: r.margin, closest: r.closest.map((c) => c.sectionId) };
    });
    const inScope = rows.filter((r) => r.expected !== "abstain");
    const oos = rows.filter((r) => r.expected === "abstain");
    const abstained = rows.filter((r) => r.status === "abstain");
    const correctAbstain = abstained.filter((r) => r.expected === "abstain");
    const answered = rows.filter((r) => r.status === "answer");
    const frac = (n, d) => (d ? Math.round((n / d) * 1000) / 1000 : null);
    result.splits[split] = {
      questions: rows.length, inScope: inScope.length, outOfScope: oos.length,
      top1Correct: inScope.filter((r) => r.ok).length,
      top1Accuracy: frac(inScope.filter((r) => r.ok).length, inScope.length),
      answeredCorrectly: answered.filter((r) => r.ok).length,
      precisionOfAnswers: frac(answered.filter((r) => r.ok).length, answered.length),
      abstainPrecision: frac(correctAbstain.length, abstained.length),
      abstainRecall: frac(correctAbstain.length, oos.length),
      wronglyAbstained: inScope.filter((r) => r.status === "abstain").length,
      wronglyAnswered: oos.filter((r) => r.status === "answer").length,
      overallCorrect: rows.filter((r) => r.ok).length,
      rows,
    };
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = evaluate();
  if (process.argv.includes("--dev")) {
    const d = res.splits.dev;
    for (const r of d.rows.filter((r) => !r.ok)) console.log("MISS", r.id, r.question, "| expected", r.expected, "got", r.predicted, "| closest", r.closest.join(","), "| s/c/m", r.score, r.coverage, r.margin);
    const { rows, ...sum } = d; console.log(sum);
  } else {
    writeFileSync(new URL("docs/eval.json", root), JSON.stringify(res, null, 1) + "\n");
    for (const s of ["dev", "test"]) { const { rows, ...sum } = res.splits[s]; console.log(s, sum); }
  }
}
