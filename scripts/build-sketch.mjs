#!/usr/bin/env node
// Build an Excalidraw JSON describing Outtro's Maker/Checker/Arbiter pipeline sketchnote.
// Hand-drawn brutalist feel: sketchy strokes, monospace-ish (Virgil/hand) text, black on white
// with orange accent. Single-frame wide layout.

import { writeFileSync } from 'node:fs'

let idCounter = 0
const nid = () => `el-${++idCounter}`

const base = () => ({
  id: nid(),
  seed: Math.floor(Math.random() * 2 ** 31),
  version: 1,
  versionNonce: Math.floor(Math.random() * 2 ** 31),
  isDeleted: false,
  fillStyle: 'hachure',
  strokeWidth: 1,
  strokeStyle: 'solid',
  roughness: 1,
  opacity: 100,
  angle: 0,
  strokeColor: '#000000',
  backgroundColor: 'transparent',
  groupIds: [],
  frameId: null,
  roundness: null,
  boundElements: null,
  updated: Date.now(),
  link: null,
  locked: false,
  customData: null,
})

const rect = (x, y, w, h, opts = {}) => ({
  ...base(),
  type: 'rectangle',
  x, y, width: w, height: h,
  strokeColor: opts.stroke ?? '#000000',
  backgroundColor: opts.fill ?? 'transparent',
  fillStyle: opts.fillStyle ?? 'hachure',
  strokeWidth: opts.strokeWidth ?? 2,
  strokeStyle: opts.strokeStyle ?? 'solid',
  roughness: opts.roughness ?? 1,
})

const ellipse = (x, y, w, h, opts = {}) => ({
  ...base(),
  type: 'ellipse',
  x, y, width: w, height: h,
  strokeColor: opts.stroke ?? '#000000',
  backgroundColor: opts.fill ?? 'transparent',
  fillStyle: opts.fillStyle ?? 'hachure',
  strokeWidth: opts.strokeWidth ?? 2,
})

const diamond = (x, y, w, h, opts = {}) => ({
  ...base(),
  type: 'diamond',
  x, y, width: w, height: h,
  strokeColor: opts.stroke ?? '#000000',
  backgroundColor: opts.fill ?? 'transparent',
  fillStyle: opts.fillStyle ?? 'hachure',
  strokeWidth: opts.strokeWidth ?? 2,
})

const text = (x, y, str, opts = {}) => ({
  ...base(),
  type: 'text',
  x, y,
  width: opts.width ?? Math.max(8 * str.length, 40),
  height: opts.height ?? (opts.fontSize ?? 20) * 1.2,
  text: str,
  originalText: str,
  fontSize: opts.fontSize ?? 20,
  fontFamily: opts.fontFamily ?? 1, // 1 = Virgil (hand), 3 = Cascadia (mono)
  textAlign: opts.textAlign ?? 'left',
  verticalAlign: opts.verticalAlign ?? 'top',
  strokeColor: opts.color ?? '#000000',
  containerId: null,
  lineHeight: 1.25,
  baseline: (opts.fontSize ?? 20) * 0.9,
})

