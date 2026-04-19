import { linkedinResearch } from '../tools/linkedin-research'
import { linkedinIntel } from '../tools/linkedin-intel'
import { searchProspects } from '../tools/linkedin-search'
import { xresearch } from '../tools/xresearch'
import { sendEmail } from '../tools/resend-send'
import { apolloSearch } from '../tools/apollo-search'
import { linkedinPeopleAtOrg } from '../tools/linkedin-people-at-org'
import { serpApiLinkedInSearch } from '../tools/serpapi-linkedin'

export type ToolFn = (input: any) => Promise<unknown>

export const TOOLS: Record<string, ToolFn> = {
  linkedin_research:      (i) => linkedinResearch(i.profile_url, { light: i.light }),
  linkedin_intel_profile: (i) => linkedinIntel('profile', i.profile_url, i.out_path),
  linkedin_intel_post:    (i) => linkedinIntel('post',    i.post_url,    i.out_path),
  linkedin_intel_company: (i) => linkedinIntel('company', i.company_url, i.out_path),
  linkedin_intel_search:  (i) => linkedinIntel('search',  i.query,       i.out_path),
  linkedin_search_icp:    (i) => searchProspects(i.icp, { pages: i.pages ?? 2 }),
  apollo_search:          (i) => apolloSearch(i),
  linkedin_people_at_org: (i) => linkedinPeopleAtOrg(i),
  serp_linkedin_search:   (i) => serpApiLinkedInSearch(i),
  xresearch:              (i) => xresearch(i.handle),
  resend_send:            (i) => sendEmail(i),
  // Mock fallback for testing without live tools
  mock_echo:              async (i) => ({ echoed: i, at: new Date().toISOString() })
}

export async function runTool(toolId: string, input: unknown): Promise<unknown> {
  const fn = TOOLS[toolId]
  if (!fn) throw new Error(`unknown tool: ${toolId}`)
  return fn(input)
}
