// Shape of a normalized lead — this is what your downstream scrapers consume.
// Keep this flat and stable so the LinkedIn/X scrapers can key off linkedin_url / twitter_url.
export interface Lead {
  // Core fields you asked for
  name: string;
  designation: string | null;
  company: string | null;
  linkedin_url: string | null;
  email: string | null;

  // Useful extras Apollo gives us for free during search
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  headline: string | null;
  seniority: string | null;
  departments: string[];
  city: string | null;
  state: string | null;
  country: string | null;
  company_domain: string | null;
  company_website: string | null;
  twitter_url: string | null;
  github_url: string | null;
  facebook_url: string | null;

  // Apollo internal IDs — needed to enrich later without burning extra credits
  apollo_person_id: string | null;
  apollo_organization_id: string | null;

  // Enrichment state
  email_status: string | null; // "verified" | "likely" | "guessed" | null
  enriched: boolean;

  // Scoring (populated only when --top-n is used)
  score?: number;
  score_breakdown?: string; // "seniority=95; region=100; completeness=90"
}

// What Apollo actually returns (partial, only fields we use).
// Search endpoint gives `people[]`, enrichment gives `person`.
export interface ApolloPerson {
  id: string;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  linkedin_url: string | null;
  title: string | null;
  headline: string | null;
  email: string | null;
  email_status: string | null;
  photo_url: string | null;
  twitter_url: string | null;
  github_url: string | null;
  facebook_url: string | null;
  seniority: string | null;
  departments: string[] | null;
  subdepartments: string[] | null;
  functions: string[] | null;
  city: string | null;
  state: string | null;
  country: string | null;
  organization_id: string | null;
  organization?: {
    id: string;
    name: string | null;
    website_url: string | null;
    primary_domain: string | null;
    linkedin_url: string | null;
    industry: string | null;
  } | null;
  employment_history?: Array<{
    organization_name: string | null;
    title: string | null;
    current: boolean;
    start_date: string | null;
    end_date: string | null;
  }>;
}

export interface ApolloSearchResponse {
  people: ApolloPerson[];
  pagination: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
}

export interface ApolloEnrichResponse {
  person: ApolloPerson;
}

// Search filters — maps 1:1 to Apollo query params, but kept typed
// so callers don't have to remember the snake_case wire format.
export interface SearchFilters {
  // Free-text keyword against name + title + company
  q_keywords?: string;

  // Title filters (OR across array)
  person_titles?: string[]; // e.g. ["CEO", "Founder"]
  person_seniorities?: string[]; // e.g. ["c_suite", "director", "vp"]

  // Location — Apollo accepts "City, State, Country" or just "Country"
  person_locations?: string[]; // e.g. ["United States", "Singapore", "Germany"]

  // Company filters
  organization_names?: string[]; // exact-ish match
  organization_domains?: string[]; // e.g. ["stripe.com"]
  organization_num_employees_ranges?: string[]; // e.g. ["1,10", "11,50"]
  organization_industry_tag_ids?: string[];

  // Pagination
  page?: number; // 1-indexed
  per_page?: number; // max 100
}
