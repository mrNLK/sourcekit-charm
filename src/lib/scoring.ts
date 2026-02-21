// EEA signal scoring for candidates
// Computes a 0-100 score based on enrichment data score_signals (structured) or fallback regex

interface ScoreSignals {
  has_phd?: boolean;
  top_company?: boolean;
  has_publications?: boolean;
  open_source?: boolean;
  conference_speaker?: boolean;
  has_patents?: boolean;
  leadership_role?: boolean;
  top_university?: boolean;
}

const SIGNAL_WEIGHTS: Record<keyof ScoreSignals, number> = {
  has_phd: 15,
  top_company: 20,
  has_publications: 15,
  open_source: 10,
  conference_speaker: 10,
  has_patents: 10,
  leadership_role: 10,
  top_university: 10,
};

export function computeScore(enrichmentData: any): number {
  if (!enrichmentData) return 0;

  // Prefer structured score_signals from LLM enrichment
  const signals: ScoreSignals | undefined = enrichmentData.score_signals;
  if (signals && typeof signals === "object") {
    let score = 0;
    for (const [key, weight] of Object.entries(SIGNAL_WEIGHTS)) {
      if (signals[key as keyof ScoreSignals]) score += weight;
    }
    // Bonus for 10+ years experience
    if (enrichmentData.experience_years && enrichmentData.experience_years >= 10) {
      score += 5;
    }
    return Math.min(score, 100);
  }

  // Fallback: regex-based scoring for legacy data without score_signals
  return computeScoreFallback(enrichmentData);
}

function computeScoreFallback(enrichmentData: any): number {
  const text = JSON.stringify(enrichmentData).toLowerCase();
  let score = 0;

  if (/\bphd\b|\bdoctorate\b|\bdoctoral\b/.test(text)) score += 15;

  const topCompanies = ["google", "meta", "facebook", "apple", "amazon", "microsoft", "openai", "anthropic", "deepmind", "tesla", "spacex", "neuralink"];
  let companyPoints = 0;
  for (const c of topCompanies) {
    if (text.includes(c)) { companyPoints += 10; if (companyPoints >= 20) break; }
  }
  score += companyPoints;

  const topUnis = ["mit", "stanford", "cmu", "carnegie mellon", "berkeley", "caltech", "harvard", "oxford", "cambridge", "eth zurich", "georgia tech"];
  for (const u of topUnis) { if (text.includes(u)) { score += 10; break; } }

  if (/\bpublication|\bpaper[s]?\b|\bpublished\b|\bjournal\b/.test(text)) score += 15;

  const confs = ["neurips", "icml", "iclr", "cvpr", "aaai", "acl", "emnlp"];
  for (const conf of confs) { if (text.includes(conf)) { score += 10; break; } }

  if (/\bopen.?source\b|\bgithub stars?\b|\bcontributor\b|\bmaintainer\b/.test(text)) score += 10;
  if (/\bpatent[s]?\b/.test(text)) score += 10;
  if (/\bfounder\b|\bcto\b|\bvp\b|\bvice president\b|\bchief\b|\bdirector\b/.test(text)) score += 10;
  if (/\b1[0-9]\+?\s*years?\b|\b2[0-9]\+?\s*years?\b|\bdecade/.test(text)) score += 5;

  return Math.min(score, 100);
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "hsl(160, 100%, 45%)";
  if (score >= 60) return "hsl(48, 100%, 45%)";
  if (score >= 40) return "hsl(30, 100%, 45%)";
  return "hsl(0, 72%, 51%)";
}
