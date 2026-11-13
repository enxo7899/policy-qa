// Abstain rule. These numbers were chosen by looking at the DEV questions only (see scripts/evaluate.mjs).
export const CONFIG = {
  minScore: 4.5,        // top paragraph must score at least this
  minCoverage: 0.6,  // share of the question's content words (weighted by rarity) found in the top paragraph
  minMargin: 0.005,    // lead over the best paragraph from a DIFFERENT section, as a share of the top score
  strongScore: 16,    // above this score the margin rule is not applied
  coverageWaiverScore: 8.2, // a very strong match is trusted even if some question words are not in the handbook
  unknownPenalty: 0.3, // an unknown word counts against coverage as this share of the rarest possible word
  extraSources: 2,    // extra paragraphs shown when they score within 70% of the best
};
