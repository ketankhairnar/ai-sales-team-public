/**
 * Dry-run search wrapper: check ICP → query transformation.
 * Does NOT hit LinkedIn. Run: ./node_modules/.bin/tsx src/demo/search-smoke.ts
 */
import { icpToQuery, icpToSearchUrl, type ICP } from '../tools/linkedin-search'
import { TOOLS } from '../runtime/tool-registry'

const icp: ICP = {
  role: 'VP Engineering',
  industry: 'B2B SaaS',
  company_stage: 'Series B',
  keywords: ['platform', 'infrastructure']
}

console.log('== ICP → QUERY SMOKE ==')
console.log('ICP:', JSON.stringify(icp, null, 2))
console.log('Query:', icpToQuery(icp))
console.log('URL:  ', icpToSearchUrl(icp))
console.log('')
console.log('Registered search tool:', 'linkedin_search_icp' in TOOLS ? '✅' : '❌')
console.log('')
console.log('To run LIVE search (uses cookies, opens browser):')
console.log('  ./node_modules/.bin/tsx -e "import(\'./src/tools/linkedin-search.ts\').then(m => m.searchProspects(' + JSON.stringify(icp) + ', { pages: 1 })).then(r => console.log(JSON.stringify(r.meta), r.prospects.length, \'prospects\'))"')
