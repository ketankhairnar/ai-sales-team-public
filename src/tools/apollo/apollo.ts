import axios, { AxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import pLimit from 'p-limit';
import type {
  ApolloPerson,
  ApolloSearchResponse,
  ApolloEnrichResponse,
  SearchFilters,
} from './types';

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

export class ApolloClient {
  private http: AxiosInstance;
  // Cap concurrent requests — Apollo free tier is easy to rate-limit.
  // 3 concurrent is safe; bump to 5-10 on paid plans.
  private limit = pLimit(3);

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error(
        'Apollo API key is required. Set APOLLO_API_KEY in .env or pass --api-key.',
      );
    }
    this.http = axios.create({
      baseURL: APOLLO_BASE,
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Api-Key': apiKey,
      },
      timeout: 30_000,
    });
  }

  /**
   * Search for people in Apollo's DB. Does NOT consume credits.
   * Does NOT return emails — call enrichPerson() afterwards for that.
   *
   * Hard caps (Apollo side):
   *  - 100 results per page
   *  - 500 pages max (50,000 records per search)
   */
  async searchPeople(filters: SearchFilters): Promise<ApolloSearchResponse> {
    const params = this.buildSearchParams(filters);
    return this.limit(async () => {
      try {
        const res = await this.http.post<ApolloSearchResponse>(
          '/mixed_people/search',
          params,
        );
        return res.data;
      } catch (err) {
        throw this.wrapError(err, 'searchPeople');
      }
    });
  }

  /**
   * Search organizations. Accessible on free plan.
   * Returns firmographic data: domain, linkedin_url, industry, employee count,
   * keywords, headcount growth signals, location.
   */
  async searchOrganizations(params: {
    q_organization_name?: string;
    q_organization_keyword_tags?: string[];
    organization_locations?: string[];
    organization_num_employees_ranges?: string[];
    page?: number;
    per_page?: number;
  }): Promise<{ organizations: any[]; pagination: { page: number; total_pages: number; total_entries: number } }> {
    return this.limit(async () => {
      try {
        const body: Record<string, unknown> = {
          page: params.page ?? 1,
          per_page: Math.min(params.per_page ?? 25, 100),
        };
        if (params.q_organization_name) body.q_organization_name = params.q_organization_name;
        if (params.q_organization_keyword_tags?.length) body.q_organization_keyword_tags = params.q_organization_keyword_tags;
        if (params.organization_locations?.length) body.organization_locations = params.organization_locations;
        if (params.organization_num_employees_ranges?.length) body.organization_num_employees_ranges = params.organization_num_employees_ranges;
        const res = await this.http.post('/organizations/search', body);
        return res.data as any;
      } catch (err) {
        throw this.wrapError(err, 'searchOrganizations');
      }
    });
  }

  /**
   * Paginated search — walks all pages up to `maxResults`.
   * Yields batches so the caller can stream to CSV without buffering everything.
   */
  async *searchPeoplePaginated(
    filters: SearchFilters,
    maxResults: number,
  ): AsyncGenerator<ApolloPerson[], void, unknown> {
    const perPage = Math.min(filters.per_page ?? 100, 100);
    let page = filters.page ?? 1;
    let collected = 0;

    while (collected < maxResults) {
      const res = await this.searchPeople({ ...filters, page, per_page: perPage });
      if (!res.people || res.people.length === 0) break;

      const remaining = maxResults - collected;
      const batch = res.people.slice(0, remaining);
      yield batch;

      collected += batch.length;

      if (page >= res.pagination.total_pages) break;
      if (page >= 500) break; // Apollo hard cap
      page += 1;
    }
  }

  /**
   * Enrich a single person — returns email if Apollo has one for them.
   * THIS CONSUMES CREDITS. One credit per reveal on most plans.
   *
   * You can pass any subset: email, linkedin_url, first+last+company, etc.
   * More signals = higher match rate.
   */
  async enrichPerson(input: {
    first_name?: string;
    last_name?: string;
    name?: string;
    email?: string;
    linkedin_url?: string;
    organization_name?: string;
    domain?: string;
    reveal_personal_emails?: boolean;
    reveal_phone_number?: boolean;
  }): Promise<ApolloPerson | null> {
    return this.limit(async () => {
      try {
        const res = await this.http.post<ApolloEnrichResponse>(
          '/people/match',
          {
            reveal_personal_emails: input.reveal_personal_emails ?? false,
            reveal_phone_number: input.reveal_phone_number ?? false,
            ...input,
          },
        );
        return res.data.person ?? null;
      } catch (err) {
        // Treat 404/no-match as null rather than throwing — downstream code
        // wants to continue processing the batch.
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          return null;
        }
        throw this.wrapError(err, 'enrichPerson');
      }
    });
  }

  private buildSearchParams(filters: SearchFilters): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (filters.q_keywords) out.q_keywords = filters.q_keywords;
    if (filters.person_titles?.length) out.person_titles = filters.person_titles;
    if (filters.person_seniorities?.length)
      out.person_seniorities = filters.person_seniorities;
    if (filters.person_locations?.length) out.person_locations = filters.person_locations;
    if (filters.organization_names?.length)
      out.organization_names = filters.organization_names;
    if (filters.organization_domains?.length)
      out.q_organization_domains = filters.organization_domains.join('\n');
    if (filters.organization_num_employees_ranges?.length)
      out.organization_num_employees_ranges =
        filters.organization_num_employees_ranges;
    if (filters.organization_industry_tag_ids?.length)
      out.organization_industry_tag_ids = filters.organization_industry_tag_ids;
    out.page = filters.page ?? 1;
    out.per_page = Math.min(filters.per_page ?? 100, 100);
    return out;
  }

  private wrapError(err: unknown, context: string): Error {
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      const body = err.response?.data;
      const msg =
        typeof body === 'object' && body !== null && 'error' in body
          ? (body as { error: string }).error
          : err.message;
      return new Error(
        `Apollo ${context} failed [${status ?? 'network'}]: ${msg}`,
      );
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
