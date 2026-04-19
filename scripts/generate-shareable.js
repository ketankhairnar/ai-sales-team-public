#!/usr/bin/env node

// generate-shareable.js — Reads 05-shareable.md and renders tabbed HTML
//
// Usage: node scripts/generate-shareable.js <slug>
// Output: prospects/<slug>/report/shareable.html

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node scripts/generate-shareable.js <slug>');
  process.exit(1);
}

const prospectDir = path.join(root, 'prospects', slug);
const shareablePath = path.join(prospectDir, '05-shareable.md');
const metaPath = path.join(prospectDir, 'meta.json');

if (!fs.existsSync(shareablePath)) {
  console.error(`Not found: ${shareablePath}`);
  process.exit(1);
}

// Read inputs
const md = fs.readFileSync(shareablePath, 'utf-8');
let meta = { company_name: slug, date: new Date().toISOString().slice(0, 10) };
if (fs.existsSync(metaPath)) {
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } catch (e) {
    console.error(`Warning: malformed meta.json at ${metaPath}: ${e.message}. Using defaults.`);
  }
}

// Parse 05-shareable.md into structured summaries
// Expected format:
//   ### Summary N: <Tab Label>
//   > <message text — possibly multi-line>
//   **Best for:** <guidance text>
//   **Why this angle:** <commentary text — possibly multi-line paragraph>

const summaries = [];

// Split by summary headers
const sections = md.split(/###\s+Summary\s+\d+:\s+/).slice(1);

for (const section of sections) {
  const lines = section.split('\n');
  const tab = lines[0].trim();

  // Extract quoted message
  const msgLines = [];
  let inMsg = false;
  for (const line of lines.slice(1)) {
    if (line.startsWith('>')) { inMsg = true; msgLines.push(line.replace(/^>\s?/, '').trim()); }
    else if (inMsg && line.trim() === '') break;
  }
  const message = msgLines.filter(Boolean).join(' ');

  // Extract "Best for:" line
  const bestForMatch = section.match(/\*\*Best for:\*\*\s*(.+)/);
  const bestFor = bestForMatch ? bestForMatch[1].trim() : '';

  // Extract "Why this angle:" — everything after the marker until next --- or ### or end
  const whyMatch = section.match(/\*\*Why this angle:\*\*\s*([\s\S]*?)(?=\n---|\n###|$)/);
  const why = whyMatch ? whyMatch[1].trim() : '';

  // Assign badge based on tab name keywords
  let badge = 'warm';
  let badgeLabel = 'Warm Intro';
  const lower = tab.toLowerCase();
  if (lower.includes('cold') || lower.includes('goldmine') || lower.includes('recoat') || lower.includes('untapped')) {
    badge = 'cold';
    badgeLabel = 'Cold Outreach';
  } else if (lower.includes('proof') || lower.includes('credib') || lower.includes('social')) {
    badge = 'proof';
    badgeLabel = 'Social Proof';
  } else if (lower.includes('bottleneck') || lower.includes('pain') || lower.includes('quotat')) {
    badge = 'warm';
    badgeLabel = 'Pain Point';
  }

  if (message) summaries.push({ tab, message, best_for: bestFor, why, badge, badge_label: badgeLabel });
}

if (summaries.length === 0) {
  console.error('Could not parse any summaries from 05-shareable.md');
  console.error('Expected format: ### Summary N: <title>\\n\\n> <message>\\n\\n**Best for:** <text>');
  process.exit(1);
}

console.log(`Parsed ${summaries.length} summaries`);

// Logo
const logoPath = path.join(root, 'logo-basalt-transparent.png');
let logoB64 = '';
if (fs.existsSync(logoPath)) {
  logoB64 = fs.readFileSync(logoPath).toString('base64');
}

// Load all diagram SVGs (optional — rendered by generate-report.js)
const diagramNames = ['current-state', 'ai-opportunity-map', 'implementation-roadmap'];
const diagramLabels = {
  'current-state': 'Current Process Flow',
  'ai-opportunity-map': 'AI Opportunity Map',
  'implementation-roadmap': 'Implementation Roadmap'
};
const diagrams = [];
for (const name of diagramNames) {
  const svgPath = path.join(prospectDir, 'diagrams', `${name}.svg`);
  if (fs.existsSync(svgPath)) {
    diagrams.push({
      name,
      label: diagramLabels[name] || name,
      svg: fs.readFileSync(svgPath, 'utf-8')
    });
    console.log(`Including diagram: ${name}`);
  }
}

// Keep backward compat: opportunity_svg for templates that use it
const opportunitySvg = diagrams.find(d => d.name === 'ai-opportunity-map')?.svg || '';

// Render template
const templatePath = path.join(root, 'templates', 'shareable.ejs');
const template = fs.readFileSync(templatePath, 'utf-8');

const html = ejs.render(template, {
  company_name: meta.company_name || slug,
  date: meta.date || new Date().toISOString().slice(0, 10),
  logo_b64: logoB64,
  summaries,
  opportunity_svg: opportunitySvg,
  diagrams
});

// Write output
const reportDir = path.join(prospectDir, 'report');
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

const outPath = path.join(reportDir, 'shareable.html');
fs.writeFileSync(outPath, html);
console.log(`Written: ${outPath}`);
