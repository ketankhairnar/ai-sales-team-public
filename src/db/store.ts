import Database from 'better-sqlite3'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Campaign, Prospect, StageEnvelope, HumanInput, PipelineEvent } from '../dsl/envelope'

export class Store {
  private db: Database.Database

  constructor(path: string = process.env.DB_PATH ?? './data/app.db') {
    const full = resolve(path)
    mkdirSync(dirname(full), { recursive: true })
    this.db = new Database(full)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    const schema = readFileSync(resolve('src/db/schema.sql'), 'utf8')
    this.db.exec(schema)
    this.migrate()
  }

  private migrate() {
    // IMPORTANT: table and ddl strings in this function are internal-only (never user input).
    // SQLite PRAGMA and ALTER TABLE don't support bound parameters for identifiers, so we
    // interpolate. Keep all callers of addCol() passing hardcoded literals.
    const cols = (table: string) =>
      (this.db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c => c.name)
    const addCol = (table: string, col: string, ddl: string) => {
      if (!cols(table).includes(col)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
    }
    addCol('prospects', 'account_id', 'account_id TEXT')
    addCol('prospects', 'stage_entered_at', 'stage_entered_at TEXT')
    addCol('prospects', 'outcome', 'outcome TEXT')            // won|lost|parked
    addCol('prospects', 'outcome_reason', 'outcome_reason TEXT')
    addCol('prospects', 'outcome_note', 'outcome_note TEXT')
    addCol('events', 'actor_type', "actor_type TEXT DEFAULT 'ai_agent'")
    addCol('events', 'reason_code', 'reason_code TEXT')
    addCol('events', 'reason_note', 'reason_note TEXT')
    addCol('campaigns', 'title', 'title TEXT')
    // Backfill: existing campaigns without title get id as title
    this.db.exec(`UPDATE campaigns SET title = id WHERE title IS NULL`)
    addCol('stage_envelopes', 'claim_id', 'claim_id TEXT')
    addCol('stage_envelopes', 'claimed_by', 'claimed_by TEXT')
    addCol('stage_envelopes', 'claim_expires_at', 'claim_expires_at TEXT')
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_envelope_claim ON stage_envelopes(status, claim_expires_at)`)
  }

  close() { this.db.close() }

  /** Escape hatch for modules that need raw SQL (worker-queries). Use sparingly. */
  rawDb(): Database.Database { return this.db }

  // -- Campaigns --
  upsertCampaign(c: Campaign) {
    this.db.prepare(`
      INSERT INTO campaigns (id, title, pipeline, icp, created_at, created_by)
      VALUES (@id, @title, @pipeline, @icp, @created_at, @created_by)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, pipeline=excluded.pipeline, icp=excluded.icp
    `).run({
      id: c.id, title: c.title ?? null, pipeline: c.pipeline, icp: JSON.stringify(c.icp),
      created_at: c.created_at, created_by: c.created_by
    })
  }

  getCampaign(id: string): Campaign | null {
    const row = this.db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id) as any
    if (!row) return null
    return {
      id: row.id,
      title: row.title ?? undefined,
      pipeline: row.pipeline,
      icp: JSON.parse(row.icp),
      prospects: this.listProspectIds(row.id),
      created_at: row.created_at,
      created_by: row.created_by
    }
  }

  listCampaigns(): Campaign[] {
    const rows = this.db.prepare(`SELECT id FROM campaigns ORDER BY created_at DESC`).all() as any[]
    return rows.map(r => this.getCampaign(r.id)!).filter(Boolean)
  }

  // -- Prospects --
  upsertProspect(campaignId: string, p: Prospect) {
    // Detect stage change → stamp stage_entered_at
    const prev = this.db.prepare(`SELECT current_stage, stage_entered_at FROM prospects WHERE id = ?`).get(p.id) as any
    const stageEnteredAt = (!prev || prev.current_stage !== p.current_stage)
      ? p.updated_at
      : (p.stage_entered_at ?? prev.stage_entered_at ?? p.updated_at)

    this.db.prepare(`
      INSERT INTO prospects (id, campaign_id, name, linkedin_url, x_handle, company, title, current_stage, created_at, updated_at, stage_entered_at, outcome, outcome_reason, outcome_note)
      VALUES (@id, @campaign_id, @name, @linkedin_url, @x_handle, @company, @title, @current_stage, @created_at, @updated_at, @stage_entered_at, @outcome, @outcome_reason, @outcome_note)
      ON CONFLICT(id) DO UPDATE SET
        campaign_id       = excluded.campaign_id,
        current_stage     = excluded.current_stage,
        updated_at        = excluded.updated_at,
        name              = excluded.name,
        company           = excluded.company,
        title             = excluded.title,
        stage_entered_at  = excluded.stage_entered_at,
        outcome           = excluded.outcome,
        outcome_reason    = excluded.outcome_reason,
        outcome_note      = excluded.outcome_note
    `).run({
      id: p.id, campaign_id: campaignId,
      name: p.name, linkedin_url: p.linkedin_url ?? null, x_handle: p.x_handle ?? null,
      company: p.company, title: p.title, current_stage: p.current_stage,
      created_at: p.created_at, updated_at: p.updated_at,
      stage_entered_at: stageEnteredAt,
      outcome: p.outcome ?? null,
      outcome_reason: p.outcome_reason ?? null,
      outcome_note: p.outcome_note ?? null,
    })
    for (const [stageId, env] of Object.entries(p.stages)) {
      this.upsertStageEnvelope(p.id, stageId, env)
    }
  }

  setOutcome(prospectId: string, outcome: 'won' | 'lost' | 'parked', reason: string, note: string | null, at: string) {
    this.db.prepare(`
      UPDATE prospects SET outcome=?, outcome_reason=?, outcome_note=?, updated_at=? WHERE id=?
    `).run(outcome, reason, note, at, prospectId)
  }

  appendScoreSnapshot(prospectId: string, score: number, rationale: string | null, at: string) {
    this.db.prepare(`
      INSERT INTO score_snapshots (prospect_id, score, rationale, at) VALUES (?, ?, ?, ?)
    `).run(prospectId, score, rationale, at)
  }

  getProspect(id: string): Prospect | null {
    const row = this.db.prepare(`SELECT * FROM prospects WHERE id = ?`).get(id) as any
    if (!row) return null
    const envelopes = this.db.prepare(`SELECT stage_id, envelope FROM stage_envelopes WHERE prospect_id = ?`).all(id) as any[]
    const stages: Record<string, StageEnvelope> = {}
    for (const e of envelopes) stages[e.stage_id] = JSON.parse(e.envelope)
    return {
      id: row.id,
      name: row.name,
      linkedin_url: row.linkedin_url ?? undefined,
      x_handle: row.x_handle ?? undefined,
      company: row.company,
      title: row.title,
      current_stage: row.current_stage,
      stages,
      created_at: row.created_at,
      updated_at: row.updated_at,
      stage_entered_at: row.stage_entered_at ?? undefined,
      outcome: row.outcome ?? undefined,
      outcome_reason: row.outcome_reason ?? undefined,
      outcome_note: row.outcome_note ?? undefined,
    }
  }

  listProspects(campaignId: string): Prospect[] {
    const rows = this.db.prepare(`SELECT id FROM prospects WHERE campaign_id = ?`).all(campaignId) as any[]
    return rows.map(r => this.getProspect(r.id)!).filter(Boolean)
  }

  listProspectIds(campaignId: string): string[] {
    return (this.db.prepare(`SELECT id FROM prospects WHERE campaign_id = ?`).all(campaignId) as any[]).map(r => r.id)
  }

  // -- Stage envelopes --
  upsertStageEnvelope(prospectId: string, stageId: string, env: StageEnvelope) {
    this.db.prepare(`
      INSERT INTO stage_envelopes (prospect_id, stage_id, status, envelope, started_at, ended_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(prospect_id, stage_id) DO UPDATE SET
        status     = excluded.status,
        envelope   = excluded.envelope,
        started_at = excluded.started_at,
        ended_at   = excluded.ended_at
    `).run(prospectId, stageId, env.status, JSON.stringify(env), env.started_at ?? null, env.ended_at ?? null)
  }

  // -- Events --
  appendEvent(campaignId: string, e: PipelineEvent) {
    const prospectId = 'prospect_id' in e ? (e as any).prospect_id : null
    const stageId = 'stage_id' in e ? (e as any).stage_id : ('to' in e ? (e as any).to : null)
    const at = 'at' in e ? (e as any).at : new Date().toISOString()
    this.db.prepare(`
      INSERT INTO events (campaign_id, prospect_id, stage_id, kind, payload, at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(campaignId, prospectId, stageId, e.kind, JSON.stringify(e), at)
  }

  listEvents(campaignId: string, opts: { prospectId?: string; sinceId?: number; limit?: number } = {}): Array<PipelineEvent & { id: number }> {
    const clauses: string[] = ['campaign_id = ?']
    const params: any[] = [campaignId]
    if (opts.prospectId) { clauses.push('prospect_id = ?'); params.push(opts.prospectId) }
    if (opts.sinceId != null) { clauses.push('id > ?'); params.push(opts.sinceId) }
    const sql = `SELECT id, payload FROM events WHERE ${clauses.join(' AND ')} ORDER BY id ASC LIMIT ?`
    params.push(opts.limit ?? 500)
    const rows = this.db.prepare(sql).all(...params) as any[]
    return rows.map(r => ({ id: r.id, ...JSON.parse(r.payload) }))
  }

  // -- Human inputs --
  appendHumanInput(campaignId: string, h: HumanInput & { prospect_id: string; stage_id: string; blocking?: boolean }) {
    this.db.prepare(`
      INSERT INTO human_inputs (id, campaign_id, prospect_id, stage_id, author_id, author_name, kind, payload, blocking, at)
      VALUES (@id, @campaign_id, @prospect_id, @stage_id, @author_id, @author_name, @kind, @payload, @blocking, @at)
    `).run({
      id: h.id, campaign_id: campaignId,
      prospect_id: h.prospect_id, stage_id: h.stage_id,
      author_id: h.author.id, author_name: h.author.name,
      kind: h.kind, payload: JSON.stringify(h.payload),
      blocking: h.blocking ? 1 : 0,
      at: h.at
    })
  }

  // -- Waitlist --
  addWaitlist(e: { email: string; source?: string; note?: string; user_agent?: string; ip_hash?: string; created_at: string }): 'inserted' | 'exists' {
    try {
      this.db.prepare(`
        INSERT INTO waitlist (email, source, note, user_agent, ip_hash, created_at, status)
        VALUES (@email, @source, @note, @user_agent, @ip_hash, @created_at, 'pending')
      `).run({
        email: e.email.toLowerCase(),
        source: e.source ?? 'landing',
        note: e.note ?? null,
        user_agent: e.user_agent ?? null,
        ip_hash: e.ip_hash ?? null,
        created_at: e.created_at,
      })
      return 'inserted'
    } catch (err: any) {
      if (String(err?.code ?? '').includes('SQLITE_CONSTRAINT')) return 'exists'
      throw err
    }
  }

  markWaitlistNotified(email: string, at: string) {
    this.db.prepare(`UPDATE waitlist SET notified_at = ?, status = 'notified' WHERE email = ?`)
      .run(at, email.toLowerCase())
  }

  listWaitlist(): Array<{ email: string; source: string | null; note: string | null; created_at: string; status: string; notified_at: string | null }> {
    return this.db.prepare(`SELECT email, source, note, created_at, status, notified_at FROM waitlist ORDER BY created_at DESC`).all() as any[]
  }

  listHumanInputs(prospectId: string): HumanInput[] {
    const rows = this.db.prepare(`SELECT * FROM human_inputs WHERE prospect_id = ? ORDER BY at ASC`).all(prospectId) as any[]
    return rows.map(r => ({
      id: r.id,
      author: { id: r.author_id, name: r.author_name },
      kind: r.kind,
      payload: JSON.parse(r.payload),
      at: r.at
    }))
  }
}
