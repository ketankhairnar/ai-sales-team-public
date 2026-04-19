#!/usr/bin/env node

// publish-prospect.js — Compiles prospect data into JSON for Astro consumption
//
// Usage:
//   node scripts/publish-prospect.js <slug>            # compile JSON + copy to astro repo
//   node scripts/publish-prospect.js <slug> --deploy    # compile + git add/commit/push

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SITE_ROOT = path.join(process.env.HOME, 'Desktop', 'basalt-site-astro');
const MASTER_PASSWORD = '04march2026';

const DEFAULT_CTA_TEXT = "Let's talk";
const DEFAULT_CTA_URL = 'https://wa.me/919588407935?text=Hi%2C%20I%20saw%20your%20AI%20strategy%20page';

// ── CLI ──
const args = process.argv.slice(2);
const deploy = args.includes('--deploy');
const reindexOnly = args.includes('--reindex-only');
const slug = args.find(a => !a.startsWith('--'));

// Helper: (re)build src/prospects/_index.json from all JSONs in that folder
function rebuildIndex() {
  const prospectsDir = path.join(SITE_ROOT, 'src', 'prospects');
  if (!fs.existsSync(prospectsDir)) {
    console.error(`Error: prospects dir not found at ${prospectsDir}`);
    return 0;
  }
  const files = fs.readdirSync(prospectsDir).filter(
    f => f.endsWith('.json') && f !== '_index.json'
  );
  const entries = [];
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(prospectsDir, f), 'utf-8'));
      const activeIdx = (data.angles || []).findIndex(a => a.active);
      entries.push({
        slug: data.meta.slug,
        name: data.meta.company_name,
        date: data.meta.date,
        active_angle_name: activeIdx >= 0 ? data.angles[activeIdx].name : null,
        angle_count: (data.angles || []).length,
        has_outreach: !!(data.founder && data.founder.outreach),
      });
    } catch (e) {
      console.warn(`  Skipped ${f}: ${e.message}`);
    }
  }
  // Sort by date descending; undated last
  entries.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });
  fs.writeFileSync(
    path.join(prospectsDir, '_index.json'),
    JSON.stringify(entries, null, 2)
  );
  return entries.length;
}

if (reindexOnly) {
  const n = rebuildIndex();
  console.log(`Rebuilt src/prospects/_index.json (${n} prospects)`);
  process.exit(0);
}

if (!slug) {
  console.error('Usage: node scripts/publish-prospect.js <slug> [--deploy]');
  console.error('       node scripts/publish-prospect.js --reindex-only');
  process.exit(1);
}

const prospectDir = path.join(ROOT, 'prospects', slug);
if (!fs.existsSync(prospectDir)) {
  console.error(`Error: Prospect directory not found: prospects/${slug}/`);
  process.exit(1);
}

// ── Validate ──
const metaPath = path.join(prospectDir, 'meta.json');
if (!fs.existsSync(metaPath)) {
  console.error('Error: meta.json not found');
  process.exit(1);
}

const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

for (const field of ['company_name', 'slug', 'password', 'active_angle']) {
  if (meta[field] === undefined || meta[field] === null) {
    console.error(`Error: meta.json missing required field: ${field}`);
    process.exit(1);
  }
}

for (const file of ['03-tldr.md', '04-action-plan.md', '05-shareable.md', '06-prospect-summary.md']) {
  if (!fs.existsSync(path.join(prospectDir, file))) {
    console.error(`Error: Required file not found: ${file}`);
    process.exit(1);
  }
}

console.log(`Publishing: ${meta.company_name} (${slug})`);

// ── SHA-256 ──
function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// ── Annotation marker parsing ──
// Strips ==phrase=={type}, __phrase__{type}, ~~phrase~~{type} from text
// Returns { cleanText, annotations: [{phrase, type}] }
function parseAnnotationMarkers(text) {
  const annotations = [];

  // Pattern: ==phrase=={type} or __phrase__{type} or ~~phrase~~{type}
  const markerRegex = /(?:==(.+?)==|__(.+?)__|~~(.+?)~~)\{(underline|highlight|box|bracket)\}/g;

  let cleanText = text;
  let match;

  // Collect all matches first
  const matches = [];
  while ((match = markerRegex.exec(text)) !== null) {
    const phrase = match[1] || match[2] || match[3];
    const type = match[4];
    matches.push({ full: match[0], phrase, type });
  }

  // Strip markers from text (replace each marker occurrence with just the phrase)
  for (const m of matches) {
    cleanText = cleanText.replace(m.full, m.phrase);
    annotations.push({ phrase: m.phrase, type: m.type });
  }

  return { cleanText, annotations };
}