const line = (points, opts = {}) => {
  const xs = points.map(p => p[0])
  const ys = points.map(p => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {
    ...base(),
    type: opts.type ?? 'line',
    x, y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
    points: points.map(p => [p[0] - x, p[1] - y]),
    strokeColor: opts.stroke ?? '#000000',
    strokeWidth: opts.strokeWidth ?? 2,
    strokeStyle: opts.strokeStyle ?? 'solid',
    roughness: opts.roughness ?? 1,
    startArrowhead: opts.startArrow ?? null,
    endArrowhead: opts.endArrow ?? (opts.type === 'arrow' ? 'arrow' : null),
    lastCommittedPoint: null,
  }
}

const arrow = (points, opts = {}) => line(points, { ...opts, type: 'arrow', endArrow: opts.endArrow ?? 'arrow' })

const ORANGE = '#e8590c' // Excalidraw-friendly orange
const BLACK = '#1e1e1e'
const RED = '#c92a2a'
const GREEN = '#2f9e44'
const LIGHT = '#fff4e6'
const GRAY = '#868e96'

const els = []

// --- Canvas logical coords. Keep coords large so it feels like a wide LinkedIn canvas.
// Approx bounds: x [0..2400], y [0..1200]

// Title block
els.push(text(40, 30, 'Outtro  //  Maker → Checker → Arbiter', { fontSize: 42, fontFamily: 1, color: BLACK }))
els.push(text(40, 88, 'the 3-role AI loop that writes every prospect outreach', { fontSize: 22, fontFamily: 3, color: GRAY }))
els.push(line([[40, 130], [780, 130]], { stroke: ORANGE, strokeWidth: 4 }))

// --- 5-stage pipeline strip (top row)
const stages = ['discovered', 'scored', 'researched', 'drafted', 'sent']
const stageY = 170
const stageH = 80
const stageW = 220
const stageGap = 40
const stageStartX = 60

const judgmental = new Set(['scored', 'drafted'])
const humanGate = new Set(['sent'])

els.push(text(stageStartX, stageY - 32, 'THE PIPELINE  //  5 stages', { fontSize: 16, fontFamily: 3, color: BLACK }))

stages.forEach((s, i) => {
  const x = stageStartX + i * (stageW + stageGap)
  const isJ = judgmental.has(s)
  const isH = humanGate.has(s)
  els.push(rect(x, stageY, stageW, stageH, {
    stroke: BLACK,
    fill: isJ ? LIGHT : 'transparent',
    fillStyle: isJ ? 'hachure' : 'solid',
    strokeWidth: isJ ? 3 : 2,
  }))
  els.push(text(x + 16, stageY + 18, `0${i + 1}`, { fontSize: 14, fontFamily: 3, color: GRAY }))
  els.push(text(x + 16, stageY + 38, s, { fontSize: 26, fontFamily: 1, color: BLACK }))
  if (isJ) {
    els.push(text(x + 16, stageY + stageH - 22, 'M → C → A', { fontSize: 14, fontFamily: 3, color: ORANGE }))
  }
  if (isH) {
    els.push(text(x + 16, stageY + stageH - 22, 'human gate', { fontSize: 14, fontFamily: 3, color: RED }))
  }
  if (i < stages.length - 1) {
    const ax = x + stageW
    els.push(arrow([[ax + 4, stageY + stageH / 2], [ax + stageGap - 4, stageY + stageH / 2]], { stroke: BLACK, strokeWidth: 2 }))
  }
})

// Callout lines from judgmental stages down to the loop
const scoredIdx = stages.indexOf('scored')
const draftedIdx = stages.indexOf('drafted')
const scoredCx = stageStartX + scoredIdx * (stageW + stageGap) + stageW / 2
const draftedCx = stageStartX + draftedIdx * (stageW + stageGap) + stageW / 2

// --- The M/C/A loop (big centerpiece, mid section)
const loopY = 360
const loopBoxW = 340
const loopBoxH = 180
const loopGap = 60
const totalLoopW = 3 * loopBoxW + 2 * loopGap
const loopStartX = (40 + (stageStartX + 5 * stageW + 4 * stageGap) - totalLoopW) / 2 + 20

// Section label
els.push(text(loopStartX, loopY - 54, 'INSIDE A JUDGMENTAL STAGE  //  one attempt', { fontSize: 18, fontFamily: 3, color: BLACK }))
els.push(line([[loopStartX, loopY - 30], [loopStartX + totalLoopW, loopY - 30]], { stroke: BLACK, strokeWidth: 1 }))

// Connector lines: from scored & drafted down into the loop header
els.push(line([[scoredCx, stageY + stageH], [scoredCx, loopY - 70], [loopStartX + totalLoopW / 2, loopY - 70]], { stroke: ORANGE, strokeWidth: 2, strokeStyle: 'dashed' }))
els.push(line([[draftedCx, stageY + stageH], [draftedCx, loopY - 70], [loopStartX + totalLoopW / 2, loopY - 70]], { stroke: ORANGE, strokeWidth: 2, strokeStyle: 'dashed' }))
els.push(text(loopStartX + totalLoopW / 2 - 90, loopY - 88, 'zoom in ↓', { fontSize: 16, fontFamily: 1, color: ORANGE }))

// Three role boxes: Maker, Checker, Arbiter
const roles = [
  {
    title: 'MAKER',
    persona: 'Siddharth',
    subrole: 'SDR',
    verb: 'proposes',
    bullets: ['drafts content', 'uses persona voice', 'outputs JSON'],
    accent: ORANGE,
  },
  {
    title: 'CHECKER',
    persona: 'Shruti',
    subrole: 'Skeptic',
    verb: 'rubric-scores 1-10',
    bullets: ['scores each dim', 'flags weaknesses', 'suggests revise'],
    accent: BLACK,
  },
  {
    title: 'ARBITER',
    persona: 'Vikram',
    subrole: 'VP Sales',
    verb: 'final call',
    bullets: ['pass / revise / reject', 'can override checker', 'accountable'],
    accent: RED,
  },
]

roles.forEach((r, i) => {
  const x = loopStartX + i * (loopBoxW + loopGap)
  const y = loopY
  els.push(rect(x, y, loopBoxW, loopBoxH, { stroke: r.accent, strokeWidth: 3 }))
  // accent stripe
  els.push(rect(x, y, loopBoxW, 8, { stroke: r.accent, fill: r.accent, fillStyle: 'solid', strokeWidth: 1 }))
  els.push(text(x + 16, y + 22, r.title, { fontSize: 22, fontFamily: 3, color: r.accent }))
  els.push(text(x + 16, y + 54, `${r.persona} · ${r.subrole}`, { fontSize: 20, fontFamily: 1, color: BLACK }))
  els.push(text(x + 16, y + 84, `"${r.verb}"`, { fontSize: 16, fontFamily: 3, color: GRAY }))
  r.bullets.forEach((b, j) => {
    els.push(text(x + 16, y + 108 + j * 20, `· ${b}`, { fontSize: 14, fontFamily: 3, color: BLACK }))
  })
  // arrow to next
  if (i < roles.length - 1) {
    const ax = x + loopBoxW
    els.push(arrow([[ax + 6, y + loopBoxH / 2], [ax + loopGap - 6, y + loopBoxH / 2]], { stroke: BLACK, strokeWidth: 3 }))
    // small verb on arrow
    const labels = ['draft', 'scores']
    els.push(text(ax + 8, y + loopBoxH / 2 - 24, labels[i], { fontSize: 12, fontFamily: 3, color: GRAY }))
  }
})

// --- Decision diamond + branches (below Arbiter)
const decisionY = loopY + loopBoxH + 70
const arbiterX = loopStartX + 2 * (loopBoxW + loopGap)
const diamondW = 280
const diamondH = 120
const diamondX = arbiterX + (loopBoxW - diamondW) / 2
els.push(diamond(diamondX, decisionY, diamondW, diamondH, { stroke: BLACK, strokeWidth: 2, fill: LIGHT, fillStyle: 'hachure' }))
els.push(text(diamondX + 30, decisionY + 30, 'checker ≥ threshold', { fontSize: 14, fontFamily: 3, color: BLACK }))
els.push(text(diamondX + 42, decisionY + 52, 'OR arbiter override?', { fontSize: 14, fontFamily: 3, color: BLACK }))
els.push(text(diamondX + 90, decisionY + 80, 'GATE', { fontSize: 20, fontFamily: 1, color: ORANGE }))

// arrow arbiter -> diamond
els.push(arrow([[arbiterX + loopBoxW / 2, loopY + loopBoxH + 4], [diamondX + diamondW / 2, decisionY - 4]], { stroke: BLACK, strokeWidth: 2 }))

// Three outcome branches from diamond
// PASS (right, green)
const passX = diamondX + diamondW + 30
const passY = decisionY + diamondH / 2 - 30
els.push(arrow([[diamondX + diamondW, decisionY + diamondH / 2], [passX, passY + 20]], { stroke: GREEN, strokeWidth: 2 }))
els.push(rect(passX, passY, 180, 64, { stroke: GREEN, strokeWidth: 3, fill: 'transparent' }))
els.push(text(passX + 12, passY + 8, 'PASS', { fontSize: 20, fontFamily: 3, color: GREEN }))
els.push(text(passX + 12, passY + 36, 'advance stage →', { fontSize: 13, fontFamily: 3, color: BLACK }))

// REVISE (down-left, orange loop back to Maker)
const reviseX = diamondX - 210
const reviseY = decisionY + diamondH + 20
els.push(arrow([[diamondX + 40, decisionY + diamondH], [reviseX + 180, reviseY + 20]], { stroke: ORANGE, strokeWidth: 2 }))
els.push(rect(reviseX, reviseY, 200, 72, { stroke: ORANGE, strokeWidth: 3, fill: 'transparent' }))
els.push(text(reviseX + 12, reviseY + 8, 'REVISE', { fontSize: 20, fontFamily: 3, color: ORANGE }))
els.push(text(reviseX + 12, reviseY + 36, 'iter++ ·  back to Maker', { fontSize: 13, fontFamily: 3, color: BLACK }))
els.push(text(reviseX + 12, reviseY + 54, 'with checker feedback', { fontSize: 13, fontFamily: 3, color: GRAY }))

// Revise back-arrow: from revise box up/over to Maker
const makerX = loopStartX
const makerY = loopY
els.push(line([
  [reviseX + 40, reviseY],
  [reviseX + 40, reviseY - 40],
  [makerX - 30, reviseY - 40],
  [makerX - 30, makerY + loopBoxH / 2],
  [makerX - 4, makerY + loopBoxH / 2],
], { stroke: ORANGE, strokeWidth: 2, strokeStyle: 'dashed', type: 'arrow', endArrow: 'arrow' }))
els.push(text(reviseX - 80, reviseY - 60, 'next iteration', { fontSize: 13, fontFamily: 1, color: ORANGE }))

// REJECT (down, red, terminal)
const rejectX = diamondX + diamondW / 2 - 90
const rejectY = decisionY + diamondH + 110
els.push(arrow([[diamondX + diamondW / 2, decisionY + diamondH], [rejectX + 90, rejectY - 4]], { stroke: RED, strokeWidth: 2 }))
els.push(rect(rejectX, rejectY, 200, 64, { stroke: RED, strokeWidth: 3, fill: 'transparent' }))
els.push(text(rejectX + 12, rejectY + 8, 'REJECT', { fontSize: 20, fontFamily: 3, color: RED }))
els.push(text(rejectX + 12, rejectY + 36, 'max iter reached', { fontSize: 13, fontFamily: 3, color: BLACK }))

// --- Left side: Rubric dimensions panel (transparency)
const rubricX = 60
const rubricY = loopY + loopBoxH + 50
const rubricW = 420
const rubricH = 240
els.push(rect(rubricX, rubricY, rubricW, rubricH, { stroke: BLACK, strokeWidth: 2, fill: 'transparent' }))
els.push(text(rubricX + 14, rubricY + 12, 'RUBRIC  //  why it passed or failed', { fontSize: 16, fontFamily: 3, color: BLACK }))
els.push(line([[rubricX, rubricY + 44], [rubricX + rubricW, rubricY + 44]], { stroke: BLACK, strokeWidth: 1 }))
const dims = [
  ['fit', '1-10', 'does the ICP match?'],
  ['signal', '1-10', 'recent trigger / news?'],
  ['hook', '1-10', 'does opener earn the reply?'],
  ['voice', '1-10', 'persona tone intact?'],
  ['specificity', '1-10', 'no generic fluff?'],
]
dims.forEach(([d, scale, g], i) => {
  const y = rubricY + 60 + i * 34
  els.push(text(rubricX + 14, y, d, { fontSize: 18, fontFamily: 1, color: ORANGE }))
  els.push(text(rubricX + 140, y + 2, scale, { fontSize: 14, fontFamily: 3, color: GRAY }))
  els.push(text(rubricX + 200, y + 2, g, { fontSize: 14, fontFamily: 3, color: BLACK }))
})

// --- Human-in-loop gate callout (far right bottom)
const humanX = passX - 20
const humanY = rejectY + 120
els.push(rect(humanX, humanY, 280, 120, { stroke: BLACK, strokeWidth: 3, fill: LIGHT, fillStyle: 'hachure' }))
els.push(text(humanX + 14, humanY + 12, 'HUMAN GATE', { fontSize: 16, fontFamily: 3, color: RED }))
els.push(text(humanX + 14, humanY + 38, 'before  sent', { fontSize: 22, fontFamily: 1, color: BLACK }))
els.push(text(humanX + 14, humanY + 70, '· operator approves', { fontSize: 14, fontFamily: 3, color: BLACK }))
els.push(text(humanX + 14, humanY + 90, '· or edits the draft', { fontSize: 14, fontFamily: 3, color: BLACK }))

// Connect sent stage to human gate
const sentCx = stageStartX + 4 * (stageW + stageGap) + stageW / 2
const sentBottom = stageY + stageH
els.push(line([
  [sentCx, sentBottom],
  [sentCx, sentBottom + 30],
  [humanX + 140, sentBottom + 30],
  [humanX + 140, humanY],
], { stroke: RED, strokeWidth: 2, strokeStyle: 'dashed', type: 'arrow', endArrow: 'arrow' }))

// --- Footer
const footerY = 1120
els.push(line([[40, footerY], [2000, footerY]], { stroke: BLACK, strokeWidth: 2 }))
els.push(text(40, footerY + 14, 'threshold-gated · persona-named · rubric-transparent · human-approved', { fontSize: 16, fontFamily: 3, color: BLACK }))
els.push(text(40, footerY + 44, 'outtro.ai  ·  every outreach you send, you can defend', { fontSize: 14, fontFamily: 3, color: ORANGE }))

// --- Assemble file
const doc = {
  type: 'excalidraw',
  version: 2,
  source: 'outtro-sketchnote',
  elements: els,
  appState: {
    gridSize: null,
    viewBackgroundColor: '#ffffff',
  },
  files: {},
}

const out = process.argv[2] ?? '/tmp/solution-sketch.excalidraw'
writeFileSync(out, JSON.stringify(doc, null, 2))
console.log('wrote', out, 'elements:', els.length)
