#!/usr/bin/env node
// Render the same scene as an SVG for PNG export. Keeps geometry in sync with
// the Excalidraw build — but uses crisp SVG (no rough.js) since that's what we
// rasterize to PNG. Hand-drawn feel comes from JetBrains Mono + sketchy accent lines.

import { writeFileSync } from 'node:fs'

const W = 2200
const H = 1260
const ORANGE = '#e8590c'
const BLACK = '#1e1e1e'
const RED = '#c92a2a'
const GREEN = '#2f9e44'
const LIGHT = '#fff4e6'
const GRAY = '#868e96'

const out = []
const push = (s) => out.push(s)

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const tRect = (x, y, w, h, opts = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${opts.fill ?? 'none'}" stroke="${opts.stroke ?? BLACK}" stroke-width="${opts.sw ?? 2}" ${opts.dash ? `stroke-dasharray="${opts.dash}"` : ''}/>`

const tText = (x, y, s, opts = {}) =>
  `<text x="${x}" y="${y}" font-family="${opts.mono ? "'JetBrains Mono', ui-monospace, Menlo, monospace" : "'Kalam', 'Patrick Hand', cursive"}" font-size="${opts.fs ?? 18}" font-weight="${opts.fw ?? 400}" fill="${opts.color ?? BLACK}" ${opts.anchor ? `text-anchor="${opts.anchor}"` : ''}>${esc(s)}</text>`

const tLine = (x1, y1, x2, y2, opts = {}) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${opts.stroke ?? BLACK}" stroke-width="${opts.sw ?? 2}" ${opts.dash ? `stroke-dasharray="${opts.dash}"` : ''} ${opts.marker ? `marker-end="url(#${opts.marker})"` : ''}/>`

const tPoly = (pts, opts = {}) =>
  `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${opts.stroke ?? BLACK}" stroke-width="${opts.sw ?? 2}" ${opts.dash ? `stroke-dasharray="${opts.dash}"` : ''} ${opts.marker ? `marker-end="url(#${opts.marker})"` : ''}/>`

const tDiamond = (cx, cy, w, h, opts = {}) => {
  const pts = [[cx, cy - h / 2], [cx + w / 2, cy], [cx, cy + h / 2], [cx - w / 2, cy]]
  return `<polygon points="${pts.map(p => p.join(',')).join(' ')}" fill="${opts.fill ?? 'none'}" stroke="${opts.stroke ?? BLACK}" stroke-width="${opts.sw ?? 2}"/>`
}

push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`)
push(`<defs>
  <marker id="arrow-black" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${BLACK}"/></marker>
  <marker id="arrow-orange" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${ORANGE}"/></marker>
  <marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${RED}"/></marker>
  <marker id="arrow-green" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${GREEN}"/></marker>
</defs>`)
push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`)
// subtle dot grid
push(`<pattern id="dotgrid" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="16" cy="16" r="0.7" fill="#000" opacity="0.07"/></pattern><rect width="${W}" height="${H}" fill="url(#dotgrid)"/>`)

// Title
push(tText(40, 64, 'Outtro  //  Maker → Checker → Arbiter', { fs: 44, fw: 800, color: BLACK }))
push(tText(40, 100, 'the 3-role AI loop that writes every prospect outreach', { fs: 22, mono: true, color: GRAY }))
push(tLine(40, 120, 900, 120, { stroke: ORANGE, sw: 5 }))

// Pipeline
const stages = ['discovered', 'scored', 'researched', 'drafted', 'sent']
const stageY = 170
const stageH = 88
const stageW = 230
const stageGap = 44
const stageStartX = 60
const judgmental = new Set(['scored', 'drafted'])
const humanGate = new Set(['sent'])

push(tText(stageStartX, stageY - 18, 'THE PIPELINE  //  5 stages', { fs: 16, mono: true, fw: 700, color: BLACK }))

stages.forEach((s, i) => {
  const x = stageStartX + i * (stageW + stageGap)
  const isJ = judgmental.has(s)
  const isH = humanGate.has(s)
  push(tRect(x, stageY, stageW, stageH, { stroke: BLACK, sw: isJ ? 3 : 2, fill: isJ ? LIGHT : 'none' }))
  push(tText(x + 16, stageY + 22, `0${i + 1}`, { fs: 14, mono: true, color: GRAY }))
  push(tText(x + 16, stageY + 52, s, { fs: 28, fw: 700, color: BLACK }))
  if (isJ) push(tText(x + 16, stageY + 78, 'M → C → A', { fs: 14, mono: true, fw: 700, color: ORANGE }))
  if (isH) push(tText(x + 16, stageY + 78, 'human gate', { fs: 14, mono: true, fw: 700, color: RED }))
  if (i < stages.length - 1) {
    const ax = x + stageW
    push(tLine(ax + 4, stageY + stageH / 2, ax + stageGap - 6, stageY + stageH / 2, { sw: 2, marker: 'arrow-black' }))
  }
})

const scoredIdx = stages.indexOf('scored')
const draftedIdx = stages.indexOf('drafted')
const scoredCx = stageStartX + scoredIdx * (stageW + stageGap) + stageW / 2
const draftedCx = stageStartX + draftedIdx * (stageW + stageGap) + stageW / 2
const sentCx = stageStartX + 4 * (stageW + stageGap) + stageW / 2

// Loop section
const loopY = 380
const loopBoxW = 360
const loopBoxH = 200
const loopGap = 72
const totalLoopW = 3 * loopBoxW + 2 * loopGap
const loopStartX = Math.round((W - totalLoopW) / 2) - 120

push(tText(loopStartX, loopY - 40, 'INSIDE A JUDGMENTAL STAGE  //  one attempt', { fs: 18, mono: true, fw: 700, color: BLACK }))
push(tLine(loopStartX, loopY - 26, loopStartX + totalLoopW, loopY - 26, { sw: 1 }))

// dashed connectors from scored/drafted
push(tPoly([[scoredCx, stageY + stageH], [scoredCx, loopY - 70], [loopStartX + totalLoopW / 2, loopY - 70], [loopStartX + totalLoopW / 2, loopY - 44]], { stroke: ORANGE, sw: 2, dash: '6 6', marker: 'arrow-orange' }))
push(tPoly([[draftedCx, stageY + stageH], [draftedCx, loopY - 70], [loopStartX + totalLoopW / 2, loopY - 70]], { stroke: ORANGE, sw: 2, dash: '6 6' }))
push(tText(loopStartX + totalLoopW / 2 - 60, loopY - 80, 'zoom in', { fs: 16, color: ORANGE, fw: 700 }))

// Role boxes
const roles = [
  { title: 'MAKER', persona: 'Siddharth', subrole: 'SDR', verb: 'proposes', bullets: ['drafts content', 'uses persona voice', 'outputs JSON'], accent: ORANGE },
  { title: 'CHECKER', persona: 'Shruti', subrole: 'Skeptic', verb: 'rubric-scores 1-10', bullets: ['scores each dim', 'flags weaknesses', 'suggests revise'], accent: BLACK },
  { title: 'ARBITER', persona: 'Vikram', subrole: 'VP Sales', verb: 'final call', bullets: ['pass / revise / reject', 'can override checker', 'accountable'], accent: RED },
]

roles.forEach((r, i) => {
  const x = loopStartX + i * (loopBoxW + loopGap)
  const y = loopY
  push(tRect(x, y, loopBoxW, loopBoxH, { stroke: r.accent, sw: 3 }))
  push(`<rect x="${x}" y="${y}" width="${loopBoxW}" height="10" fill="${r.accent}"/>`)
  push(tText(x + 16, y + 40, r.title, { fs: 22, mono: true, fw: 800, color: r.accent }))
  push(tText(x + 16, y + 70, `${r.persona}  ·  ${r.subrole}`, { fs: 22, fw: 700, color: BLACK }))
  push(tText(x + 16, y + 96, `"${r.verb}"`, { fs: 16, mono: true, color: GRAY }))
  r.bullets.forEach((b, j) => {
    push(tText(x + 16, y + 128 + j * 22, `·  ${b}`, { fs: 15, mono: true, color: BLACK }))
  })
  if (i < roles.length - 1) {
    const ax = x + loopBoxW
    push(tLine(ax + 6, y + loopBoxH / 2, ax + loopGap - 8, y + loopBoxH / 2, { sw: 3, marker: 'arrow-black' }))
    const lbl = i === 0 ? 'draft →' : 'scores →'
    push(tText(ax + 8, y + loopBoxH / 2 - 12, lbl, { fs: 13, mono: true, color: GRAY }))
  }
})

// Decision diamond
const decisionY = loopY + loopBoxH + 110
const arbiterX = loopStartX + 2 * (loopBoxW + loopGap)
const diamondW = 320
const diamondH = 140
const diamondCx = arbiterX + loopBoxW / 2
const diamondCy = decisionY
push(tDiamond(diamondCx, diamondCy, diamondW, diamondH, { stroke: BLACK, sw: 2, fill: LIGHT }))
push(tText(diamondCx, diamondCy - 10, 'checker ≥ threshold', { fs: 16, mono: true, fw: 700, color: BLACK, anchor: 'middle' }))
push(tText(diamondCx, diamondCy + 14, 'OR arbiter override?', { fs: 16, mono: true, fw: 700, color: BLACK, anchor: 'middle' }))
push(tText(diamondCx, diamondCy + 46, 'GATE', { fs: 22, fw: 800, color: ORANGE, anchor: 'middle' }))

// arrow arbiter -> diamond
push(tLine(arbiterX + loopBoxW / 2, loopY + loopBoxH + 4, diamondCx, diamondCy - diamondH / 2 - 4, { sw: 2, marker: 'arrow-black' }))

// PASS (right)
const passX = diamondCx + diamondW / 2 + 30
const passY = diamondCy - 36
push(tLine(diamondCx + diamondW / 2, diamondCy, passX - 4, passY + 30, { stroke: GREEN, sw: 2, marker: 'arrow-green' }))
push(tRect(passX, passY, 220, 72, { stroke: GREEN, sw: 3 }))
push(tText(passX + 14, passY + 28, 'PASS', { fs: 22, mono: true, fw: 800, color: GREEN }))
push(tText(passX + 14, passY + 56, 'advance stage →', { fs: 14, mono: true, color: BLACK }))

// REVISE (down-left)
const reviseX = diamondCx - diamondW / 2 - 260
const reviseY = diamondCy + diamondH / 2 + 10
push(tLine(diamondCx - 30, diamondCy + diamondH / 2, reviseX + 200 + 4, reviseY + 30, { stroke: ORANGE, sw: 2, marker: 'arrow-orange' }))
push(tRect(reviseX, reviseY, 240, 80, { stroke: ORANGE, sw: 3 }))
push(tText(reviseX + 14, reviseY + 26, 'REVISE', { fs: 22, mono: true, fw: 800, color: ORANGE }))
push(tText(reviseX + 14, reviseY + 50, 'iter++  ·  back to Maker', { fs: 14, mono: true, color: BLACK }))
push(tText(reviseX + 14, reviseY + 70, 'with checker feedback', { fs: 14, mono: true, color: GRAY }))

// Revise feedback loop back to Maker
const makerX = loopStartX
const makerY = loopY
push(tPoly([
  [reviseX + 40, reviseY],
  [reviseX + 40, reviseY - 60],
  [makerX - 30, reviseY - 60],
  [makerX - 30, makerY + loopBoxH / 2],
  [makerX - 4, makerY + loopBoxH / 2],
], { stroke: ORANGE, sw: 2, dash: '8 6', marker: 'arrow-orange' }))
push(tText(reviseX - 30, reviseY - 70, 'next iteration →', { fs: 14, color: ORANGE, fw: 700 }))

// REJECT (down)
const rejectX = diamondCx - 110
const rejectY = diamondCy + diamondH / 2 + 130
push(tLine(diamondCx, diamondCy + diamondH / 2, diamondCx, rejectY - 4, { stroke: RED, sw: 2, marker: 'arrow-red' }))
push(tRect(rejectX, rejectY, 220, 72, { stroke: RED, sw: 3 }))
push(tText(rejectX + 14, rejectY + 28, 'REJECT', { fs: 22, mono: true, fw: 800, color: RED }))
push(tText(rejectX + 14, rejectY + 56, 'max iter reached', { fs: 14, mono: true, color: BLACK }))

// Rubric panel (left)
const rubricX = 60
const rubricY = loopY + loopBoxH + 60
const rubricW = 460
const rubricH = 260
push(tRect(rubricX, rubricY, rubricW, rubricH, { stroke: BLACK, sw: 2 }))
push(tText(rubricX + 14, rubricY + 26, 'RUBRIC  //  why it passed or failed', { fs: 16, mono: true, fw: 700, color: BLACK }))
push(tLine(rubricX, rubricY + 46, rubricX + rubricW, rubricY + 46, { sw: 1 }))
const dims = [
  ['fit', '1-10', 'does the ICP match?'],
  ['signal', '1-10', 'recent trigger / news?'],
  ['hook', '1-10', 'does opener earn the reply?'],
  ['voice', '1-10', 'persona tone intact?'],
  ['specificity', '1-10', 'no generic fluff?'],
]
dims.forEach(([d, scale, g], i) => {
  const y = rubricY + 80 + i * 36
  push(tText(rubricX + 14, y, d, { fs: 20, fw: 700, color: ORANGE }))
  push(tText(rubricX + 160, y, scale, { fs: 14, mono: true, color: GRAY }))
  push(tText(rubricX + 220, y, g, { fs: 14, mono: true, color: BLACK }))
})

// Human gate (bottom-right)
const humanX = passX
const humanY = rejectY + 120
push(tRect(humanX, humanY, 300, 130, { stroke: BLACK, sw: 3, fill: LIGHT }))
push(tText(humanX + 14, humanY + 26, 'HUMAN GATE', { fs: 16, mono: true, fw: 800, color: RED }))
push(tText(humanX + 14, humanY + 58, 'before  sent', { fs: 26, fw: 700, color: BLACK }))
push(tText(humanX + 14, humanY + 86, '·  operator approves', { fs: 14, mono: true, color: BLACK }))
push(tText(humanX + 14, humanY + 108, '·  or edits the draft', { fs: 14, mono: true, color: BLACK }))

// connect sent → human gate
push(tPoly([
  [sentCx, stageY + stageH],
  [sentCx, stageY + stageH + 24],
  [W - 80, stageY + stageH + 24],
  [W - 80, humanY + 60],
  [humanX + 300 + 4, humanY + 60],
], { stroke: RED, sw: 2, dash: '6 6', marker: 'arrow-red' }))

// Footer
push(tLine(40, H - 70, W - 40, H - 70, { sw: 2 }))
push(tText(40, H - 42, 'threshold-gated  ·  persona-named  ·  rubric-transparent  ·  human-approved', { fs: 16, mono: true, fw: 700, color: BLACK }))
push(tText(40, H - 18, 'outtro.ai  ·  every outreach you send, you can defend', { fs: 14, mono: true, color: ORANGE }))

push(`</svg>`)

const outPath = process.argv[2] ?? '/tmp/sketch.svg'
writeFileSync(outPath, out.join('\n'))
console.log('wrote', outPath)
