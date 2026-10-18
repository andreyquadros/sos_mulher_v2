import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { readConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { hashToken } from '../src/security.js';

const tables = ['metadata', 'operators', 'sessions', 'women', 'pairings', 'devices', 'incidents', 'client_events', 'locations', 'audio_chunks', 'audit', 'change_events', 'sqlite_sequence'];
const timestamp = '2026-10-01T10:00:00.000Z';

function snapshot(db: DatabaseSync) {
  return Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}

async function legacyFixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'lume-migration-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'legacy.sqlite');
  const db = new DatabaseSync(path);
  db.exec(await readFile(new URL('./fixtures/schema-v0.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO operators VALUES (?,?,?,?,?,?)').run('operator-a', 'Operadora fictícia', 'migration@example.test', 'agency-a', 'admin', 'unused-hash');
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run('old-session-hash', 'operator-a', timestamp, timestamp);
  for (let index = 1; index <= 3; index++) {
    db.prepare('INSERT INTO women VALUES (?,?,?,?,?,?,?)').run(`woman-${index}`, `Pessoa fictícia ${index}`, '(69) 00000-0000', `LEGACY-${index}`, 'Dados artificiais.', 'agency-a', timestamp);
    db.prepare('INSERT INTO devices VALUES (?,?,?,?,?,?,?,?)').run(`device-${index}`, `woman-${index}`, hashToken(`legacy-token-${index}`), '2026-10', 1, 1, timestamp, null);
    db.prepare('INSERT INTO incidents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(`incident-${index}`, `ML-LEGACY-${index}`, `woman-${index}`, `device-${index}`, 'agency-a', index === 1 ? 'assigned' : index === 2 ? 'resolved' : 'new', index === 3 ? 1 : 0, ['hold', 'volume', 'notification'][index - 1]!, timestamp, timestamp, index === 1 ? timestamp : null, index === 1 ? 'operator-a' : null, index === 2 ? timestamp : null, index === 2 ? 'Encerramento fictício.' : null, index + 1);
    db.prepare('INSERT INTO client_events VALUES (?,?,?)').run(`device-${index}`, `client-${index}`, `incident-${index}`);
    db.prepare('INSERT INTO locations VALUES (?,?,?,?,?,?,?,?)').run(`incident-${index}`, 1, -9.9238, -63.0452, 20, timestamp, timestamp, 80);
    db.prepare('INSERT INTO audio_chunks VALUES (?,?,?,?,?,?,?)').run(`audio-${index}`, `incident-${index}`, 1, timestamp, timestamp, 'audio/mp4', Buffer.from([0, 1, 2, index]));
    db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?,?)').run(`audit-${index}`, 'agency-a', 'incident.created', 'Assistida fictícia', `incident-${index}`, timestamp, 'Auditoria preservada.');
  }
  db.prepare('INSERT INTO client_events VALUES (?,?,?)').run('device-1', 'client-alias', 'incident-1');
  db.prepare('INSERT INTO pairings VALUES (?,?,?,?,?)').run('old-code-hash', 'woman-1', timestamp, timestamp, timestamp);
  db.prepare('INSERT INTO change_events VALUES (?,?,?,?,?)').run(7, 'agency-a', 'incident.created', 'incident-1', timestamp);
  db.prepare('INSERT INTO change_events VALUES (?,?,?,?,?)').run(9, 'agency-a', 'incident.assigned', 'incident-1', timestamp);
  db.exec(`
    CREATE INDEX institutional_incident_revision ON incidents(revision);
    CREATE VIEW institutional_open_incidents AS SELECT id,trigger FROM incidents WHERE status!='resolved';
    CREATE TRIGGER institutional_incident_update AFTER UPDATE ON incidents BEGIN
      INSERT OR REPLACE INTO metadata(key,value) VALUES ('trigger-observed',NEW.trigger);
    END;
    CREATE TRIGGER institutional_woman_update AFTER UPDATE ON women BEGIN
      INSERT OR REPLACE INTO metadata(key,value) SELECT 'incident-count',CAST(COUNT(*) AS TEXT) FROM incidents;
    END;
  `);
  return { db, path, config: readConfig({ environment: 'test', databasePath: path, demoMode: false }) };
}

test('migração v0→v1 aceita voz e preserva dados, referências, índices, views, triggers e aliases', async t => {
  const fixture = await legacyFixture(t);
  const before = snapshot(fixture.db);
  const foreignKeys = fixture.db.prepare('PRAGMA foreign_key_list(locations)').all();
  fixture.db.close();
  const store = new Store(fixture.config);
  try {
    assert.equal(store.get<{ user_version: number }>('PRAGMA user_version')!.user_version, 1);
    assert.equal(store.get<{ foreign_keys: number }>('PRAGMA foreign_keys')!.foreign_keys, 1);
    assert.deepEqual(snapshot(store.db), before);
    assert.deepEqual(store.all('PRAGMA foreign_key_list(locations)'), foreignKeys);
    assert.deepEqual(store.all('PRAGMA foreign_key_check'), []);
    assert.equal(store.get<{ integrity_check: string }>('PRAGMA integrity_check')!.integrity_check, 'ok');
    assert.equal(store.all('SELECT * FROM institutional_open_incidents').length, 2);
    assert.ok(store.get('SELECT name FROM sqlite_schema WHERE name=?', 'institutional_incident_revision'));
    const device = store.device('legacy-token-1')!;
    // A historical UUID replay still resolves before timestamp freshness validation.
    assert.equal(store.createIncident(device, { clientEventId: 'client-alias', trigger: 'voice', simulated: false, createdAt: timestamp }).id, 'incident-1');
    store.run('UPDATE incidents SET trigger=? WHERE id=?', 'voice', 'incident-1');
    assert.equal(store.get<{ value: string }>('SELECT value FROM metadata WHERE key=?', 'trigger-observed')!.value, 'voice');
    store.run('UPDATE women SET notes=? WHERE id=?', 'Continua fictício.', 'woman-1');
    assert.equal(store.get<{ value: string }>('SELECT value FROM metadata WHERE key=?', 'incident-count')!.value, '3');
    assert.throws(() => store.run('UPDATE locations SET incidentId=? WHERE incidentId=?', 'unknown-parent', 'incident-1'), /FOREIGN KEY/);
    assert.throws(() => store.run('UPDATE incidents SET trigger=? WHERE id=?', 'unsupported', 'incident-1'), /CHECK/);
    assert.throws(() => store.run(`INSERT INTO incidents SELECT id||'-duplicate',code||'-duplicate',womanId,deviceId,agencyId,status,simulated,trigger,createdAt,receivedAt,acknowledgedAt,assignedTo,resolvedAt,resolution,revision FROM incidents WHERE id=?`, 'incident-1'), /UNIQUE/);
    store.run('INSERT INTO change_events(agencyId,kind,incidentId,createdAt) VALUES (?,?,?,?)', 'agency-a', 'test.after-migration', 'incident-1', timestamp);
    assert.equal(store.latestSequence('agency-a'), 10);
    const rowsAfterFirstOpen = snapshot(store.db);
    store.close();
    const reopened = new Store(fixture.config);
    try {
      assert.deepEqual(snapshot(reopened.db), rowsAfterFirstOpen);
      assert.deepEqual(reopened.all('PRAGMA foreign_key_check'), []);
      assert.equal(reopened.get<{ user_version: number }>('PRAGMA user_version')!.user_version, 1);
    } finally { reopened.close(); }
  } finally { if (store.db.isOpen) store.close(); }
});

test('falha de FK reverte integralmente a migração e deixa a versão anterior recuperável', async t => {
  const fixture = await legacyFixture(t);
  fixture.db.exec('PRAGMA foreign_keys=OFF');
  fixture.db.prepare('UPDATE locations SET incidentId=? WHERE incidentId=?').run('missing-before-update', 'incident-1');
  const before = snapshot(fixture.db);
  fixture.db.close();
  assert.throws(() => new Store(fixture.config), /integridade referencial/);
  const reopened = new DatabaseSync(fixture.path);
  try {
    assert.equal((reopened.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 0);
    assert.deepEqual(snapshot(reopened), before);
    assert.match(String(reopened.prepare("SELECT sql FROM sqlite_schema WHERE name='incidents'").get()!.sql), /'hold','volume','notification'\)/);
    assert.equal(reopened.prepare("SELECT name FROM sqlite_schema WHERE name='incidents_voice_v1'").get(), undefined);
    assert.equal(reopened.prepare('SELECT * FROM institutional_open_incidents').all().length, 2);
  } finally { reopened.close(); }
});

test('esquema futuro e colunas não reconhecidas são recusados sem descartar dados', async t => {
  const fixture = await legacyFixture(t);
  fixture.db.exec('PRAGMA user_version=2');
  const before = snapshot(fixture.db);
  fixture.db.close();
  assert.throws(() => new Store(fixture.config), /versão mais recente/);
  const db = new DatabaseSync(fixture.path);
  assert.deepEqual(snapshot(db), before);
  db.exec("PRAGMA user_version=0; ALTER TABLE incidents ADD COLUMN institutional_note TEXT DEFAULT 'preservar'");
  const customized = snapshot(db);
  db.close();
  assert.throws(() => new Store(fixture.config), /Esquema de ocorrências desconhecido/);
  const reopened = new DatabaseSync(fixture.path);
  try {
    assert.deepEqual(snapshot(reopened), customized);
    assert.equal((reopened.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 0);
    assert.equal((reopened.prepare('SELECT institutional_note FROM incidents').get() as { institutional_note: string }).institutional_note, 'preservar');
  } finally { reopened.close(); }
});
