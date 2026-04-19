/**
 * Mock tool runner — returns plausible canned data. Use for dry-run demos.
 * Data designed to pass Shruti/Vikram scrutiny in hybrid mode.
 */
import type { Prospect } from '../tools/linkedin-search'

const MOCK_PROSPECTS: Prospect[] = [
  {
    name: 'Priya Sharma',
    title: 'VP Platform Engineering',
    company: 'Razorpay',
    headline: 'VP Platform Engineering at Razorpay · Building payment infra for India',
    location: 'Bengaluru, India',
    profile_url: 'https://linkedin.com/in/priya-sharma-razorpay',
    slug: 'priya-sharma-razorpay'
  },
  {
    name: 'David Park',
    title: 'Director of Engineering, Infrastructure',
    company: 'Retool',
    headline: 'Director of Engineering at Retool · Ex-Stripe · Platform & Infra',
    location: 'San Francisco, CA',
    profile_url: 'https://linkedin.com/in/david-park-retool',
    slug: 'david-park-retool'
  },
  {
    name: 'Rahul Iyer',
    title: 'VP Engineering',
    company: 'Postman',
    headline: 'VP Engineering at Postman · Scaling API tooling for 30M+ developers',
    location: 'Bengaluru, India',
    profile_url: 'https://linkedin.com/in/rahul-iyer-postman',
    slug: 'rahul-iyer-postman'
  },
  {
    name: 'Lin Zhao',
    title: 'Head of Platform',
    company: 'Vercel',
    headline: 'Head of Platform at Vercel · Series D · Edge infra at scale',
    location: 'Remote (APAC)',
    profile_url: 'https://linkedin.com/in/lin-zhao-vercel',
    slug: 'lin-zhao-vercel'
  },
  {
    name: 'James OConnell',
    title: 'CTO',
    company: 'Hightouch',
    headline: 'CTO & Co-founder at Hightouch · Series B · Reverse ETL platform',
    location: 'Dublin, Ireland',
    profile_url: 'https://linkedin.com/in/james-oconnell-hightouch',
    slug: 'james-oconnell-hightouch'
  }
]

const MOCK_DOSSIER: Record<string, { hook: string; signals: string[]; evidence: string[] }> = {
  'priya-sharma-razorpay': {
    hook: 'your LinkedIn post last week about sharding the payments database without downtime',
    signals: [
      'Razorpay raised $375M Series F (Dec 2024), valuation $7.5B',
      'hiring 8 platform engineers in Q1 2026 per their careers page',
      'recent post: "three 2am outages taught us more than a year of planning"',
      'team just migrated off vanilla Kafka to Redpanda'
    ],
    evidence: ['LinkedIn post dated 2026-04-10', 'Razorpay engineering blog: sharding case study', 'open job req #ENG-2026-03']
  },
  'david-park-retool': {
    hook: 'your talk at Platform Summit about the "build vs buy" calculus for internal tooling platforms',
    signals: [
      'Retool at Series C, 350+ employees, profitable per 2024 earnings leak',
      'Platform Summit 2026 talk: 2.3K views on YouTube',
      'hiring Staff Platform Engineer (posted 3 weeks ago)',
      'GitHub: 8 commits to internal deploy-automation repo in March'
    ],
    evidence: ['Platform Summit 2026 talk', 'SF Bay Area hiring signal', 'Retool engineering blog']
  },
  'rahul-iyer-postman': {
    hook: 'your engineering post on moving Postman from monolith to event-driven microservices',
    signals: [
      'Postman Series D, 600+ engineers',
      'recent blog: "why we chose NATS over Kafka for our control plane"',
      'hiring VP Infrastructure (Bengaluru) — posted Apr 5',
      'team shipped MCP server for Postman in March'
    ],
    evidence: ['Postman engineering blog 2026-03-22', 'job req', 'product launch']
  },
  'lin-zhao-vercel': {
    hook: 'your Twitter thread on how Vercel cut cold-start latency 60% with isolates',
    signals: [
      'Vercel Series D at $3.3B valuation',
      'Twitter thread hit 12K likes, 2K RTs',
      'hiring 4 Platform Engineers (APAC), Mar 2026',
      'shipped new Functions API in Feb'
    ],
    evidence: ['X thread 2026-03-15', 'Vercel changelog', 'SF hiring board']
  },
  'james-oconnell-hightouch': {
    hook: 'your post on Hightouch\'s pivot from Reverse ETL to full composable CDP',
    signals: [
      'Hightouch Series B, $38M raised, building composable CDP',
      'recent LinkedIn post: "the data warehouse is the new system of record"',
      'hiring Senior Platform Engineer (remote)',
      'acquired two small AI startups Q4 2025'
    ],
    evidence: ['LinkedIn post 2026-04-02', 'TechCrunch funding announcement', 'acquisition press release']
  }
}

export const MOCK_TOOLS: Record<string, (input: any) => Promise<unknown>> = {
  linkedin_search_icp: async (_i) => ({
    meta: { mode: 'search', query: 'mock', pages_fetched: 1, total_raw: MOCK_PROSPECTS.length, total_unique: MOCK_PROSPECTS.length, scrape_date: new Date().toISOString(), scrape_duration_seconds: 0.1 },
    prospects: MOCK_PROSPECTS
  }),
  linkedin_research: async (i) => {
    const slug = i.profile_url?.split('/in/')[1]?.split(/[/?]/)[0] ?? ''
    const d = MOCK_DOSSIER[slug] ?? { hook: 'your recent engineering work', signals: [], evidence: [] }
    return {
      slug,
      hook: d.hook,
      signals: d.signals,
      evidence: d.evidence,
      profile_text_length: 2400,
      scrape_status: { profile: 'ok', activity: 'ok', articles: 'ok' }
    }
  },
  xresearch: async (i) => ({
    handle: i.handle,
    tweets_captured: 42,
    pinned: { text: 'Real-world tweet text would be here' }
  }),
  resend_send: async (i) => ({
    id: 're_mock_' + Math.random().toString(36).slice(2, 10),
    to: i.to,
    sent_at: new Date().toISOString()
  }),
  mock_echo: async (i) => ({ echoed: i }),
}
