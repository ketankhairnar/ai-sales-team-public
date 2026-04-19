/**
 * Apollo discover tool — calls mixed_people/search, normalizes, client-side scores,
 * returns top-N in the shape the discover stage consumes.
 *
 * Shape match: same keys as linkedin_search_icp mock — {name, title, company, headline, location, profile_url, slug}
 * Plus: apollo_score, apollo_breakdown, email, country, seniority, departments — carried through.
 *
 * Credit safety: uses /mixed_people/search only (free). No enrichment call here.
 */
import { ApolloClient } from './apollo/apollo'
import { apolloToLead } from './apollo/normalize'
import { defaultConfig, topN, type ScoredLead } from './apollo/scoring'
import { MOCK_APOLLO_POOL } from './apollo/mock-pool'
import type { SearchFilters, Lead } from './apollo/types'

export type ApolloDiscoverInput = {
  icp: {
    role?: string
    industry?: string
    company_stage?: string
    keywords?: string[]
  }
  // Caller may override search/scoring; sensible defaults otherwise
  titles?: string[]
  seniorities?: string[]
  locations?: string[]
  max?: number          // over-fetch pool
  top_n?: number        // how many to return
  preferred_countries?: string[]
  title_keywords?: string[]
  departments?: string[]
}

export type DiscoverProspect = {
  name: string
  title: string
  company: string
  headline: string
  location: string
  profile_url: string
  slug: string
  // extras carried through for downstream stages
  email?: string | null
  country?: string | null
  seniority?: string | null
  departments?: string[]
  twitter_url?: string | null
  apollo_person_id?: string | null
  apollo_organization_id?: string | null
  apollo_score?: number
  apollo_breakdown?: string
}

export type ApolloDiscoverOutput = {
  meta: {
    mode: 'apollo-search'
    query: string
    pool_size: number
    top_n: number
    scrape_date: string
    scrape_duration_seconds: number
  }
  prospects: DiscoverProspect[]
}

/** Synthesize a representative-VPEng lead from an Apollo org. Used on free plan. */
function orgToLead(o: any, targetTitle: string): Lead {
  const name = `${targetTitle} @ ${o.name ?? 'unknown'}`
  return {
    name,
    designation: targetTitle,
    company: o.name ?? null,
    linkedin_url: null,
    email: null,
    first_name: null,
    last_name: null,
    title: targetTitle,
    headline: `${targetTitle} at ${o.name}${o.industry ? ` · ${o.industry}` : ''}`,
    seniority: /vp|head|cto|chief/i.test(targetTitle) ? 'vp' : 'director',
    departments: ['engineering'],
    city: o.city ?? null,
    state: o.state ?? null,
    country: o.country ?? null,
    company_domain: o.primary_domain ?? null,
    company_website: o.website_url ?? null,
    twitter_url: o.twitter_url ?? null,
    github_url: null,
    facebook_url: o.facebook_url ?? null,
    apollo_person_id: null,
    apollo_organization_id: o.id ?? null,
    email_status: null,
    enriched: false,
  }
}

function slugFromLinkedIn(url: string | null, fallback: string): string {
  if (!url) return fallback.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const m = url.match(/\/in\/([^/?#]+)/)
  return m?.[1] ?? fallback.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function leadToDiscoverProspect(sl: ScoredLead): DiscoverProspect {
  const l = sl.lead
  const name = l.name || [l.first_name, l.last_name].filter(Boolean).join(' ')
  const location = [l.city, l.state, l.country].filter(Boolean).join(', ')
  const slug = slugFromLinkedIn(l.linkedin_url, name || l.apollo_person_id || 'unknown')
  const breakdownStr = sl.breakdown
    .filter(b => b.weighted !== 0)
    .map(b => `${b.name}=${Math.round(b.raw)}`)
    .join('; ')
  return {
    name,
    title: l.title ?? l.designation ?? '',
    company: l.company ?? '',
    headline: l.headline ?? '',
    location,
    profile_url: l.linkedin_url ?? '',
    slug,
    email: l.email,
    country: l.country,
    seniority: l.seniority,
    departments: l.departments,
    twitter_url: l.twitter_url,
    apollo_person_id: l.apollo_person_id,
    apollo_organization_id: l.apollo_organization_id,
    apollo_score: Math.round(sl.score),
    apollo_breakdown: breakdownStr,
  }
}

export async function apolloSearch(input: ApolloDiscoverInput): Promise<ApolloDiscoverOutput> {
  const apiKey = process.env.APOLLO_API_KEY
  const forceMock = process.env.APOLLO_MOCK === '1'

  const titles = input.titles ?? (input.icp?.role ? [input.icp.role] : ['VP Engineering', 'Head of Engineering', 'CTO'])
  const seniorities = input.seniorities ?? ['vp', 'head', 'director', 'c_suite', 'founder']
  const locations = input.locations ?? []
  const max = input.max ?? 100
  const topNWanted = input.top_n ?? 25

  const t0 = Date.now()
  let pool: Lead[] = []
  let usedMock = false

  if (!apiKey || forceMock) {
    pool = [...MOCK_APOLLO_POOL]
    usedMock = true
  } else {
    const client = new ApolloClient(apiKey)
    // Try people search first (paid plans). Fall back to org search (free plan).
    const filters: SearchFilters = {
      person_titles: titles,
      person_seniorities: seniorities,
      person_locations: locations.length > 0 ? locations : undefined,
      q_keywords: input.icp?.keywords?.join(' ') || input.icp?.industry,
      per_page: 100,
    }
    try {
      for await (const batch of client.searchPeoplePaginated(filters, max)) {
        for (const p of batch) pool.push(apolloToLead(p))
        if (pool.length >= max) break
      }
    } catch (err: any) {
      if (/403|free plan|not accessible/i.test(String(err?.message))) {
        console.warn('[apollo-search] people search gated; falling back to org search')
        try {
          const targetTitle = titles[0] ?? 'VP Engineering'
          const pages = Math.ceil(max / 25)
          for (let page = 1; page <= pages; page++) {
            const res = await client.searchOrganizations({
              q_organization_keyword_tags: input.icp?.keywords?.length ? input.icp.keywords : (input.icp?.industry ? [input.icp.industry] : undefined),
              organization_locations: locations.length > 0 ? locations : undefined,
              per_page: 25,
              page,
            })
            const orgs: any[] = res?.organizations ?? []
            if (orgs.length === 0) break
            for (const o of orgs) pool.push(orgToLead(o, targetTitle))
            if (pool.length >= max) break
            if (page >= (res?.pagination?.total_pages ?? 1)) break
          }
          if (pool.length === 0) {
            pool = [...MOCK_APOLLO_POOL]
            usedMock = true
          }
        } catch (err2: any) {
          console.warn('[apollo-search] org search also failed; using mock:', err2.message)
          pool = [...MOCK_APOLLO_POOL]
          usedMock = true
        }
      } else {
        throw err
      }
    }
  }

  const { config, names } = defaultConfig({
    preferredCountries: input.preferred_countries,
    titleKeywords: input.title_keywords ?? input.icp?.keywords,
    departments: input.departments,
  })
  const scored = topN(pool, config, topNWanted, names)
  const prospects = scored.map(leadToDiscoverProspect)

  return {
    meta: {
      mode: usedMock ? 'apollo-search' : 'apollo-search',
      query: JSON.stringify({ titles, seniorities, locations, mock: usedMock }),
      pool_size: pool.length,
      top_n: prospects.length,
      scrape_date: new Date().toISOString(),
      scrape_duration_seconds: (Date.now() - t0) / 1000,
    },
    prospects,
  }
}
