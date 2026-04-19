import type { ApolloPerson, Lead } from './types';

/**
 * Normalize an Apollo person record to our Lead shape.
 * This is the seam between "what Apollo gives us" and "what our downstream consumes".
 * If Apollo changes their API, you edit this one function.
 */
export function apolloToLead(p: ApolloPerson): Lead {
  const currentJob = p.employment_history?.find((e) => e.current);
  const companyName =
    p.organization?.name ?? currentJob?.organization_name ?? null;

  // Email is only present when enriched. Search results return email: null.
  const hasRealEmail =
    !!p.email &&
    p.email !== 'email_not_unlocked@domain.com' &&
    !p.email.includes('not_unlocked');

  return {
    name: p.name ?? ([p.first_name, p.last_name].filter(Boolean).join(' ') || ''),
    designation: p.title ?? currentJob?.title ?? null,
    company: companyName,
    linkedin_url: p.linkedin_url,
    email: hasRealEmail ? p.email : null,

    first_name: p.first_name,
    last_name: p.last_name,
    title: p.title ?? currentJob?.title ?? null,
    headline: p.headline,
    seniority: p.seniority,
    departments: p.departments ?? [],
    city: p.city,
    state: p.state,
    country: p.country,
    company_domain: p.organization?.primary_domain ?? null,
    company_website: p.organization?.website_url ?? null,
    twitter_url: p.twitter_url,
    github_url: p.github_url,
    facebook_url: p.facebook_url,

    apollo_person_id: p.id,
    apollo_organization_id: p.organization_id ?? p.organization?.id ?? null,

    email_status: p.email_status,
    enriched: hasRealEmail,
  };
}
