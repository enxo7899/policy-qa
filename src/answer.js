// The answerer: find the best paragraph, quote it, pull out a short answer sentence, or abstain.
import { parseHandbook } from "./chunker.js";
import { buildIndex, analyseQuery, scoreDocs } from "./bm25.js";
import { CONFIG } from "./config.js";
import { rawTokens, stem } from "./text.js";

export function createEngine(handbookMd, config = {}) {
  const cfg = { ...CONFIG, ...config };
  const hb = parseHandbook(handbookMd);
  const index = buildIndex(hb.paragraphs);
  return { handbook: hb, index, cfg, ask: (q) => ask({ handbook: hb, index, cfg }, q) };
}

export function splitSentences(text) {
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((s) => s.trim()).filter(Boolean);
}

function bestSentence(index, text, q) {
  let best = null;
  for (const s of splitSentences(text)) {
    const stems = new Set(rawTokens(s).map(stem));
    let sc = 0;
    for (const [t, { w }] of q.terms) if (stems.has(t)) sc += w * index.idf(t);
    if (q.wantsNumber && /\d/.test(s)) sc *= 1.3;
    if (!best || sc > best.score) best = { sentence: s, score: sc };
  }
  return best;
}

export function ask(engine, question) {
  const { index, cfg, handbook } = engine;
  const q = analyseQuery(index, question);
  const ranked = scoreDocs(index, q);
  const closest = [];
  const seen = new Set();
  for (const r of ranked) {
    if (seen.has(r.paragraph.sectionId)) continue;
    seen.add(r.paragraph.sectionId);
    closest.push({ sectionId: r.paragraph.sectionId, title: r.paragraph.sectionTitle, paragraphId: r.paragraph.id, score: round(r.score) });
    if (closest.length === 3) break;
  }
  const top = ranked[0];
  const base = { question, closest, terms: [...q.terms.keys()], unknownWords: q.unknown };
  if (!top) return { ...base, status: "abstain", reason: "No words in the question appear in the handbook.", message: "I don't know. Ask HR.", sources: [], score: 0, coverage: 0, margin: 0 };

  // coverage: how much of what was asked (weighted by rarity) is present in the best paragraph
  const topDoc = index.docs.find((d) => d.p.id === top.paragraph.id);
  let have = 0, all = 0;
  for (const w of q.words) {
    const weight = Math.max(...w.stems.map((t) => index.idf(t)));
    all += weight;
    if (w.stems.some((t) => topDoc.tf.has(t))) have += weight;
  }
  all += q.unknown.length * cfg.unknownPenalty * Math.log(1 + index.N);
  const coverage = all ? have / all : 0;
  const other = ranked.find((r) => r.paragraph.sectionId !== top.paragraph.sectionId);
  const margin = other ? (top.score - other.score) / top.score : 1;

  let reason = null;
  if (top.score < cfg.minScore) reason = "The best match is too weak.";
  else if (coverage < cfg.minCoverage && (top.score < cfg.coverageWaiverScore || coverage < 0.25)) reason = "Some words in the question do not appear in the handbook.";
  else if (margin < cfg.minMargin && top.score < cfg.strongScore) reason = "Two different sections match equally well, so I cannot tell which one you mean.";
  const metrics = { score: round(top.score), coverage: round(coverage), margin: round(margin) };
  if (reason) return { ...base, status: "abstain", reason, message: "I don't know. Ask HR.", sources: [], ...metrics };

  const sources = ranked.filter((r, i) => i === 0 || (i <= cfg.extraSources && r.score >= 0.7 * top.score))
    .map((r) => ({ id: r.paragraph.id, sectionId: r.paragraph.sectionId, sectionTitle: r.paragraph.sectionTitle, text: r.paragraph.text, score: round(r.score), matched: r.matched }));
  // the short answer comes from the best sentence across the shown paragraphs; that paragraph is listed first
  let pick = null;
  for (const src of sources) {
    const c = bestSentence(index, src.text, q);
    if (!pick || c.score > pick.score * 1.05) pick = { ...c, id: src.id };
  }
  sources.sort((a, b) => (b.id === pick.id) - (a.id === pick.id));
  return { ...base, status: "answer", answer: pick.sentence, sources, section: top.paragraph.sectionId, ...metrics };
}

const round = (n) => Math.round(n * 100) / 100;

// Splits text into [{text, hit}] so the page can mark the words that matched, whatever their form.
export function highlight(text, terms) {
  const set = new Set(terms);
  const parts = [];
  const re = /[A-Za-zÀ-ɏ0-9]+|[^A-Za-zÀ-ɏ0-9]+/g;
  let m;
  while ((m = re.exec(text))) {
    const w = m[0];
    parts.push({ text: w, hit: /^[A-Za-zÀ-ɏ0-9]/.test(w) && set.has(stem(rawTokens(w)[0] || "")) });
  }
  return parts;
}
