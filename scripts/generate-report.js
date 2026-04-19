import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, unlinkSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// ── CLI Args ──
const args = process.argv.slice(2);
const slug = args.find(a => !a.startsWith('--'));
const skipDiagrams = args.includes('--skip-diagrams');
const tldrOnly = args.includes('--tldr-only');
const fullOnly = args.includes('--full-only');

if (tldrOnly && fullOnly) {
  console.error('Error: --tldr-only and --full-only cannot be used together.');
  process.exit(1);
}

if (!slug) {
  console.error('Usage: node scripts/generate-report.js <slug> [--skip-diagrams] [--tldr-only] [--full-only]');
  process.exit(1);
}

const prospectDir = join(ROOT, 'prospects', slug);
if (!existsSync(prospectDir)) {
  console.error(`Error: Prospect directory not found: prospects/${slug}/`);
  process.exit(1);
}

// ── Read meta.json (or create from markdown) ──
const metaPath = join(prospectDir, 'meta.json');
let meta;

if (existsSync(metaPath)) {
  meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
} else {
  console.warn(`Warning: meta.json not found. Creating from markdown...`);
  meta = extractMetaFromMarkdown(prospectDir, slug);
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  console.log(`Created meta.json for ${slug}`);
}

function extractMetaFromMarkdown(dir, slug) {
  const result = { company_name: slug, slug, date: new Date().toISOString().slice(0, 10), version: '1.0', prepared_by: 'Basalt Consulting AI' };

  // Try TLDR first (has company name in h1)
  const tldrPath = join(dir, '03-tldr.md');
  if (existsSync(tldrPath)) {
    const tldr = readFileSync(tldrPath, 'utf-8');
    const nameMatch = tldr.match(/^# .+?:\s*(.+)$/m);
    if (nameMatch) result.company_name = nameMatch[1].trim();
    const dateMatch = tldr.match(/\*\*Date:\*\*\s*(.+)$/m);
    if (dateMatch) result.date = dateMatch[1].trim();
  }

  // Try action plan for version
  const apPath = join(dir, '04-action-plan.md');
  if (existsSync(apPath)) {
    const ap = readFileSync(apPath, 'utf-8');
    const verMatch = ap.match(/\*\*Version:\*\*\s*(.+)$/m);
    if (verMatch) result.version = verMatch[1].trim();
    // Fallback company name from h2
    if (result.company_name === slug) {
      const h2Match = ap.match(/^## (.+)$/m);
      if (h2Match && !h2Match[1].match(/^\d+\./)) result.company_name = h2Match[1].trim();
    }
  }

  return result;
}

// ── Diagram Rendering ──
const DIAGRAM_SECTIONS = {
  'current-state': 2,
  'ai-opportunity-map': 4,
  'implementation-roadmap': 5,
};

const DIAGRAM_TITLES = {
  'current-state': 'Current State: Lead-to-Delivery Process',
  'ai-opportunity-map': 'AI Opportunity Map',
  'implementation-roadmap': 'Implementation Roadmap',
};

function renderDiagrams() {
  const diagramsDir = join(prospectDir, 'diagrams');
  if (!existsSync(diagramsDir)) return [];

  const themePath = join(ROOT, 'templates', 'mermaid-theme.json');
  const diagrams = [];

  for (const name of Object.keys(DIAGRAM_SECTIONS)) {
    const mdPath = join(diagramsDir, `${name}.md`);
    const svgPath = join(diagramsDir, `${name}.svg`);

    if (!existsSync(mdPath)) {
      console.warn(`Warning: Diagram not found: diagrams/${name}.md — skipping`);
      continue;
    }

    const mdContent = readFileSync(mdPath, 'utf-8');

    // Extract description (text before the mermaid block)
    const descMatch = mdContent.match(/^#.+\n\n(.+?)(?=\n\n```mermaid)/s);
    const description = descMatch ? descMatch[1].trim() : '';

    if (!skipDiagrams) {
      // Check cache freshness
      const mdStat = statSync(mdPath);
      let svgFresh = false;
      if (existsSync(svgPath)) {
        const svgStat = statSync(svgPath);
        svgFresh = svgStat.mtimeMs > mdStat.mtimeMs;
      }

      if (!svgFresh) {
        // Extract mermaid block
        const mermaidMatch = mdContent.match(/```mermaid\n([\s\S]+?)```/);
        if (!mermaidMatch) {
          console.warn(`Warning: No mermaid block in diagrams/${name}.md — skipping`);
          continue;
        }

        const tmpPath = join(diagramsDir, `${name}.tmp.mmd`);
        writeFileSync(tmpPath, mermaidMatch[1]);

        try {
          const mmdc = join(ROOT, 'node_modules', '.bin', 'mmdc');
          execSync(`"${mmdc}" -i "${tmpPath}" -o "${svgPath}" -c "${themePath}" --quiet`, {
            stdio: 'pipe',
            timeout: 30000,
          });
          console.log(`Rendered: diagrams/${name}.svg`);
        } catch (err) {
          console.warn(`Warning: mmdc failed for ${name}: ${err.message}`);
          if (!existsSync(svgPath)) {
            console.warn(`No cached SVG available — skipping diagram`);
            try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {}
            continue;
          }
          console.warn(`Using cached SVG`);
        }

        // Clean up temp file
        try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {}
      } else {
        console.log(`Cached: diagrams/${name}.svg (up to date)`);
      }
    }

    if (existsSync(svgPath)) {
      let svg = readFileSync(svgPath, 'utf-8');
      svg = fixSvgTextClipping(svg);
      diagrams.push({
        name,
        title: DIAGRAM_TITLES[name] || name,
        description,
        section: DIAGRAM_SECTIONS[name],
        svg,
      });
    }
  }

  return diagrams;
}

// ── SVG Post-processing (fix mermaid text clipping) ──
function fixSvgTextClipping(svgContent) {
  // Mermaid's Puppeteer renderer miscalculates text width for web fonts (Inter).
  // Fix: widen each foreignObject by a buffer, and expand the overall SVG to match.

  const BUFFER = 20; // extra px per foreignObject width

  // Widen foreignObject elements
  let svg = svgContent.replace(
    /(<foreignObject[^>]*\s)width="(\d+(?:\.\d+)?)"/g,
    (match, prefix, w) => `${prefix}width="${parseFloat(w) + BUFFER}"`
  );

  // Expand the root SVG width and viewBox to prevent right-side cropping
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

// ── Markdown to HTML ──
function convertMarkdown(mdContent) {
  let html = marked.parse(mdContent, { gfm: true, breaks: false });

  // Post-process: remove standalone <hr> before <h2> since h2 border-top provides the separator
  html = html.replace(/<hr>\s*(<h2)/g, '$1');

  return html;
}

// ── Inject inline diagram thumbnails ──
function injectInlineDiagrams(html, diagrams) {
  if (!diagrams.length) return html;

  for (const d of diagrams) {
    // Match <h2> by section number at start of text content
    const h2Regex = new RegExp(`(<h2[^>]*>\\s*${d.section}\\.\\s)`, 'i');
    const match = html.match(h2Regex);
    if (match) {
      // Find the closing </h2> after the match
      const matchIdx = html.indexOf(match[0]);
      const closingIdx = html.indexOf('</h2>', matchIdx);
      if (closingIdx !== -1) {
        const insertIdx = closingIdx + 5; // after </h2>
        const thumbnail = `
<figure class="diagram-inline" data-diagram="${d.name}">
${d.svg}
<figcaption>${d.title} <span class="click-hint">— click to expand</span></figcaption>
</figure>`;
        html = html.slice(0, insertIdx) + thumbnail + html.slice(insertIdx);
      }
    }
  }
  return html;
}

// ── Read Logo SVG ──
function readLogo() {
  // Use the real PNG logo (black on transparent) and invert with CSS for dark covers
  const pngPath = join(ROOT, 'logo-basalt-transparent.png');
  if (existsSync(pngPath)) {
    const pngData = readFileSync(pngPath).toString('base64');
    return `<img class="cover-logo" src="data:image/png;base64,${pngData}" alt="Basalt Consulting">`;
  }
  console.warn('Warning: logo-basalt-transparent.png not found at project root');
  return '<div class="cover-logo" style="width:240px;height:80px;"></div>';
}

// ── Main Pipeline ──
async function main() {
  const diagrams = renderDiagrams();
  const logoSvg = readLogo();

  // Read template
  const templatePath = join(ROOT, 'templates', 'report.ejs');
  const template = readFileSync(templatePath, 'utf-8');

  // Ensure output directory
  const outDir = join(prospectDir, 'report');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  // Generate TLDR
  if (!fullOnly) {
    const tldrPath = join(prospectDir, '03-tldr.md');
    if (existsSync(tldrPath)) {
      const tldrMd = readFileSync(tldrPath, 'utf-8');
      // Strip the H1 and metadata lines (already in header)
      const tldrContent = tldrMd.replace(/^#[^#].*\n(##\s.*\n)?\n(\*\*.*\n)*\n---\n?/m, '');
      const tldrHtml = convertMarkdown(tldrContent);

      const rendered = ejs.render(template, {
        mode: 'tldr',
        company_name: meta.company_name,
        date: meta.date,
        version: meta.version,
        prepared_by: meta.prepared_by,
        content: tldrHtml,
        diagrams: [],
        toc: [],
        logo_svg: logoSvg,
      });

      writeFileSync(join(outDir, 'tldr.html'), rendered);
      console.log(`Generated: prospects/${slug}/report/tldr.html`);
    } else {
      console.warn('Warning: 03-tldr.md not found — skipping TLDR report');
    }
  }

  // Generate Full Report
  if (!tldrOnly) {
    const apPath = join(prospectDir, '04-action-plan.md');
    if (existsSync(apPath)) {
      const apMd = readFileSync(apPath, 'utf-8');

      // Extract TOC items from markdown (numbered list after "## Table of Contents")
      const toc = [];
      const tocMatch = apMd.match(/## Table of Contents\n\n((?:\d+\..+\n)+)/);
      if (tocMatch) {
        tocMatch[1].trim().split('\n').forEach(line => {
          const m = line.match(/^\d+\.\s+(.+)/);
          if (m) toc.push(m[1].trim());
        });
      }

      // Strip H1, H2 (company name), metadata, and TOC section from content
      let apContent = apMd.replace(/^#[^#].*\n(##[^#].*\n)?\n(\*\*.*\n)*\n---\n?/m, '');
      apContent = apContent.replace(/## Table of Contents\n\n((?:\d+\..+\n)+)\n---\n?/m, '');

      let apHtml = convertMarkdown(apContent);
      apHtml = injectInlineDiagrams(apHtml, diagrams);

      const rendered = ejs.render(template, {
        mode: 'full',
        company_name: meta.company_name,
        date: meta.date,
        version: meta.version,
        prepared_by: meta.prepared_by,
        content: apHtml,
        diagrams,
        toc,
        logo_svg: logoSvg,
      });

      writeFileSync(join(outDir, 'action-plan.html'), rendered);
      console.log(`Generated: prospects/${slug}/report/action-plan.html`);
    } else {
      console.warn('Warning: 04-action-plan.md not found — skipping full report');
    }
  }

  // ── Shareable summaries ──
  const shareableMd = join(prospectDir, '05-shareable.md');
  if (existsSync(shareableMd)) {
    console.log('Generating shareable summaries...');
    try {
      execSync(`node ${join(ROOT, 'scripts', 'generate-shareable.js')} ${slug}`, { stdio: 'inherit' });
    } catch (e) {
      console.warn('Warning: shareable generation failed —', e.message);
    }
  }

  console.log('Done.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
