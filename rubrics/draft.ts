import type { RubricDim } from '../prompts/checker'

/**
 * Draft rubric — grounded in research/personas/siddharth-cold-email.md.
 *
 * Core principle: "Demonstrate, don't claim."
 * The outreach message is a DOOR, not a PITCH.
 * Its only job: create an unresolved gap the prospect has to resolve.
 *
 * Reply-rate evidence (Lavender, Belkins 2024):
 *   - Opener with specific activity reference: 3.2× reply rate
 *   - Zero-CTA or "curious about X": 4-5% reply vs 1.1% for "hop on 15-min call"
 *   - Exit ramp ("no hard feelings"): reduces perceived cost, lifts reply rate
 */
export const DRAFT_RUBRIC: RubricDim[] = [
  {
    dim: 'specific_observation',
    guide: 'Opens with a verb of observation ("saw", "caught", "read") + concrete artifact from prospect\'s OWN words (post, tweet, talk, PR, hire). Swap name → email breaks. NEVER starts with pleasantries or compliments.'
  },
  {
    dim: 'uncomfortable_reframe',
    guide: 'Reframes visible work as a PROBLEM prospect privately knows but hasn\'t publicly articulated. Not flattery. Not teaching (condescending). The "part you didn\'t say out loud".'
  },
  {
    dim: 'anti_pitch',
    guide: 'ZERO product/service claims in body. Does not mention features, ROI, "we help companies like yours". The message is a DOOR. Pitch happens elsewhere (reply, page, call).'
  },
  {
    dim: 'brevity',
    guide: 'Email body ≤ 6 lines excluding signature. LinkedIn connection ≤ 300 chars. Every sentence earns place. Reading takes < 20 seconds.'
  },
  {
    dim: 'voice',
    guide: 'Peer-to-peer. Human. Direct. NEVER: "I hope this finds you well", "quick question", "circle back", "touch base", "synergies", "leverage" (verb), "at scale" (vague), "world-class", "game-changer", "revolutionize".'
  },
  {
    dim: 'cta_minimal',
    guide: 'One low-friction ask OR zero ask. "Curious about X?" or pure observation. NEVER: "hop on 30-min call", "schedule here: [calendly]", "would you be open to hearing about...". (Reply data: zero-CTA → 4.2%, "hop on call" → 1.1%.)'
  },
  {
    dim: 'exit_ramp',
    guide: 'Explicit permission to ignore: "if off-base, no hard feelings" / "if not useful". Reduces perceived cost, paradoxically lifts reply rate on quality prospects.'
  },
  {
    dim: 'opportunity_map',
    guide: 'Exactly 3 bullets. Each tailored to THIS prospect (not generic). Format: [signal observed] → [AI pattern] → [outcome in their language]. Each ≤ 25 words. No jargon. No "leverage"/"synergize". Concrete use cases rooted in visible signals from profile/posts. Generic bullets ("AI for sales") = auto-fail.'
  }
]

/** LinkedIn connection request — 300-char hard cap. */
export const DRAFT_LI_CONNECT_RUBRIC: RubricDim[] = [
  ...DRAFT_RUBRIC,
  { dim: 'char_count_300', guide: 'Strictly under 300 characters including URL. Count them.' }
]

/** X/Twitter DM — casual, short, lowercase OK. */
export const DRAFT_XDM_RUBRIC: RubricDim[] = [
  ...DRAFT_RUBRIC.filter(r => r.dim !== 'voice'),
  { dim: 'casual_voice', guide: 'Lowercase OK. No business-speak. No signature. ≤ 3 sentences.' }
]
