// EEA signal scoring for candidates
// Computes a 0-100 score based on enrichment data signal density

const TOP_COMPANIES = [
  "google", "meta", "facebook", "apple", "amazon", "microsoft",
  "openai", "anthropic", "deepmind", "tesla", "spacex", "neuralink",
];

const TOP_UNIVERSITIES = [
  "mit", "stanford", "cmu", "carnegie mellon", "berkeley",
  "caltech", "harvard", "oxford", "cambridge", "eth zurich", "georgia tech",
];

const CONFERENCES = [
  "neurips", "icml", "iclr", "cvpr", "aaai", "acl", "emnlp",
];

export function computeScore(enrichmentData: any): number {
  if (!enrichmentData) return 0;

  const text = JSON.stringify(enrichmentData).toLowerCase();
  let score = 0;

  // PhD or doctorate: +15
  if (/\bphd\b|\bdoctorate\b|\bdoctoral\b/.test(text)) score += 15;

  // Top-tier companies: +10 each, max +20
  let companyPoints = 0;
  for (const c of TOP_COMPANIES) {
    if (text.includes(c)) {
      companyPoints += 10;
      if (companyPoints >= 20) break;
    }
  }
  score += companyPoints;

  // Top-tier university: +10
  for (const u of TOP_UNIVERSITIES) {
    if (text.includes(u)) {
      score += 10;
      break;
    }
  }

  // Publications: +15
  if (/\bpublication|\bpaper[s]?\b|\bpublished\b|\bjournal\b/.test(text)) score += 15;

  // Conferences: +10
  for (const conf of CONFERENCES) {
    if (text.includes(conf)) {
      score += 10;
      break;
    }
  }

  // Open source / GitHub stars: +10
  if (/\bopen.?source\b|\bgithub stars?\b|\bcontributor\b|\bmaintainer\b/.test(text)) score += 10;

  // Patents: +10
  if (/\bpatent[s]?\b/.test(text)) score += 10;

  // Leadership titles: +10
  if (/\bfounder\b|\bcto\b|\bvp\b|\bvice president\b|\bchief\b|\bdirector\b/.test(text)) score += 10;

  // 10+ years experience: +5
  if (/\b1[0-9]\+?\s*years?\b|\b2[0-9]\+?\s*years?\b|\bdecade/.test(text)) score += 5;

  return Math.min(score, 100);
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "hsl(160, 100%, 45%)"; // green / accent
  if (score >= 60) return "hsl(48, 100%, 45%)";  // yellow
  if (score >= 40) return "hsl(30, 100%, 45%)";  // orange
  return "hsl(0, 72%, 51%)";                     // red
}
