// Text utilities: tokenising, stop words, a small stemmer and the English synonym list.
// No dependencies; runs in Node and the browser.

export const STOP = new Set(("a an the and or but if of to in on at by for with from as is are was were be been am do does did " +
  "can could should would will shall may might must i me my we our us you your he she it its they their them this that these those " +
  "what which who whom whose when where why how there here about into over under than then so such not no any some also just " +
  "get got have has had much many very more most really please tell know want need ask long").split(" "));

export function normalise(s) {
  return String(s).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "").replace(/ë/g, "e").replace(/ç/g, "c");
}

export function rawTokens(s) {
  return normalise(s).split(/[^a-z0-9]+/).filter(Boolean);
}

// Deliberately small suffix stripper. Good enough for a handbook, easy to read.
export function stem(w) {
  if (w.length <= 3 || /\d/.test(w)) return w;
  const rules = [
    [/ies$/, "y"], [/(ss|us)es$/, "$1"], [/([^s])s$/, "$1"],
    [/ations?$/, "ate"], [/ingly$|edly$/, ""], [/(.{3,})ing$/, "$1"], [/(.{3,})ed$/, "$1"], [/(.{3,})er$/, "$1"],
    [/ly$/, ""], [/ment$/, ""], [/ance$|ence$/, ""],
  ];
  for (const [re, to] of rules) if (re.test(w)) { w = w.replace(re, to); break; }
  w = w.replace(/(.{3,}?)(.)\2$/, "$1$2"); // running -> runn -> run
  w = w.replace(/e$/, "");
  return w;
}

export function tokens(s) {
  return rawTokens(s).filter((t) => !STOP.has(t)).map(stem);
}

// Groups of words that mean the same thing for this handbook. Each word is stemmed when loaded.
// A query word that matches a group also searches for the other members, at half weight.
const GROUPS = [
  ["leave", "vacation", "off"],
  ["sick", "ill", "illness", "unwell", "sickness"],
  ["quit", "resign", "resignation"],
  ["fired", "dismiss", "dismissal", "terminate", "termination", "redundant", "redundancy", "severance", "laid"],
  ["salary", "wage", "paycheck", "payslip"],
  ["allowance", "diem", "stipend"],
  ["trip", "travel", "journey", "abroad"],
  ["remote", "wfh", "home", "telework"],
  ["laptop", "computer", "equipment", "device", "pc"],
  ["phone", "mobile", "sim"],
  ["doctor", "medical", "physician", "certificate", "note"],
  ["manager", "boss", "supervisor", "lead"],
  ["harassment", "bullying", "bully", "discrimination", "harass", "abuse"],
  ["fraud", "wrongdoing", "whistleblow", "whistleblowing", "bribery", "corruption", "anonymous", "anonymously"],
  ["reimburse", "claim", "expense", "refund", "receipt"],
  ["refer", "referral", "recommend"],
  ["death", "die", "died", "dies", "dead", "bereavement", "funeral", "passes", "passed"],
  ["boots", "shoes", "ppe", "vest", "gloves", "protective"],
  ["hotel", "accommodation", "lodging"],
  ["password", "credentials", "login", "passphrase"],
  ["breach", "leak", "leaked", "exposed", "exposure", "stolen"],
  ["fuel", "petrol", "diesel", "gas"],
  ["uniform", "clothes", "clothing", "attire", "wear"],
  ["father", "dad", "paternity", "husband"],
  ["mother", "mom", "maternity", "pregnant", "pregnancy", "baby", "newborn", "birth"],
  ["training", "course", "certification", "certificate", "conference", "exam"],
  ["van", "truck", "vehicle", "car"],
  ["early", "morning"],
  ["overtime", "extra"],
  ["weekend", "saturday", "sunday"],
  ["lose", "lost", "missing", "stolen", "theft"],
  ["accident", "injury", "injured", "hurt", "incident"],
  ["probation", "trial"],
  ["instagram", "facebook", "tiktok", "twitter", "linkedin", "social", "post"],
  ["lift", "lifting", "carry", "heavy", "weight"],
  ["gift", "present", "bribe"],
  ["advance", "loan", "borrow"],
  ["warning", "disciplinary", "reprimand"],
  ["start", "begin"],
  ["wedding", "marriage", "married"],
  ["pensions", "retirement"],
];

export const SYNONYMS = (() => {
  const map = new Map();
  for (const g of GROUPS) {
    const stems = [...new Set(g.map((w) => stem(normalise(w))))];
    for (const s of stems) {
      const set = map.get(s) || new Set();
      for (const o of stems) if (o !== s) set.add(o);
      map.set(s, set);
    }
  }
  return map;
})();

export function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