// ── Parse 05-shareable.md ──
function parseShareables(md) {
  const summaries = [];
  const sections = md.split(/###\s+Summary\s+\d+:\s+/).slice(1);

  for (const section of sections) {
    const lines = section.split('\n');
    const tab = lines[0].trim();

    const msgLines = [];
    let inMsg = false;
    for (const line of lines.slice(1)) {
      if (line.startsWith('>')) { inMsg = true; msgLines.push(line.replace(/^>\s?/, '').trim()); }
      else if (inMsg && line.trim() === '') break;
    }
    const message = msgLines.filter(Boolean).join(' ');

    const bestForMatch = section.match(/\*\*Best for:\*\*\s*(.+)/);
    const bestFor = bestForMatch ? bestForMatch[1].trim() : '';

    const whyMatch = section.match(/\*\*Why this angle:\*\*\s*([\s\S]*?)(?=\n---|\n###|$)/);
    const why = whyMatch ? whyMatch[1].trim() : '';

    let badge = 'warm';
    let badgeLabel = 'Warm Intro';
    const lower = tab.toLowerCase();
    if (lower.includes('cold') || lower.includes('goldmine') || lower.includes('recoat') || lower.includes('untapped')) {
      badge = 'cold'; badgeLabel = 'Cold Outreach';
    } else if (lower.includes('proof') || lower.includes('credib') || lower.includes('social')) {
      badge = 'proof'; badgeLabel = 'Social Proof';
    } else if (lower.includes('bottleneck') || lower.includes('pain') || lower.includes('quotat')) {
      badge = 'warm'; badgeLabel = 'Pain Point';
    }

    if (message) summaries.push({ tab, message, best_for: bestFor, why, badge, badge_label: badgeLabel });
  }

  return summaries;
}

// ── Parse 06-prospect-summary.md with annotation markers ──
function parseProspectSummaries(md) {
  const summaries = [];
  const sections = md.split(/###\s+Angle\s+\d+:\s+/).slice(1);

  for (const section of sections) {
    const lines = section.split('\n');
    const angleName = lines[0].trim();

    const paragraphs = [];
    let currentPara = [];

    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed === '---') {
        if (currentPara.length > 0) {
          paragraphs.push(currentPara.join(' '));
          currentPara = [];
        }
      } else if (!trimmed.startsWith('#')) {
        currentPara.push(trimmed);
      }
    }
    if (currentPara.length > 0) {
      paragraphs.push(currentPara.join(' '));
    }

    // Parse annotation markers from each paragraph
    const parsedParagraphs = paragraphs.map(p => {
      const { cleanText, annotations } = parseAnnotationMarkers(p);
      return { text: cleanText, annotations };
    });

    summaries.push({ angleName, paragraphs: parsedParagraphs });
  }

  return summaries;
}

// ── Markdown to HTML ──
function convertMarkdown(mdContent) {
  let html = marked.parse(mdContent, { gfm: true, breaks: false });
  html = html.replace(/<hr>\s*(<h2)/g, '$1');
  return html;
}

// ── SVG post-processing ──
function fixSvgTextClipping(svgContent) {
  const BUFFER = 20;
  let svg = svgContent.replace(
    /(<foreignObject[^>]*\s)width="(\d+(?:\.\d+)?)"/g,
    (match, prefix, w) => `${prefix}width="${parseFloat(w) + BUFFER}"`
  );
  svg = svg.replace(
    /(<svg[^>]*\s)width="(\d+(?:\.\d+)?)"([^>]*viewBox="[\d.]+\s[\d.]+\s)([\d.]+)(\s[\d.]+)"/,
    (match, pre, w, mid, vbW, post) => {
      const newW = parseFloat(w) + BUFFER * 2;
      const newVbW = parseFloat(vbW) + BUFFER * 2;
      return `${pre}width="${newW}"${mid}${newVbW}${post}"`;
    }
  );
  return svg;
}

// ── Parse 02-analysis.md for opportunity cards ──
function parseOpportunities(md) {
  const opportunities = [];
  // Match "### Opportunity N: Name" sections
  const oppRegex = /###\s+Opportunity\s+(\d+):\s+(.+)/g;
  let match;
  while ((match = oppRegex.exec(md)) !== null) {
    const num = parseInt(match[1]);
    const name = match[2].trim();
    const sectionStart = match.index;
    const nextOppMatch = md.indexOf('### Opportunity', sectionStart + 1);
    const sectionEnd = nextOppMatch > -1 ? nextOppMatch : md.indexOf('## ROI Summary', sectionStart);
    const section = md.slice(sectionStart, sectionEnd > -1 ? sectionEnd : undefined);

    const impactMatch = section.match(/\*\*Impact Level\*\*\s*\|\s*(.+?)(?:\s*\||\s*$)/m);
    const impact = impactMatch ? impactMatch[1].trim() : '';

    const timelineMatch = section.match(/\*\*Timeline[:\*]*\*?\*?\s*\|?\s*(.+?)(?:\s*\||\s*$)/m)
      || section.match(/\*\*Timeline:\*\*\s*(.+)/m);
    const timeline = timelineMatch ? timelineMatch[1].trim() : '';

    opportunities.push({ number: num, name, impact, savings: '', timeline });
  }

  // Try to fill savings from ROI Summary table: "| {name} | Rs X | Rs Y | Rs Z | N months |"
  const roiSection = md.slice(md.indexOf('## ROI Summary'));
  if (roiSection) {
    for (const opp of opportunities) {
      // Match row containing the opportunity name with monthly savings
      const rowRegex = new RegExp(
        opp.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\|\\s*(Rs\\s+[^|]+?)\\s*\\|',
        'm'
      );
      const rowMatch = roiSection.match(rowRegex);
      if (rowMatch) {
        opp.savings = rowMatch[1].trim();
      }
    }
  }

  return opportunities;
}

// ── Parse 07-outreach.md ──
// Extracts each #### ChannelName block's blockquote content as plain text (no formatting).
// Channels expected: LinkedIn Connection Request, LinkedIn Message, Email, Twitter/X DM, WhatsApp Message.
function parseOutreach(md) {
  const channels = [];
  if (!md) return channels;

  // Split on `#### ` (channel headers). Ignore top of file before first header.
  const blocks = md.split(/\n####\s+/).slice(1);
  for (const block of blocks) {
    const lines = block.split('\n');
    const rawHeader = lines[0].trim();
    // Drop any trailing parenthetical (e.g. "LinkedIn Connection Request (≤300 chars)")
    const title = rawHeader.replace(/\s*\(.*?\)\s*$/, '').trim();

    // Classify channel
    let key = null;
    const lower = title.toLowerCase();
    if (lower.includes('connection')) key = 'linkedin_connect';
    else if (lower.includes('linkedin')) key = 'linkedin_message';
    else if (lower.startsWith('email') || lower.includes('subject')) key = 'email';
    else if (lower.includes('twitter') || lower.includes('x dm') || lower.startsWith('x ')) key = 'twitter';
    else if (lower.includes('whatsapp')) key = 'whatsapp';
    else continue; // Unknown section — skip

    // Gather blockquote lines until the next `---`, `####`, or `###` separator
    const bodyLines = [];
    let subject = null;
    for (const rawLine of lines.slice(1)) {
      const line = rawLine.trimEnd();
      if (/^---\s*$/.test(line)) break;
      if (/^####?\s/.test(line)) break;

      // Capture Subject line when present (email pattern)
      const subjMatch = line.match(/^\*\*Subject:\*\*\s*(.+?)\s*$/i);
      if (subjMatch) {
        subject = subjMatch[1].replace(/^["'"]|["'"]$/g, '').trim();
        continue;
      }

      // Only blockquote lines form the body
      if (line.startsWith('> ')) {
        bodyLines.push(line.slice(2));
      } else if (line === '>') {
        bodyLines.push('');
      }
    }

    // Trim leading/trailing blank lines
    while (bodyLines.length && bodyLines[0] === '') bodyLines.shift();
    while (bodyLines.length && bodyLines[bodyLines.length - 1] === '') bodyLines.pop();

    const body = bodyLines.join('\n').trim();
    if (!body) continue;

    const entry = { key, title, body };
    if (subject) entry.subject = subject;
    // Character count is useful for connection requests
    if (key === 'linkedin_connect') {
      entry.char_count = body.length;
      entry.char_limit = 300;
    }
    channels.push(entry);
  }

  return channels;
}

// ── Read content ──
const shareableMd = fs.readFileSync(path.join(prospectDir, '05-shareable.md'), 'utf-8');
const summaryMd = fs.readFileSync(path.join(prospectDir, '06-prospect-summary.md'), 'utf-8');
const tldrMd = fs.readFileSync(path.join(prospectDir, '03-tldr.md'), 'utf-8');
const actionPlanMd = fs.readFileSync(path.join(prospectDir, '04-action-plan.md'), 'utf-8');

// 07-outreach.md is optional (older prospects won't have it)
const outreachPath = path.join(prospectDir, '07-outreach.md');
const outreachChannels = fs.existsSync(outreachPath)
  ? parseOutreach(fs.readFileSync(outreachPath, 'utf-8'))
  : [];

const shareables = parseShareables(shareableMd);
const prospectSummaries = parseProspectSummaries(summaryMd);

// Parse opportunities (optional — file may not exist for older prospects)
const analysisPath = path.join(prospectDir, '02-analysis.md');
const opportunities = fs.existsSync(analysisPath)
  ? parseOpportunities(fs.readFileSync(analysisPath, 'utf-8'))
  : [];

if (shareables.length === 0) {
  console.error('Error: No shareable summaries parsed from 05-shareable.md');
  process.exit(1);
}
if (prospectSummaries.length === 0) {
  console.error('Error: No prospect summaries parsed from 06-prospect-summary.md');
  process.exit(1);
}

// ── Parse hook annotations from shareable messages ──
// Hook text can also have annotation markers
const parsedHooks = shareables.map(s => parseAnnotationMarkers(s.message));

// ── Active angles ──
const activeIdx = (meta.active_angle || 1) - 1;
if (activeIdx < 0 || activeIdx >= shareables.length) {
  console.error(`Error: active_angle ${meta.active_angle} is out of range (1-${shareables.length})`);
  process.exit(1);
}

// active_angles: array of 1-based angle numbers the prospect can see
// Falls back to [active_angle] if not set
const activeAngles = meta.active_angles || [meta.active_angle || 1];
for (const a of activeAngles) {
  if (a < 1 || a > shareables.length) {
    console.error(`Error: active_angles contains ${a}, out of range (1-${shareables.length})`);
    process.exit(1);
  }
}

// ── TLDR and Action Plan HTML ──
let tldrContent = tldrMd.replace(/^#[^#].*\n(##\s.*\n)?\n(\*\*.*\n)*\n---\n?/m, '');
const tldrHtml = convertMarkdown(tldrContent);

let apContent = actionPlanMd.replace(/^#[^#].*\n(##[^#].*\n)?\n(\*\*.*\n)*\n---\n?/m, '');
apContent = apContent.replace(/## Table of Contents\n\n((?:\d+\..+\n)+)\n---\n?/m, '');
const actionPlanHtml = convertMarkdown(apContent);

// ── Read and copy diagrams ──
const diagramsDir = path.join(prospectDir, 'diagrams');
const DIAGRAM_TITLES = {
  'current-state': 'Current State: Lead-to-Delivery Process',
  'ai-opportunity-map': 'AI Opportunity Map',
  'implementation-roadmap': 'Implementation Roadmap',
};

const diagramEntries = [];
let diagramsCopied = 0;

if (fs.existsSync(diagramsDir)) {
  const destDir = path.join(SITE_ROOT, 'public', 'p', meta.slug, 'diagrams');
  fs.mkdirSync(destDir, { recursive: true });

  for (const name of Object.keys(DIAGRAM_TITLES)) {
    const svgPath = path.join(diagramsDir, `${name}.svg`);
    if (fs.existsSync(svgPath)) {
      let svg = fs.readFileSync(svgPath, 'utf-8');
      svg = fixSvgTextClipping(svg);
      fs.writeFileSync(path.join(destDir, `${name}.svg`), svg);
      diagramEntries.push({ name, title: DIAGRAM_TITLES[name], file: `${name}.svg` });
      diagramsCopied++;
    }
  }
}

// ── Count annotations ──
let totalAnnotations = 0;
parsedHooks.forEach(h => { totalAnnotations += h.annotations.length; });
prospectSummaries.forEach(s => {
  s.paragraphs.forEach(p => { totalAnnotations += p.annotations.length; });
});

// ── Build JSON ──
const ctaText = meta.cta_text || DEFAULT_CTA_TEXT;
const ctaUrl = meta.cta_url || DEFAULT_CTA_URL;

const output = {
  meta: {
    company_name: meta.company_name,
    slug: meta.slug,
    date: meta.date,
    password_hash: sha256(meta.password),
    master_hash: sha256(MASTER_PASSWORD),
    prospect_password: meta.password,
    founder_password: MASTER_PASSWORD,
    cta_text: ctaText,
    cta_url: ctaUrl,
  },
  active_angles: activeAngles,
  angles: shareables.map((s, i) => ({
    number: i + 1,
    name: s.tab,
    badge: s.badge,
    badge_label: s.badge_label,
    active: i === activeIdx,
    revealed: activeAngles.includes(i + 1),
    hook: {
      text: parsedHooks[i].cleanText,
      annotations: parsedHooks[i].annotations,
    },
    best_for: s.best_for,
    why: s.why,
    body: prospectSummaries[i] ? prospectSummaries[i].paragraphs : [],
  })),
  opportunities: opportunities.length > 0 ? opportunities : undefined,
  teaser: {
    count: shareables.length - 1,
    text: `We found ${shareables.length - 1} more like this. Happy to share if you're interested.`,
  },
  founder: {
    tldr_html: tldrHtml,
    action_plan_html: actionPlanHtml,
    diagrams: diagramEntries,
    outreach: outreachChannels.length > 0 ? outreachChannels : null,
    hooks: shareables.map((s, i) => ({
      number: i + 1,
      name: s.tab,
      badge_label: s.badge_label,
      message: parsedHooks[i].cleanText,
      best_for: s.best_for,
    })),
  },
  workshop: null,
};

// Check for wizard session
const wizardPath = path.join(prospectDir, '08-wizard-session.md');
if (fs.existsSync(wizardPath)) {
  const wizardMd = fs.readFileSync(wizardPath, 'utf-8');
  const wizardHtml = marked.parse(wizardMd, { gfm: true, breaks: true });
  output.workshop = {
    exists: true,
    html: wizardHtml,
  };
  console.log(`  Found: 08-wizard-session.md → workshop data included`);
}

// ── Write JSON to basalt-site-astro ──
const jsonPath = path.join(SITE_ROOT, 'src', 'prospects', `${meta.slug}.json`);
fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
const jsonStr = JSON.stringify(output, null, 2);
fs.writeFileSync(jsonPath, jsonStr);

const jsonSize = (Buffer.byteLength(jsonStr) / 1024).toFixed(1);

console.log(`  Parsed: ${shareables.length} angles, ${totalAnnotations} annotations, ${diagramsCopied} diagrams`);
if (outreachChannels.length > 0) {
  console.log(`  Parsed: ${outreachChannels.length} outreach channels from 07-outreach.md`);
}
console.log(`  Compiled: src/prospects/${meta.slug}.json (${jsonSize} KB)`);
if (diagramsCopied > 0) {
  console.log(`  Copied: ${diagramsCopied} SVG diagrams to public/p/${meta.slug}/diagrams/`);
}

// ── Always rebuild the prospects index after a publish ──
const indexCount = rebuildIndex();
console.log(`  Rebuilt: src/prospects/_index.json (${indexCount} prospects)`);

// ── Deploy ──
if (deploy) {
  console.log('\n  --deploy: git add + commit + push');
  try {
    const gitFiles = `src/prospects/${meta.slug}.json src/prospects/_index.json`;
    const diagramGlob = `public/p/${meta.slug}/diagrams/`;
    let addCmd = `git add ${gitFiles}`;
    if (diagramsCopied > 0) addCmd += ` ${diagramGlob}`;

    execSync(addCmd, { cwd: SITE_ROOT, stdio: 'pipe' });
    execSync(`git commit -m "prospect: ${meta.slug}"`, { cwd: SITE_ROOT, stdio: 'pipe' });
    execSync('git push', { cwd: SITE_ROOT, stdio: 'pipe' });
    console.log('  Cloudflare will auto-deploy.');
  } catch (e) {
    console.error('  Deploy failed:', e.message);
    process.exit(1);
  }
}

console.log(`\n  Live at: https://basaltconsulting.in/p/${meta.slug}/`);
console.log(`  Passwords: prospect=${meta.password}, founder=${MASTER_PASSWORD}`);
