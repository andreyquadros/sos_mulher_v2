import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { randomInt, randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { EventEmitter } from 'node:events';
import type { AppConfig } from './config.js';
import type { AudioChunk, AuditEvent, ChangeEvent, Device, Incident, LocationPoint, Operator, Woman } from './models.js';
import { ApiError, hashPassword, hashToken, newToken, validateRecentTimestamp } from './security.js';

export interface OperatorRow extends Operator { passwordHash: string; }
export const CENTRAL_GUIDE_VERSION = 1;
interface IncidentRow extends Omit<Incident, 'womanName' | 'assignedName' | 'lastLocation' | 'audioCount' | 'simulated'> {
  deviceId: string;
  agencyId: string;
  simulated: number;
}
interface LocationRow extends Omit<LocationPoint, 'battery'> { incidentId: string; battery: number | null; }
interface AudioRow extends Omit<AudioChunk, 'url'> { incidentId: string; data: Uint8Array; }
interface PairingRow { womanId: string; expiresAt: string; usedAt: string | null; }
interface DeviceRow { id: string; womanId: string; consentAudio: number; revokedAt: string | null; }
export interface IncidentInput {
  clientEventId: string;
  trigger: Incident['trigger'];
  simulated: boolean;
  createdAt: string;
}

const SCHEMA_VERSION = 1;
const INCIDENT_COLUMNS = 'id,code,womanId,deviceId,agencyId,status,simulated,trigger,createdAt,receivedAt,acknowledgedAt,assignedTo,resolvedAt,resolution,revision';
const INCIDENT_DEFINITION = `
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, womanId TEXT NOT NULL REFERENCES women(id),
  deviceId TEXT NOT NULL REFERENCES devices(id), agencyId TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('new','assigned','resolved')),
  simulated INTEGER NOT NULL, trigger TEXT NOT NULL CHECK(trigger IN ('hold','volume','notification','voice')),
  createdAt TEXT NOT NULL, receivedAt TEXT NOT NULL, acknowledgedAt TEXT,
  assignedTo TEXT REFERENCES operators(id), resolvedAt TEXT, resolution TEXT,
  revision INTEGER NOT NULL DEFAULT 1
`;

export class Store {
  readonly db: DatabaseSync;
  readonly events = new EventEmitter();
  private pendingEvents: Array<{ agencyId: string; change: ChangeEvent }> | null = null;

  constructor(readonly config: AppConfig) {
    if (config.databasePath !== ':memory:') mkdirSync(dirname(config.databasePath), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(config.databasePath);
    if (config.databasePath !== ':memory:') chmodSync(config.databasePath, 0o600);
    if (this.get<{ user_version: number }>('PRAGMA user_version')!.user_version > SCHEMA_VERSION) {
      this.db.close();
      throw new Error('Banco criado por uma versão mais recente. Atualize a API antes de abri-lo.');
    }
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operators (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
        agencyId TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','dispatcher','observer')),
        passwordHash TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        tokenHash TEXT PRIMARY KEY, operatorId TEXT NOT NULL REFERENCES operators(id),
        createdAt TEXT NOT NULL, expiresAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS operator_onboarding (
        operatorId TEXT NOT NULL REFERENCES operators(id), guideVersion INTEGER NOT NULL CHECK(guideVersion > 0),
        completedAt TEXT NOT NULL, PRIMARY KEY(operatorId, guideVersion)
      );
      CREATE TABLE IF NOT EXISTS women (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, reference TEXT NOT NULL,
        notes TEXT NOT NULL, agencyId TEXT NOT NULL, createdAt TEXT NOT NULL,
        UNIQUE (agencyId, reference)
      );
      CREATE TABLE IF NOT EXISTS pairings (
        codeHash TEXT PRIMARY KEY, womanId TEXT NOT NULL REFERENCES women(id),
        expiresAt TEXT NOT NULL, usedAt TEXT, createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY, womanId TEXT NOT NULL REFERENCES women(id), tokenHash TEXT NOT NULL UNIQUE,
        consentVersion TEXT NOT NULL, consentLocation INTEGER NOT NULL CHECK(consentLocation = 1),
        consentAudio INTEGER NOT NULL, createdAt TEXT NOT NULL, revokedAt TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_device ON devices(womanId) WHERE revokedAt IS NULL;
      CREATE TABLE IF NOT EXISTS incidents (${INCIDENT_DEFINITION});
      CREATE UNIQUE INDEX IF NOT EXISTS one_open_incident ON incidents(deviceId) WHERE status != 'resolved';
      CREATE INDEX IF NOT EXISTS incidents_agency ON incidents(agencyId, receivedAt DESC);
      CREATE TABLE IF NOT EXISTS client_events (
        deviceId TEXT NOT NULL REFERENCES devices(id), clientEventId TEXT NOT NULL,
        incidentId TEXT NOT NULL REFERENCES incidents(id), PRIMARY KEY(deviceId, clientEventId)
      );
      CREATE TABLE IF NOT EXISTS locations (
        incidentId TEXT NOT NULL REFERENCES incidents(id), sequence INTEGER NOT NULL,
        latitude REAL NOT NULL, longitude REAL NOT NULL, accuracy REAL NOT NULL,
        capturedAt TEXT NOT NULL, receivedAt TEXT NOT NULL, battery REAL,
        PRIMARY KEY(incidentId, sequence)
      );
      CREATE TABLE IF NOT EXISTS audio_chunks (
        id TEXT PRIMARY KEY, incidentId TEXT NOT NULL REFERENCES incidents(id), sequence INTEGER NOT NULL,
        capturedAt TEXT NOT NULL, receivedAt TEXT NOT NULL, mimeType TEXT NOT NULL, data BLOB NOT NULL,
        UNIQUE(incidentId, sequence)
      );
      CREATE TABLE IF NOT EXISTS audit (
        id TEXT PRIMARY KEY, agencyId TEXT NOT NULL, action TEXT NOT NULL, actorName TEXT NOT NULL,
        incidentId TEXT REFERENCES incidents(id), createdAt TEXT NOT NULL, detail TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS audit_agency ON audit(agencyId, createdAt DESC);
      CREATE TABLE IF NOT EXISTS change_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, agencyId TEXT NOT NULL, kind TEXT NOT NULL,
        incidentId TEXT REFERENCES incidents(id), createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS changes_agency ON change_events(agencyId, seq);
    `);
    const marker = this.get<{ value: string }>('SELECT value FROM metadata WHERE key = ?', 'demo');
    if (marker?.value === 'true' && !config.demoMode) {
      this.db.close();
      throw new Error('Banco de demonstração não pode ser aberto fora de DEMO_MODE=true. Use outro DATABASE_PATH.');
    }
    if (config.demoMode && !marker) {
      const counts = this.get<{ count: number }>('SELECT COUNT(*) count FROM operators');
      if (counts?.count) {
        this.db.close();
        throw new Error('Não habilite demonstração sobre um banco institucional existente.');
      }
      this.run('INSERT INTO metadata(key, value) VALUES (?, ?)', 'demo', 'true');
    }
    try { this.migrateVoiceTrigger(); }
    catch (error) { this.db.close(); throw error; }
  }

  /** SQLite's create/copy/drop/rename procedure retains all incident IDs and child references. */
  private migrateVoiceTrigger() {
    if (this.get<{ user_version: number }>('PRAGMA user_version')!.user_version >= SCHEMA_VERSION) return;
    // This PRAGMA must run outside the transaction; disabling it inside BEGIN has no effect.
    this.db.exec('PRAGMA foreign_keys = OFF');
    let active = false;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      active = true;
      // Another process may have completed the migration while this connection waited.
      const version = this.get<{ user_version: number }>('PRAGMA user_version')!.user_version;
      if (version > SCHEMA_VERSION) throw new Error('Banco criado por uma versão mais recente. Atualize a API antes de abri-lo.');
      if (version < SCHEMA_VERSION) {
        const columns = this.all<{ name: string }>('PRAGMA table_info(incidents)').map(column => column.name);
        if (columns.join(',') !== INCIDENT_COLUMNS) throw new Error('Esquema de ocorrências desconhecido. A migração não alterou os dados.');
        const objects = this.all<{ type: string; name: string; sql: string }>(`
          SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND
          ((type='index' AND tbl_name='incidents') OR type IN ('view','trigger'))
          ORDER BY CASE type WHEN 'index' THEN 0 WHEN 'view' THEN 1 ELSE 2 END,name
        `);
        // Views and triggers can reference incidents from other tables; preserve their definitions
        // while the original table briefly does not exist. No user payload is executed here.
        for (const object of objects.filter(object => object.type !== 'index')) {
          this.db.exec(`DROP ${object.type.toUpperCase()} "${object.name.replaceAll('"', '""')}"`);
        }
        this.db.exec(`
          CREATE TABLE incidents_voice_v1 (${INCIDENT_DEFINITION});
          INSERT INTO incidents_voice_v1 (${INCIDENT_COLUMNS}) SELECT ${INCIDENT_COLUMNS} FROM incidents;
          DROP TABLE incidents;
          ALTER TABLE incidents_voice_v1 RENAME TO incidents;
        `);
        for (const object of objects) this.db.exec(object.sql);
        if (this.all('PRAGMA foreign_key_check').length !== 0) {
          throw new Error('Falha de integridade referencial. A migração não alterou os dados.');
        }
        this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      }
      this.db.exec('COMMIT');
      active = false;
    } catch (error) {
      if (active) this.db.exec('ROLLBACK');
      throw error;
    } finally {
      this.db.exec('PRAGMA foreign_keys = ON');
    }
  }

  get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...params) as unknown as T | undefined;
  }
  all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...params) as unknown as T[];
  }
  run(sql: string, ...params: SQLInputValue[]) { return this.db.prepare(sql).run(...params); }

  transaction<T>(fn: () => T): T {
    if (this.pendingEvents) throw new Error('Transação aninhada não permitida.');
    this.db.exec('BEGIN IMMEDIATE');
    const events: Array<{ agencyId: string; change: ChangeEvent }> = [];
    this.pendingEvents = events;
    let result: T;
    try {
      result = fn();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally { this.pendingEvents = null; }
    for (const { agencyId, change } of events) this.events.emit('change', agencyId, change);
    return result;
  }

  audit(agencyId: string, action: string, actorName: string, incidentId: string | null, detail: string) {
    this.run('INSERT INTO audit VALUES (?, ?, ?, ?, ?, ?, ?)', randomUUID(), agencyId, action, actorName, incidentId, new Date().toISOString(), detail);
  }

  change(agencyId: string, kind: string, incidentId?: string) {
    const result = this.run('INSERT INTO change_events(agencyId,kind,incidentId,createdAt) VALUES (?,?,?,?)', agencyId, kind, incidentId ?? null, new Date().toISOString());
    const change: ChangeEvent = { seq: Number(result.lastInsertRowid), kind, ...(incidentId ? { incidentId } : {}) };
    if (this.pendingEvents) this.pendingEvents.push({ agencyId, change });
    else this.events.emit('change', agencyId, change);
  }

  async initialize() {
    const count = this.get<{ count: number }>('SELECT COUNT(*) count FROM operators')!.count;
    if (count > 0) return;
    const { demoMode, adminEmail, adminPassword, adminName, agencyId } = this.config;
    if (demoMode) {
      const operator = await this.createOperator({ name: 'Operadora de demonstração', email: 'demo@mulher.ro.gov.br', agencyId: 'demo-ro-ariquemes', role: 'admin' }, 'Lume-Demo-2026!');
      this.seedDemo(operator);
    } else if (adminEmail && adminPassword && adminName && agencyId) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || adminPassword.length < 14 || adminPassword.length > 256) {
        throw new Error('ADMIN_EMAIL inválido ou ADMIN_PASSWORD fora de 14–256 caracteres.');
      }
      await this.createOperator({ name: adminName, email: adminEmail, agencyId, role: 'admin' }, adminPassword);
    } else {
      throw new Error('Banco vazio: configure ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME e AGENCY_ID, ou DEMO_MODE=true para demonstração local.');
    }
  }

  async createOperator(input: Omit<Operator, 'id'>, password: string, provisionedBy?: string): Promise<Operator> {
    const operator = { id: randomUUID(), ...input, email: input.email.trim().toLowerCase() };
    const passwordHash = await hashPassword(password);
    this.transaction(() => {
      this.run('INSERT INTO operators VALUES (?,?,?,?,?,?)', operator.id, operator.name, operator.email, operator.agencyId, operator.role, passwordHash);
      if (provisionedBy) this.audit(operator.agencyId, 'operator.provisioned', provisionedBy, null, `Conta institucional provisionada com perfil ${operator.role}.`);
    });
    return operator;
  }

  operatorByEmail(email: string): OperatorRow | undefined { return this.get<OperatorRow>('SELECT * FROM operators WHERE email = ?', email); }
  publicOperator(row: OperatorRow | Operator): Operator {
    const { id, name, email, agencyId, role } = row;
    return { id, name, email, agencyId, role };
  }

  createSession(operator: Operator): string {
    const token = newToken();
    const now = new Date();
    this.transaction(() => {
      this.run('DELETE FROM sessions WHERE expiresAt <= ?', now.toISOString());
      this.run('INSERT INTO sessions VALUES (?,?,?,?)', hashToken(token), operator.id, now.toISOString(), new Date(now.getTime() + this.config.sessionHours * 3_600_000).toISOString());
      this.audit(operator.agencyId, 'auth.login', operator.name, null, 'Sessão de operador iniciada.');
    });
    return token;
  }

  session(token: string): Operator | undefined {
    const row = this.get<OperatorRow>('SELECT o.* FROM sessions s JOIN operators o ON o.id=s.operatorId WHERE s.tokenHash=? AND s.expiresAt>?', hashToken(token), new Date().toISOString());
    return row ? this.publicOperator(row) : undefined;
  }

  onboarding(operator: Operator) {
    const completed = this.get('SELECT 1 FROM operator_onboarding WHERE operatorId=? AND guideVersion=?', operator.id, CENTRAL_GUIDE_VERSION) !== undefined;
    return { completed, version: CENTRAL_GUIDE_VERSION };
  }

  completeOnboarding(operator: Operator) {
    this.run('INSERT INTO operator_onboarding(operatorId, guideVersion, completedAt) VALUES (?,?,?) ON CONFLICT(operatorId, guideVersion) DO NOTHING', operator.id, CENTRAL_GUIDE_VERSION, new Date().toISOString());
    return this.onboarding(operator);
  }

  deleteSession(token: string, operator: Operator) {
    this.transaction(() => {
      this.run('DELETE FROM sessions WHERE tokenHash=?', hashToken(token));
      this.audit(operator.agencyId, 'auth.logout', operator.name, null, 'Sessão encerrada.');
    });
  }

  woman(id: string, agencyId: string): Woman {
    const woman = this.get<Woman>('SELECT * FROM women WHERE id=? AND agencyId=?', id, agencyId);
    if (!woman) throw new ApiError(404, 'Cadastro não encontrado.');
    return woman;
  }

  createWoman(operator: Operator, input: Pick<Woman, 'name' | 'phone' | 'reference' | 'notes'>): Woman {
    return this.transaction(() => {
      if (this.get('SELECT id FROM women WHERE agencyId=? AND reference=?', operator.agencyId, input.reference)) {
        throw new ApiError(409, 'Referência já cadastrada nesta agência.');
      }
      const woman: Woman = { id: randomUUID(), ...input, agencyId: operator.agencyId, createdAt: new Date().toISOString() };
      this.run('INSERT INTO women VALUES (?,?,?,?,?,?,?)', woman.id, woman.name, woman.phone, woman.reference, woman.notes, woman.agencyId, woman.createdAt);
      this.audit(operator.agencyId, 'woman.created', operator.name, null, 'Cadastro de assistida criado.');
      this.change(operator.agencyId, 'woman.created');
      return woman;
    });
  }

  createPairing(operator: Operator, womanId: string): { code: string; expiresAt: string } {
    return this.transaction(() => {
      this.woman(womanId, operator.agencyId);
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      this.run('UPDATE pairings SET usedAt=? WHERE womanId=? AND usedAt IS NULL', now, womanId);
      let code = '';
      do { code = randomInt(0, 100_000_000).toString().padStart(8, '0'); }
      while (this.get('SELECT codeHash FROM pairings WHERE codeHash=?', hashToken(code)));
      this.run('INSERT INTO pairings VALUES (?,?,?,?,?)', hashToken(code), womanId, expiresAt, null, now);
      this.audit(operator.agencyId, 'pairing.created', operator.name, null, 'Pareamento de uso único emitido; validade de 10 minutos.');
      return { code, expiresAt };
    });
  }

  pairDevice(code: string, consentAudio: boolean) {
    const deviceToken = newToken();
    return this.transaction(() => {
      const pairing = this.get<PairingRow>('SELECT * FROM pairings WHERE codeHash=?', hashToken(code));
      const now = new Date().toISOString();
      if (!pairing || pairing.usedAt || pairing.expiresAt <= now) throw new ApiError(400, 'Código inválido, expirado ou já utilizado.');
      const woman = this.get<Woman>('SELECT * FROM women WHERE id=?', pairing.womanId)!;
      const existing = this.get('SELECT i.id FROM incidents i WHERE i.womanId=? AND i.status!=?', woman.id, 'resolved');
      if (existing) throw new ApiError(409, 'Encerre a ocorrência ativa antes de substituir o dispositivo.');
      const deviceId = randomUUID();
      this.run('UPDATE pairings SET usedAt=? WHERE codeHash=? AND usedAt IS NULL', now, hashToken(code));
      this.run('UPDATE devices SET revokedAt=? WHERE womanId=? AND revokedAt IS NULL', now, woman.id);
      this.run('INSERT INTO devices VALUES (?,?,?,?,?,?,?,?)', deviceId, woman.id, hashToken(deviceToken), '2026-10', 1, Number(consentAudio), now, null);
      this.audit(woman.agencyId, 'device.paired', 'Assistida / dispositivo', null, `Adesão voluntária registrada (2026-10): localização autorizada; áudio ${consentAudio ? 'autorizado' : 'não autorizado'}.`);
      this.change(woman.agencyId, 'device.paired');
      return { deviceId, deviceToken, womanName: woman.name };
    });
  }

  device(token: string): Device | undefined {
    const row = this.get<DeviceRow & { womanName: string; agencyId: string }>(
      'SELECT d.*,w.name womanName,w.agencyId FROM devices d JOIN women w ON w.id=d.womanId WHERE d.tokenHash=? AND d.revokedAt IS NULL', hashToken(token));
    return row ? { id: row.id, womanId: row.womanId, womanName: row.womanName, agencyId: row.agencyId, consentAudio: Boolean(row.consentAudio) } : undefined;
  }

  incident(id: string, agencyId: string): Incident {
    const row = this.get<IncidentRow & { womanName: string; assignedName: string | null }>(
      'SELECT i.*,w.name womanName,o.name assignedName FROM incidents i JOIN women w ON w.id=i.womanId LEFT JOIN operators o ON o.id=i.assignedTo WHERE i.id=? AND i.agencyId=?', id, agencyId);
    if (!row) throw new ApiError(404, 'Ocorrência não encontrada.');
    const latest = this.get<LocationRow>('SELECT * FROM locations WHERE incidentId=? ORDER BY capturedAt DESC, sequence DESC LIMIT 1', id);
    const count = this.get<{ count: number }>('SELECT COUNT(*) count FROM audio_chunks WHERE incidentId=?', id)!.count;
    return {
      id: row.id, code: row.code, womanId: row.womanId, womanName: row.womanName,
      status: row.status, simulated: Boolean(row.simulated), trigger: row.trigger,
      createdAt: row.createdAt, receivedAt: row.receivedAt, acknowledgedAt: row.acknowledgedAt,
      assignedTo: row.assignedTo, assignedName: row.assignedName, resolvedAt: row.resolvedAt,
      revision: row.revision, lastLocation: latest ? this.publicLocation(latest) : null, audioCount: count,
    };
  }

  private publicLocation(row: LocationRow): LocationPoint {
    const { sequence, latitude, longitude, accuracy, capturedAt, receivedAt, battery } = row;
    return { sequence, latitude, longitude, accuracy, capturedAt, receivedAt, ...(battery == null ? {} : { battery }) };
  }

  activeIncident(device: Device): Incident | null {
    const row = this.get<{ id: string }>('SELECT id FROM incidents WHERE deviceId=? AND status!=?', device.id, 'resolved');
    return row ? this.incident(row.id, device.agencyId) : null;
  }

  snapshot(operator: Operator) {
    // Keep every open emergency visible even when the archive grows beyond the snapshot window.
    const incidents = this.all<{ id: string }>(`SELECT id FROM incidents WHERE agencyId=? AND (status!='resolved' OR id IN
      (SELECT id FROM incidents WHERE agencyId=? AND status='resolved' ORDER BY receivedAt DESC LIMIT 200))
      ORDER BY receivedAt DESC`, operator.agencyId, operator.agencyId).map(row => this.incident(row.id, operator.agencyId));
    return {
      incidents,
      women: this.all<Woman>('SELECT * FROM women WHERE agencyId=? ORDER BY name', operator.agencyId),
      audit: this.all<AuditEvent>('SELECT id,action,actorName,incidentId,createdAt,detail FROM audit WHERE agencyId=? ORDER BY createdAt DESC,rowid DESC LIMIT 200', operator.agencyId),
      serverTime: new Date().toISOString(),
    };
  }

  createIncident(device: Device, input: IncidentInput): Incident {
    return this.transaction(() => {
      const replay = this.get<{ incidentId: string }>('SELECT incidentId FROM client_events WHERE deviceId=? AND clientEventId=?', device.id, input.clientEventId);
      if (replay) return this.incident(replay.incidentId, device.agencyId);
      validateRecentTimestamp(input.createdAt);
      const active = this.activeIncident(device);
      if (active) {
        if (active.simulated && !input.simulated) {
          const now = new Date().toISOString();
          // A real request must interrupt a training incident, while preserving the
          // assigned operator and the single-open-incident invariant for the device.
          this.run('UPDATE incidents SET simulated=0,trigger=?,acknowledgedAt=NULL,receivedAt=?,revision=revision+1 WHERE id=? AND deviceId=? AND simulated=1 AND status!=?', input.trigger, now, active.id, device.id, 'resolved');
          this.run('INSERT INTO client_events VALUES (?,?,?)', device.id, input.clientEventId, active.id);
          this.audit(device.agencyId, 'incident.escalated', 'Assistida / dispositivo', active.id, 'Acionamento REAL recebido durante simulação. Exige novo reconhecimento humano; responsável preservado.');
          this.change(device.agencyId, 'incident.escalated', active.id);
          return this.incident(active.id, device.agencyId);
        }
        if (active.simulated !== input.simulated) throw new ApiError(409, 'Uma ocorrência real já está aberta. O teste não substitui o pedido de proteção.');
        this.run('INSERT INTO client_events VALUES (?,?,?)', device.id, input.clientEventId, active.id);
        return active;
      }
      const id = randomUUID();
      const now = new Date().toISOString();
      const code = `ML-${now.slice(0, 4)}-${randomUUID().slice(0, 8).toUpperCase()}`;
      this.run('INSERT INTO incidents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, code, device.womanId, device.id, device.agencyId, 'new', Number(input.simulated), input.trigger, input.createdAt, now, null, null, null, null, 1);
      this.run('INSERT INTO client_events VALUES (?,?,?)', device.id, input.clientEventId, id);
      this.audit(device.agencyId, 'incident.created', 'Assistida / dispositivo', id, input.simulated ? 'SIMULAÇÃO: acionamento de treinamento recebido.' : 'Pedido de proteção recebido pelo servidor.');
      this.change(device.agencyId, 'incident.created', id);
      return this.incident(id, device.agencyId);
    });
  }

  private ownedOpenIncident(device: Device, id: string): Incident {
    const row = this.get<IncidentRow>('SELECT * FROM incidents WHERE id=? AND deviceId=? AND agencyId=?', id, device.id, device.agencyId);
    if (!row) throw new ApiError(404, 'Ocorrência não encontrada.');
    if (row.status === 'resolved') throw new ApiError(409, 'Ocorrência encerrada.');
    return this.incident(id, device.agencyId);
  }

  addLocation(device: Device, id: string, input: Omit<LocationPoint, 'receivedAt'>) {
    this.transaction(() => {
      const incident = this.ownedOpenIncident(device, id);
      const existing = this.get<LocationRow>('SELECT * FROM locations WHERE incidentId=? AND sequence=?', id, input.sequence);
      if (existing) {
        if (existing.latitude !== input.latitude || existing.longitude !== input.longitude || existing.accuracy !== input.accuracy || existing.capturedAt !== input.capturedAt || existing.battery !== (input.battery ?? null)) {
          throw new ApiError(409, 'Sequência já utilizada com outro conteúdo.');
        }
        return;
      }
      validateRecentTimestamp(input.capturedAt);
      if (Date.parse(input.capturedAt) < Date.parse(incident.createdAt) - 300_000) throw new ApiError(400, 'Localização anterior à ocorrência.');
      this.run('INSERT INTO locations VALUES (?,?,?,?,?,?,?,?)', id, input.sequence, input.latitude, input.longitude, input.accuracy, input.capturedAt, new Date().toISOString(), input.battery ?? null);
      this.change(device.agencyId, 'location.received', id);
    });
  }

  addAudio(device: Device, id: string, sequence: number, capturedAt: string, mimeType: string, data: Buffer) {
    if (!device.consentAudio) throw new ApiError(403, 'Áudio não autorizado pela assistida.');
    this.transaction(() => {
      const incident = this.ownedOpenIncident(device, id);
      const existing = this.get<AudioRow>('SELECT * FROM audio_chunks WHERE incidentId=? AND sequence=?', id, sequence);
      if (existing) {
        if (existing.capturedAt !== capturedAt || existing.mimeType !== mimeType || !Buffer.from(existing.data).equals(data)) throw new ApiError(409, 'Sequência de áudio já utilizada com outro conteúdo.');
        return;
      }
      validateRecentTimestamp(capturedAt);
      if (Date.parse(capturedAt) < Date.parse(incident.createdAt) - 300_000) throw new ApiError(400, 'Áudio anterior à ocorrência.');
      this.run('INSERT INTO audio_chunks VALUES (?,?,?,?,?,?,?)', randomUUID(), id, sequence, capturedAt, new Date().toISOString(), mimeType, data);
      this.change(device.agencyId, 'audio.received', id);
    });
  }

  acknowledge(operator: Operator, id: string) {
    return this.transaction(() => {
      const incident = this.incident(id, operator.agencyId);
      if (incident.status === 'resolved') throw new ApiError(409, 'Ocorrência encerrada.');
      if (!incident.acknowledgedAt) {
        this.run('UPDATE incidents SET acknowledgedAt=?,revision=revision+1 WHERE id=?', new Date().toISOString(), id);
        this.audit(operator.agencyId, 'incident.acknowledged', operator.name, id, 'Recebimento reconhecido por uma pessoa na central.');
        this.change(operator.agencyId, 'incident.acknowledged', id);
      }
      return this.incident(id, operator.agencyId);
    });
  }

  claim(operator: Operator, id: string, expectedRevision: number) {
    return this.transaction(() => {
      const incident = this.incident(id, operator.agencyId);
      if (incident.revision !== expectedRevision || incident.status !== 'new' || incident.assignedTo) throw new ApiError(409, 'Ocorrência alterada ou já atribuída. Atualize o painel.');
      const changed = this.run('UPDATE incidents SET status=?,assignedTo=?,revision=revision+1 WHERE id=? AND agencyId=? AND revision=? AND status=?', 'assigned', operator.id, id, operator.agencyId, expectedRevision, 'new');
      if (!changed.changes) throw new ApiError(409, 'Ocorrência alterada. Atualize o painel.');
      this.audit(operator.agencyId, 'incident.claimed', operator.name, id, 'Operador assumiu a responsabilidade pelo atendimento.');
      this.change(operator.agencyId, 'incident.claimed', id);
      return this.incident(id, operator.agencyId);
    });
  }

  resolve(operator: Operator, id: string, expectedRevision: number, resolution: string) {
    return this.transaction(() => {
      const incident = this.incident(id, operator.agencyId);
      if (incident.revision !== expectedRevision || incident.status === 'resolved') throw new ApiError(409, 'Ocorrência alterada ou já encerrada. Atualize o painel.');
      if (operator.role !== 'admin' && incident.assignedTo !== operator.id) throw new ApiError(403, 'Somente o responsável ou administrador pode encerrar.');
      const changed = this.run('UPDATE incidents SET status=?,resolvedAt=?,resolution=?,revision=revision+1 WHERE id=? AND agencyId=? AND revision=? AND status!=?', 'resolved', new Date().toISOString(), resolution, id, operator.agencyId, expectedRevision, 'resolved');
      if (!changed.changes) throw new ApiError(409, 'Ocorrência alterada. Atualize o painel.');
      this.audit(operator.agencyId, 'incident.resolved', operator.name, id, resolution);
      this.change(operator.agencyId, 'incident.resolved', id);
      return this.incident(id, operator.agencyId);
    });
  }

  locations(operator: Operator, id: string): LocationPoint[] {
    this.incident(id, operator.agencyId);
    return this.all<LocationRow>('SELECT * FROM locations WHERE incidentId=? ORDER BY capturedAt,sequence LIMIT 10000', id).map(row => this.publicLocation(row));
  }

  audioChunks(operator: Operator, id: string): AudioChunk[] {
    this.incident(id, operator.agencyId);
    return this.all<Omit<AudioChunk, 'url'>>('SELECT id,sequence,capturedAt,receivedAt,mimeType FROM audio_chunks WHERE incidentId=? ORDER BY sequence LIMIT 10000', id).map(row => ({ ...row, url: `/api/audio/${row.id}/content` }));
  }

  audioContent(operator: Operator, id: string): { mimeType: string; data: Buffer } {
    return this.transaction(() => {
      const chunk = this.get<AudioRow>('SELECT a.* FROM audio_chunks a JOIN incidents i ON i.id=a.incidentId WHERE a.id=? AND i.agencyId=?', id, operator.agencyId);
      if (!chunk) throw new ApiError(404, 'Áudio não encontrado.');
      this.audit(operator.agencyId, 'audio.accessed', operator.name, chunk.incidentId, `Bloco ${chunk.sequence} acessado para atendimento.`);
      return { mimeType: chunk.mimeType, data: Buffer.from(chunk.data) };
    });
  }

  latestSequence(agencyId: string): number {
    return this.get<{ seq: number | null }>('SELECT MAX(seq) seq FROM change_events WHERE agencyId=?', agencyId)?.seq ?? 0;
  }

  changesSince(agencyId: string, since: number): ChangeEvent[] {
    return this.all<{ seq: number; kind: string; incidentId: string | null }>('SELECT seq,kind,incidentId FROM change_events WHERE agencyId=? AND seq>? ORDER BY seq LIMIT 501', agencyId, since)
      .map(row => ({ seq: row.seq, kind: row.kind, ...(row.incidentId ? { incidentId: row.incidentId } : {}) }));
  }

  private seedDemo(operator: Operator) {
    const examples = [
      { name: 'Ana — pessoa fictícia', reference: 'DEMO-001', latitude: -9.9132, longitude: -63.0407, minutes: 3, assigned: false },
      { name: 'Beatriz — pessoa fictícia', reference: 'DEMO-002', latitude: -9.9084, longitude: -63.0299, minutes: 8, assigned: true },
      { name: 'Clara — pessoa fictícia', reference: 'DEMO-003', latitude: -9.9238, longitude: -63.0452, minutes: 17, assigned: false },
    ];
    for (const example of examples) {
      const woman = this.createWoman(operator, { name: example.name, phone: '(69) 00000-0000', reference: example.reference, notes: 'SIMULAÇÃO: cadastro e coordenadas fictícios em Ariquemes. Não deslocar equipes.' });
      const pairing = this.createPairing(operator, woman.id);
      const paired = this.pairDevice(pairing.code, false);
      const device = this.device(paired.deviceToken)!;
      const createdAt = new Date(Date.now() - example.minutes * 60_000).toISOString();
      let incident = this.createIncident(device, { clientEventId: randomUUID(), trigger: 'hold', simulated: true, createdAt });
      this.addLocation(device, incident.id, { sequence: 1, latitude: example.latitude, longitude: example.longitude, accuracy: 24, capturedAt: createdAt, battery: 76 });
      if (example.assigned) {
        incident = this.acknowledge(operator, incident.id);
        this.claim(operator, incident.id, incident.revision);
      }
    }
  }

  close() { this.events.removeAllListeners(); this.db.close(); }
}
