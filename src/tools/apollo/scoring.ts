import type { Lead } from './types';

/**
 * A ScoreStrategy produces a number for a Lead. Higher = better.
 * Strategies are composed additively with weights in `scoreLeads()`.
 *
 * Why client-side?
 * Apollo's /mixed_people/api_search does NOT expose a sort_by_field parameter
 * in its documented API (their "Match Score" sort is UI-only). So we over-fetch
 * a larger pool, score locally, and keep top N. This also lets you tune
 * scoring to your exact ICP without waiting on the vendor.
 */
export type ScoreStrategy = (lead: Lead) => number;

export interface ScoreConfig {
  strategies: Array<{ strategy: ScoreStrategy; weight: number }>;
}

// ── Individual scoring strategies ──────────────────────────────────────────

/**
 * Seniority score — higher for decision-makers.
 * Apollo's seniority taxonomy: owner, founder, c_suite, partner, vp, head,
 * director, manager, senior, entry, intern.
 */
export const seniorityScore: ScoreStrategy = (lead) => {
  const map: Record<string, number> = {
    owner: 100,
    founder: 100,
    c_suite: 95,
    partner: 90,
    vp: 80,
    head: 75,
    director: 65,
    manager: 45,
    senior: 30,
    entry: 10,
    intern: 0,
  };
  if (!lead.seniority) return 20; // unknown gets a neutral score, not zero
  return map[lead.seniority.toLowerCase()] ?? 20;
};

/**
 * Title keyword boost — catches roles the seniority taxonomy misses.
 * E.g. "Head of AI" might be tagged `head` (75) but we want to boost it
 * higher if AI is our target domain.
 */
export function titleKeywordScore(keywords: string[]): ScoreStrategy {
  const lower = keywords.map((k) => k.toLowerCase());
  return (lead) => {
    const t = (lead.title ?? lead.designation ?? '').toLowerCase();
    if (!t) return 0;
    let hits = 0;
    for (const kw of lower) {
      if (t.includes(kw)) hits++;
    }
    return Math.min(hits * 25, 100);
  };
}

/**
 * Data completeness — penalise leads missing fields you care about.
 * A lead with no LinkedIn URL is useless if LinkedIn is your primary channel.
 */
export const completenessScore: ScoreStrategy = (lead) => {
  let score = 0;
  if (lead.linkedin_url) score += 30;
  if (lead.company) score += 20;
  if (lead.title) score += 15;
  if (lead.city || lead.country) score += 15;
  if (lead.twitter_url) score += 10;
  if (lead.company_domain) score += 10;
  return score;
};

/**
 * Region preference — bump leads in your target regions.
 * Pass an ordered list; earlier entries get higher scores.
 */
export function regionPreferenceScore(preferredCountries: string[]): ScoreStrategy {
  const weights = new Map<string, number>();
  preferredCountries.forEach((c, i) => {
    // First country in list = 100, each subsequent drops by 10, floor at 20
    weights.set(c.toLowerCase(), Math.max(100 - i * 10, 20));
  });
  return (lead) => {
    const country = (lead.country ?? '').toLowerCase();
    return weights.get(country) ?? 0;
  };
}

/**
 * Department match — reward specific departments.
 * Apollo departments: engineering, sales, marketing, finance, operations,
 * product, design, hr, it, legal, customer_service, etc.
 */
export function departmentScore(preferred: string[]): ScoreStrategy {
  const lower = new Set(preferred.map((d) => d.toLowerCase()));
  return (lead) => {
    if (!lead.departments.length) return 0;
    const match = lead.departments.some((d) => lower.has(d.toLowerCase()));
    return match ? 100 : 0;
  };
}

// ── Composition ────────────────────────────────────────────────────────────

export interface ScoredLead {
  lead: Lead;
  score: number;
  breakdown: Array<{ name: string; raw: number; weighted: number }>;
}

/**
 * Score a single lead against a config. Returns both total and breakdown
 * so you can inspect *why* a lead ranked where it did — important when
 * hand-tuning for an ICP.
 */
export function scoreOne(
  lead: Lead,
  config: ScoreConfig,
  strategyNames?: string[],
): ScoredLead {
  let total = 0;
  const breakdown: ScoredLead['breakdown'] = [];
  config.strategies.forEach(({ strategy, weight }, i) => {
    const raw = strategy(lead);
    const weighted = raw * weight;
    total += weighted;
    breakdown.push({
      name: strategyNames?.[i] ?? `strategy_${i}`,
      raw,
      weighted,
    });
  });
  return { lead, score: total, breakdown };
}

/**
 * Score all leads, sort descending, return top N.
 * Attaches strategyNames for human-readable breakdowns.
 */
export function topN(
  leads: Lead[],
  config: ScoreConfig,
  n: number,
  strategyNames?: string[],
): ScoredLead[] {
  const scored = leads.map((l) => scoreOne(l, config, strategyNames));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n);
}

// ── Default preset ─────────────────────────────────────────────────────────

/**
 * Sensible default for B2B outbound: decision-makers, complete data,
 * in your preferred regions. Callers can override per-flag via the CLI.
 */
export function defaultConfig(opts: {
  preferredCountries?: string[];
  titleKeywords?: string[];
  departments?: string[];
}): { config: ScoreConfig; names: string[] } {
  const strategies: ScoreConfig['strategies'] = [
    { strategy: seniorityScore, weight: 1.0 },
    { strategy: completenessScore, weight: 0.5 },
  ];
  const names: string[] = ['seniority', 'completeness'];

  if (opts.preferredCountries?.length) {
    strategies.push({
      strategy: regionPreferenceScore(opts.preferredCountries),
      weight: 0.6,
    });
    names.push('region');
  }
  if (opts.titleKeywords?.length) {
    strategies.push({
      strategy: titleKeywordScore(opts.titleKeywords),
      weight: 0.8,
    });
    names.push('title_keywords');
  }
  if (opts.departments?.length) {
    strategies.push({
      strategy: departmentScore(opts.departments),
      weight: 0.7,
    });
    names.push('department');
  }

  return { config: { strategies }, names };
}
