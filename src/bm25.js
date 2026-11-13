// BM25 over paragraphs, with stemming, synonyms (half weight) and one-or-two-letter typo repair.
import { tokens, rawTokens, stem, STOP, SYNONYMS, editDistance } from "./text.js";

export function buildIndex(paragraphs, { k1 = 1.4, b = 0.5, titleBoost = 2 } = {}) {
  const docs = paragraphs.map((p) => {
    const terms = [...tokens(p.text)];
    const tt = tokens(p.sectionTitle);
    for (let i = 0; i < titleBoost; i++) terms.push(...tt);
    const tf = new Map();
    for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
    return { p, tf, len: terms.length };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const avgLen = docs.reduce((a, d) => a + d.len, 0) / docs.length;
  const N = docs.length;
  const idf = (t) => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
  return { docs, df, N, avgLen, k1, b, idf, vocab: [...df.keys()] };
}

// Turn a question into weighted search terms.
export function analyseQuery(index, query) {
  const terms = new Map(); // stem -> {w, via}
  const unknown = [];
  const words = []; // one entry per question word: the stems that would satisfy it
  const add = (t, w, via) => { const o = terms.get(t); if (!o || o.w < w) terms.set(t, { w, via }); };
  for (const raw of rawTokens(query)) {
    if (STOP.has(raw)) continue;
    let s = stem(raw);
    let known = index.df.has(s);
    if (!known && !SYNONYMS.has(s) && !/\d/.test(raw) && raw.length >= 4) {
      const max = raw.length >= 8 ? 2 : 1;
      let best = null, bestD = max + 1;
      for (const v of index.vocab) {
        const d = editDistance(s, v, max);
        if (d < bestD || (d === bestD && best && index.df.get(v) > index.df.get(best))) { best = v; bestD = d; }
      }
      if (best && bestD <= max) { s = best; known = true; }
    }
    const syn = SYNONYMS.get(s);
    if (known) add(s, 1, "word");
    if (syn) for (const o of syn) if (index.df.has(o)) add(o, 0.5, "synonym");
    const alts = [...(known ? [s] : []), ...(syn ? [...syn].filter((o) => index.df.has(o)) : [])];
    if (alts.length) words.push({ raw, stems: alts }); else unknown.push(raw);
  }
  const wantsNumber = /\b(how (many|much|long|early|late|big|often|old)|maximum|minimum|limit|percent|amount)\b/i.test(query);
  return { terms, unknown, words, wantsNumber };
}

export function scoreDocs(index, q) {
  const out = [];
  for (const d of index.docs) {
    let score = 0;
    const matched = [];
    for (const [t, { w }] of q.terms) {
      const f = d.tf.get(t);
      if (!f) continue;
      const norm = f * (index.k1 + 1) / (f + index.k1 * (1 - index.b + index.b * d.len / index.avgLen));
      score += w * index.idf(t) * norm;
      matched.push(t);
    }
    if (q.wantsNumber && /\d/.test(d.p.text)) score *= 1.2; // a 'how many / how much' question wants a figure
    if (score > 0) out.push({ paragraph: d.p, score, matched });
  }
  return out.sort((a, b) => b.score - a.score);
}
