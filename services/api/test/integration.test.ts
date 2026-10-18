import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { createApp } from '../src/app.js';
import type { Incident, Operator, Woman } from '../src/models.js';
import { hashToken } from '../src/security.js';
import { readConfig } from '../src/config.js';

const origin = 'http://localhost:5173';
const admin = { email: 'admin@example.test', password: 'Institutional-Test-2026!' };
const consent = { consentVersion: '2026-10', consentLocation: true, consentAudio: true };

async function fixture(t: TestContext, options: Parameters<typeof createApp>[0] = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'mulher-lume-api-'));
  const databasePath = join(directory, 'test.sqlite');
  const app = await createApp({ environment: 'test', databasePath, panelOrigin: origin, demoMode: false, adminEmail: admin.email, adminPassword: admin.password, adminName: 'Operadora de teste', agencyId: 'agency-a', heartbeatMs: 30, ...options });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  return { app, databasePath };
}
type App = Awaited<ReturnType<typeof createApp>>;

async function login(app: App, credentials = admin) {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: credentials });
  assert.equal(response.statusCode, 200, response.body);
  const raw = response.headers['set-cookie'];
  assert.equal(typeof raw, 'string');
  return { cookie: (raw as string).split(';')[0]!, operator: response.json().operator as Operator, rawCookie: raw as string };
}

async function registerDevice(app: App, cookie: string, audio = true) {
  const response = await app.inject({ method: 'POST', url: '/api/women', headers: { origin, cookie }, payload: { name: 'Pessoa fictícia de teste', phone: '(69) 00000-0000', reference: `TEST-${randomUUID()}`, notes: 'Registro artificial para teste.' } });
  assert.equal(response.statusCode, 201, response.body);
  const woman = response.json().woman as Woman;
  const paired = await app.inject({ method: 'POST', url: `/api/women/${woman.id}/pairing`, headers: { origin, cookie }, payload: {} });
  assert.equal(paired.statusCode, 200, paired.body);
  const { code } = paired.json();
  const pair = await app.inject({ method: 'POST', url: '/api/devices/pair', payload: { ...consent, consentAudio: audio, code } });
  assert.equal(pair.statusCode, 200, pair.body);
  const { deviceId, deviceToken } = pair.json();
  return { woman, code: code as string, deviceId: deviceId as string, deviceToken: deviceToken as string, authorization: `Bearer ${deviceToken}` };
}

async function incident(app: App, authorization: string, clientEventId = randomUUID()) {
  const payload = { clientEventId, trigger: 'hold', simulated: false, createdAt: new Date().toISOString() };
  const response = await app.inject({ method: 'POST', url: '/api/device/incidents', headers: { authorization }, payload });
  assert.equal(response.statusCode, 201, response.body);
  return { incident: response.json().incident as Incident, payload };
}

test('sessão opaca, scrypt, cookie HttpOnly e origem obrigatória; logout revoga sessão', async t => {
  const { app, databasePath } = await fixture(t);
  const blocked = await app.inject({ method: 'POST', url: '/api/auth/login', payload: admin });
  assert.equal(blocked.statusCode, 403);
  const cross = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: 'https://hostil.example' }, payload: admin });
  assert.equal(cross.statusCode, 403);
  const { cookie, rawCookie, operator } = await login(app);
  assert.match(rawCookie, /HttpOnly/);
  assert.match(rawCookie, /SameSite=Strict/);
  assert.equal('passwordHash' in operator, false);
  const password = app.store.operatorByEmail(admin.email)!.passwordHash;
  assert.match(password, /^scrypt\$/);
  assert.equal(password.includes(admin.password), false);
  const persisted = app.store.get<{ tokenHash: string }>('SELECT tokenHash FROM sessions')!;
  assert.equal(persisted.tokenHash, hashToken(cookie.split('=')[1]!));
  assert.equal(persisted.tokenHash.includes(cookie.split('=')[1]!), false);
  assert.equal((await stat(databasePath)).mode & 0o777, 0o600);
  assert.equal((await app.inject({ url: '/api/auth/me', headers: { cookie } })).statusCode, 200);
  assert.equal((await app.inject({ url: '/api/auth/me', headers: { authorization: `Bearer ${cookie.split('=')[1]}` } })).statusCode, 401);
  const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { origin, cookie }, payload: {} });
  assert.equal(logout.statusCode, 200);
  assert.equal((await app.inject({ url: '/api/auth/me', headers: { cookie } })).statusCode, 401);
  assert.match(String(logout.headers['set-cookie']), /Max-Age=0/);
});

test('pareamento exige adesão explícita, expira, só usa uma vez e substituição revoga token antigo', async t => {
  const { app } = await fixture(t);
  const { cookie } = await login(app);
  const paired = await registerDevice(app, cookie);
  assert.match(paired.code, /^\d{8}$/);
  assert.equal((await app.inject({ method: 'POST', url: '/api/devices/pair', payload: { ...consent, code: paired.code } })).statusCode, 400);
  const row = app.store.get<{ tokenHash: string }>('SELECT tokenHash FROM devices WHERE id=?', paired.deviceId)!;
  assert.equal(row.tokenHash, hashToken(paired.deviceToken));
  assert.equal((await app.inject({ url: '/api/devices/me', headers: { authorization: paired.authorization } })).statusCode, 200);
  const newPairing = await app.inject({ method: 'POST', url: `/api/women/${paired.woman.id}/pairing`, headers: { origin, cookie }, payload: {} });
  const code = newPairing.json().code;
  assert.equal((await app.inject({ method: 'POST', url: '/api/devices/pair', payload: { ...consent, consentLocation: false, code } })).statusCode, 400);
  const replacement = await app.inject({ method: 'POST', url: '/api/devices/pair', payload: { ...consent, code } });
  assert.equal(replacement.statusCode, 200, replacement.body);
  assert.equal((await app.inject({ url: '/api/devices/me', headers: { authorization: paired.authorization } })).statusCode, 401);
  const expiring = await app.inject({ method: 'POST', url: `/api/women/${paired.woman.id}/pairing`, headers: { origin, cookie }, payload: {} });
  app.store.run('UPDATE pairings SET expiresAt=? WHERE codeHash=?', '2000-01-01T00:00:00.000Z', hashToken(expiring.json().code));
  assert.equal((await app.inject({ method: 'POST', url: '/api/devices/pair', payload: { ...consent, code: expiring.json().code } })).statusCode, 400);
});

test('ocorrência idempotente por dispositivo e evento; apenas uma aberta e sem parear durante atendimento', async t => {
  const { app } = await fixture(t);
  const { cookie } = await login(app);
  const paired = await registerDevice(app, cookie);
  const created = await incident(app, paired.authorization);
  const replay = await app.inject({ method: 'POST', url: '/api/device/incidents', headers: { authorization: paired.authorization }, payload: created.payload });
  assert.equal(replay.json().incident.id, created.incident.id);
  const repeated = await incident(app, paired.authorization);
  assert.equal(repeated.incident.id, created.incident.id);
  assert.equal(app.store.get<{ count: number }>('SELECT COUNT(*) count FROM incidents')!.count, 1);
  const pairing = await app.inject({ method: 'POST', url: `/api/women/${paired.woman.id}/pairing`, headers: { origin, cookie }, payload: {} });
  const replace = await app.inject({ method: 'POST', url: '/api/devices/pair', payload: { ...consent, code: pairing.json().code } });
  assert.equal(replace.statusCode, 409);
  const me = await app.inject({ url: '/api/devices/me', headers: { authorization: paired.authorization } });
  assert.equal(me.json().activeIncident.id, created.incident.id);
});

test('voz é origem válida, mantém idempotência/isolamento e não aceita frase ou áudio de treino no payload', async t => {
  const { app } = await fixture(t);
  const { cookie, operator } = await login(app);
  const paired = await registerDevice(app, cookie);
  const other = await registerDevice(app, cookie);
  const payload = { clientEventId: randomUUID(), trigger: 'voice', simulated: false, createdAt: new Date().toISOString() };
  const send = (authorization: string, body = payload) => app.inject({ method: 'POST', url: '/api/device/incidents', headers: { authorization }, payload: body });
  const created = await send(paired.authorization);
  assert.equal(created.statusCode, 201, created.body);
  const original = created.json().incident as Incident;
  assert.equal(original.trigger, 'voice');
  assert.equal((await send(paired.authorization)).json().incident.id, original.id);
  const independent = await send(other.authorization);
  assert.equal(independent.statusCode, 201, independent.body);
  assert.notEqual(independent.json().incident.id, original.id);
  assert.equal((await app.inject({ method: 'POST', url: '/api/device/incidents', headers: { authorization: paired.authorization }, payload: { ...payload, phrase: 'não deve ser enviada' } })).statusCode, 400);
  assert.equal((await send(paired.authorization, { ...payload, trigger: 'unrecognized' })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/api/device/incidents', payload })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: `/api/device/incidents/${original.id}/locations`, headers: { authorization: other.authorization }, payload: { sequence: 1, latitude: -9.92, longitude: -63.04, accuracy: 20, capturedAt: payload.createdAt } })).statusCode, 404);
  await app.store.createOperator({ name: 'Operadora de outra agência', email: 'voice-other@example.test', agencyId: 'agency-b', role: 'admin' }, admin.password, operator.name);
  const alternate = await login(app, { email: 'voice-other@example.test', password: admin.password });
  const outsider = await registerDevice(app, alternate.cookie);
  const outsideIncident = await send(outsider.authorization);
  assert.equal(outsideIncident.statusCode, 201, outsideIncident.body);
  const snapshot = (await app.inject({ url: '/api/snapshot', headers: { cookie } })).json();
  assert.equal(snapshot.incidents.length, 2);
  assert.ok(snapshot.incidents.every((item: Incident) => item.trigger === 'voice'));
  assert.equal(snapshot.incidents.some((item: Incident) => item.id === outsideIncident.json().incident.id), false);
  assert.equal(app.store.all('SELECT * FROM client_events WHERE incidentId=?', original.id).length, 1);
});

test('localização fora de ordem não retrocede; valida coordenadas e impede escrita de outro aparelho', async t => {
  const { app } = await fixture(t);
  const { cookie } = await login(app);
  const paired = await registerDevice(app, cookie);
  const other = await registerDevice(app, cookie);
  const created = await incident(app, paired.authorization);
  const url = `/api/device/incidents/${created.incident.id}/locations`;
  const newest = { sequence: 2, latitude: -9.91, longitude: -63.04, accuracy: 20, battery: 80, capturedAt: new Date().toISOString() };
  const earlier = { ...newest, sequence: 1, latitude: -9.92, capturedAt: new Date(Date.now() - 5000).toISOString() };
  for (const payload of [newest, earlier, newest]) {
    const response = await app.inject({ method: 'POST', url, headers: { authorization: paired.authorization }, payload });
    assert.equal(response.statusCode, 200, response.body);
  }
  assert.equal((await app.inject({ method: 'POST', url, headers: { authorization: paired.authorization }, payload: { ...newest, latitude: -9.93 } })).statusCode, 409);
  assert.equal((await app.inject({ method: 'POST', url, headers: { authorization: paired.authorization }, payload: { ...newest, sequence: 3, latitude: 100 } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url, headers: { authorization: other.authorization }, payload: newest })).statusCode, 404);
  const snapshot = (await app.inject({ url: '/api/snapshot', headers: { cookie } })).json();
  assert.equal(snapshot.incidents[0].lastLocation.sequence, 2);
  assert.equal(snapshot.incidents[0].lastLocation.latitude, newest.latitude);
  const locations = (await app.inject({ url: `/api/incidents/${created.incident.id}/locations`, headers: { cookie } })).json().locations;
  assert.equal(locations.length, 2);
});

test('emergência durante simulação promove a mesma ocorrência, reavisa e preserva responsável com retry idempotente', async t => {
  const { app } = await fixture(t);
  const { cookie, operator } = await login(app);
  const paired = await registerDevice(app, cookie);
  const simulatedPayload = { clientEventId: randomUUID(), trigger: 'hold', simulated: true, createdAt: new Date(Date.now() - 30_000).toISOString() };
  const simulated = await app.inject({ method: 'POST', url: '/api/device/incidents', headers: { authorization: paired.authorization }, payload: simulatedPayload });
  assert.equal(simulated.statusCode, 201, simulated.body);
  const original = simulated.json().incident as Incident;
  assert.equal(original.simulated, true);
  const acknowledged = await app.inject({ method: 'POST', url: `/api/incidents/${original.id}/ack`, headers: { origin, cookie }, payload: {} });
  const assigned = await app.inject({ method: 'POST', url: `/api/incidents/${original.id}/claim`, headers: { origin, cookie }, payload: { expectedRevision: acknowledged.json().incident.revision } });
  assert.equal(assigned.statusCode, 200, assigned.body);
  const before = assigned.json().incident as Incident;
  // Establish a deterministic older receipt timestamp without sleeping in this test.
  const previousReceipt = new Date(Date.now() - 60_000).toISOString();
  app.store.run('UPDATE incidents SET receivedAt=? WHERE id=?', previousReceipt, original.id);
  const realPayload = { ...simulatedPayload, clientEventId: randomUUID(), simulated: false, trigger: 'voice', createdAt: new Date().toISOString() };
  const promoted = await app.inject({ method: 'POST', url: '/api/device/incidents', headers: { authorization: paired.authorization }, payload: realPayload });
  assert.equal(promoted.statusCode, 201, promoted.body);
  const real = promoted.json().incident as Incident;
  assert.equal(real.id, original.id);
  assert.equal(real.simulated, false);
  assert.equal(real.trigger, 'voice');
  assert.equal(real.status, 'assigned');
  assert.equal(real.assignedTo, operator.id);
  assert.equal(real.assignedName, operator.name);
  assert.equal(real.acknowledgedAt, null);
  assert.equal(real.revision, before.revision + 1);
  assert.ok(real.receivedAt > previousReceipt);
  const replays = await Promise.all([realPayload, realPayload, simulatedPayload].map(payload => app.inject({ method: 'POST', url: '/api/device/incidents', headers: { authorization: paired.authorization }, payload })));
  for (const replay of replays) {
    assert.equal(replay.statusCode, 201, replay.body);
    assert.equal(replay.json().incident.id, real.id);
    assert.equal(replay.json().incident.simulated, false);
    assert.equal(replay.json().incident.revision, real.revision);
  }
  assert.equal(app.store.get<{ count: number }>('SELECT COUNT(*) count FROM incidents')!.count, 1);
  assert.equal(app.store.get<{ count: number }>('SELECT COUNT(*) count FROM client_events WHERE incidentId=?', real.id)!.count, 2);
  assert.equal(app.store.get<{ count: number }>('SELECT COUNT(*) count FROM audit WHERE action=? AND incidentId=?', 'incident.escalated', real.id)!.count, 1);
  assert.equal(app.store.changesSince(operator.agencyId, 0).filter(event => event.kind === 'incident.escalated').length, 1);
  const staleResolve = await app.inject({ method: 'POST', url: `/api/incidents/${real.id}/resolve`, headers: { origin, cookie }, payload: { expectedRevision: before.revision, resolution: 'Encerramento antigo do treinamento.' } });
  assert.equal(staleResolve.statusCode, 409);
  const lower = await app.inject({ method: 'POST', url: '/api/device/incidents', headers: { authorization: paired.authorization }, payload: { ...simulatedPayload, clientEventId: randomUUID(), createdAt: new Date().toISOString() } });
  assert.equal(lower.statusCode, 409);
  assert.equal((await app.inject({ url: '/api/devices/me', headers: { authorization: paired.authorization } })).json().activeIncident.simulated, false);
});

test('uma promoção solicitada no modo de demonstração permanece explicitamente simulada', async t => {
  const { app } = await fixture(t, { demoMode: true });
  const { cookie, operator } = await login(app, { email: 'demo@mulher.ro.gov.br', password: 'Lume-Demo-2026!' });
  const paired = await registerDevice(app, cookie);
  const first = await incident(app, paired.authorization);
  const second = await incident(app, paired.authorization);
  assert.equal(first.incident.id, second.incident.id);
  assert.equal(second.incident.simulated, true);
  assert.equal(app.store.changesSince(operator.agencyId, 0).filter(event => event.kind === 'incident.escalated').length, 0);
});

test('reconhecimento é humano e separado da atribuição; concorrência respeita revisão e autorização no encerramento', async t => {
  const { app } = await fixture(t);
  const first = await login(app);
  await app.store.createOperator({ email: 'second@example.test', name: 'Segundo operador', agencyId: 'agency-a', role: 'dispatcher' }, admin.password);
  await app.store.createOperator({ email: 'third@example.test', name: 'Terceiro operador', agencyId: 'agency-a', role: 'dispatcher' }, admin.password);
  const second = await login(app, { email: 'second@example.test', password: admin.password });
  const third = await login(app, { email: 'third@example.test', password: admin.password });
  const paired = await registerDevice(app, first.cookie);
  const { incident: created } = await incident(app, paired.authorization);
  assert.equal(created.acknowledgedAt, null);
  const ack = await app.inject({ method: 'POST', url: `/api/incidents/${created.id}/ack`, headers: { origin, cookie: first.cookie }, payload: {} });
  assert.equal(ack.statusCode, 200, ack.body);
  assert.ok(ack.json().incident.acknowledgedAt);
  assert.equal(ack.json().incident.status, 'new');
  assert.equal(ack.json().incident.assignedTo, null);
  const expectedRevision = ack.json().incident.revision;
  const claims = await Promise.all([second, third].map(user => app.inject({ method: 'POST', url: `/api/incidents/${created.id}/claim`, headers: { origin, cookie: user.cookie }, payload: { expectedRevision } })));
  assert.deepEqual(claims.map(result => result.statusCode).sort(), [200, 409]);
  const winnerIndex = claims.findIndex(result => result.statusCode === 200);
  const winner = [second, third][winnerIndex]!;
  const loser = [second, third][winnerIndex === 0 ? 1 : 0]!;
  const assigned = claims[winnerIndex]!.json().incident;
  assert.equal(assigned.assignedTo, winner.operator.id);
  const resolution = 'Teste encerrado com segurança e atendimento concluído.';
  assert.equal((await app.inject({ method: 'POST', url: `/api/incidents/${created.id}/resolve`, headers: { origin, cookie: loser.cookie }, payload: { expectedRevision: assigned.revision, resolution } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: `/api/incidents/${created.id}/resolve`, headers: { origin, cookie: winner.cookie }, payload: { expectedRevision, resolution } })).statusCode, 409);
  const resolved = await app.inject({ method: 'POST', url: `/api/incidents/${created.id}/resolve`, headers: { origin, cookie: winner.cookie }, payload: { expectedRevision: assigned.revision, resolution } });
  assert.equal(resolved.statusCode, 200, resolved.body);
  assert.equal(resolved.json().incident.status, 'resolved');
  assert.equal((await app.inject({ url: '/api/devices/me', headers: { authorization: paired.authorization } })).json().activeIncident, null);
  const oldReplay = await incident(app, paired.authorization, randomUUID());
  assert.notEqual(oldReplay.incident.id, created.id);
  const audit = (await app.inject({ url: '/api/snapshot', headers: { cookie: first.cookie } })).json().audit;
  assert.equal(audit.filter((row: { action: string }) => row.action === 'incident.claimed').length, 1);
  assert.ok(audit.find((row: { detail: string }) => row.detail === resolution));
});

test('RBAC e isolamento de agência cobrem cadastro, pareamento, ocorrências, localizações e áudio', async t => {
  const { app } = await fixture(t);
  const first = await login(app);
  const paired = await registerDevice(app, first.cookie);
  const { incident: created } = await incident(app, paired.authorization);
  await app.store.createOperator({ email: 'foreign@example.test', name: 'Outra agência', agencyId: 'agency-b', role: 'admin' }, admin.password);
  await app.store.createOperator({ email: 'observer@example.test', name: 'Observador', agencyId: 'agency-a', role: 'observer' }, admin.password);
  const foreign = await login(app, { email: 'foreign@example.test', password: admin.password });
  const observer = await login(app, { email: 'observer@example.test', password: admin.password });
  const snapshot = (await app.inject({ url: '/api/snapshot', headers: { cookie: foreign.cookie } })).json();
  assert.equal(snapshot.women.length, 0);
  assert.equal(snapshot.incidents.length, 0);
  for (const url of [`/api/incidents/${created.id}/locations`, `/api/incidents/${created.id}/audio`]) {
    assert.equal((await app.inject({ url, headers: { cookie: foreign.cookie } })).statusCode, 404);
  }
  assert.equal((await app.inject({ method: 'POST', url: `/api/women/${paired.woman.id}/pairing`, headers: { origin, cookie: foreign.cookie }, payload: {} })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: `/api/incidents/${created.id}/claim`, headers: { origin, cookie: foreign.cookie }, payload: { expectedRevision: 1 } })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: `/api/incidents/${created.id}/ack`, headers: { origin, cookie: observer.cookie }, payload: {} })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/api/women', headers: { origin, cookie: observer.cookie }, payload: { name: 'Teste', phone: '00000000', reference: 'TESTE' } })).statusCode, 403);
  const injection = await app.inject({ method: 'POST', url: '/api/women', headers: { origin, cookie: first.cookie }, payload: { name: 'Teste', phone: '00000000', reference: 'TESTE', agencyId: 'agency-b' } });
  assert.equal(injection.statusCode, 400);
});

test('áudio exige consentimento, tamanho e autenticação, é idempotente, privado e auditado', async t => {
  const { app } = await fixture(t);
  const { cookie } = await login(app);
  const paired = await registerDevice(app, cookie);
  const noAudio = await registerDevice(app, cookie, false);
  const { incident: created } = await incident(app, paired.authorization);
  const deniedIncident = await incident(app, noAudio.authorization);
  const capturedAt = encodeURIComponent(new Date().toISOString());
  const url = `/api/device/incidents/${created.id}/audio?sequence=1&capturedAt=${capturedAt}`;
  // Transport tests use artificial bytes, never expose them as real demonstration recordings.
  const payload = Buffer.from([0xff, 0xf1, 0x50, 0x80, 0x01, 0x7f, 0xfc]);
  const headers = { authorization: paired.authorization, 'content-type': 'audio/aac' };
  assert.equal((await app.inject({ method: 'POST', url: `/api/device/incidents/${deniedIncident.incident.id}/audio?sequence=1&capturedAt=${capturedAt}`, headers: { ...headers, authorization: noAudio.authorization }, payload })).statusCode, 403);
  for (let attempt = 0; attempt < 2; attempt++) assert.equal((await app.inject({ method: 'POST', url, headers, payload })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url, headers, payload: Buffer.from('different') })).statusCode, 409);
  assert.equal((await app.inject({ method: 'POST', url: url.replace('sequence=1', 'sequence=2'), headers, payload: Buffer.alloc(512 * 1024 + 1) })).statusCode, 413);
  assert.equal((await app.inject({ method: 'POST', url, headers: { ...headers, 'content-type': 'text/plain' }, payload: 'audio' })).statusCode, 415);
  const listed = await app.inject({ url: `/api/incidents/${created.id}/audio`, headers: { cookie } });
  assert.equal(listed.json().chunks.length, 1);
  const chunkUrl = listed.json().chunks[0].url;
  assert.equal(chunkUrl.includes('token'), false);
  assert.equal((await app.inject({ url: chunkUrl })).statusCode, 401);
  const played = await app.inject({ url: chunkUrl, headers: { cookie } });
  assert.equal(played.statusCode, 200);
  assert.equal(played.headers['cache-control'], 'no-store');
  assert.equal(played.headers['content-type'], 'audio/aac');
  assert.deepEqual(played.rawPayload, payload);
  await app.store.createOperator({ email: 'foreign@example.test', name: 'Outra agência', agencyId: 'agency-b', role: 'admin' }, admin.password);
  const foreign = await login(app, { email: 'foreign@example.test', password: admin.password });
  assert.equal((await app.inject({ url: chunkUrl, headers: { cookie: foreign.cookie } })).statusCode, 404);
  assert.equal(app.store.get<{ count: number }>('SELECT COUNT(*) count FROM audit WHERE action=?', 'audio.accessed')!.count, 1);
});

test('datas inválidas/futuras, sessão expirada e limitação de login falham de forma fechada', async t => {
  const { app } = await fixture(t);
  const { cookie } = await login(app);
  const paired = await registerDevice(app, cookie);
  const created = await incident(app, paired.authorization);
  for (const createdAt of ['invalid', '2099-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z']) {
    const response = await app.inject({ method: 'POST', url: '/api/device/incidents', headers: { authorization: paired.authorization }, payload: { ...created.payload, clientEventId: randomUUID(), createdAt } });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(typeof response.json().error, 'string');
  }
  app.store.run('UPDATE sessions SET expiresAt=?', '2000-01-01T00:00:00.000Z');
  assert.equal((await app.inject({ url: '/api/snapshot', headers: { cookie } })).statusCode, 401);
  const statuses = [];
  for (let attempt = 0; attempt < 7; attempt++) statuses.push((await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email: 'missing@example.test', password: 'Wrong-password!' } })).statusCode);
  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 401, 429]);
});

test('limite geral isola identidades válidas mesmo atrás do mesmo IP e não confia em tokens inventados', async t => {
  const { app } = await fixture(t);
  const { cookie } = await login(app);
  const first = await registerDevice(app, cookie);
  const second = await registerDevice(app, cookie);
  for (let request = 0; request < 600; request++) {
    const result = await app.inject({ url: '/api/devices/me', headers: { authorization: first.authorization } });
    assert.equal(result.statusCode, 200, `Requisição ${request + 1}: ${result.body}`);
  }
  const blocked = await app.inject({ url: '/api/devices/me', headers: { authorization: first.authorization } });
  assert.equal(blocked.statusCode, 429);
  assert.equal((await app.inject({ url: '/api/devices/me', headers: { authorization: second.authorization } })).statusCode, 200);
  assert.equal((await app.inject({ url: '/api/snapshot', headers: { cookie } })).statusCode, 200);
  // All fabricated tokens must share one anonymous/IP bucket instead of creating
  // attacker-selected rate-limit identities. Pairing/login requests already used 3 slots.
  let rejectedAt = 0;
  for (let request = 0; request < 601; request++) {
    const token = Buffer.from(randomUUID() + randomUUID()).toString('base64url').slice(0, 43);
    const result = await app.inject({ url: '/api/health', headers: { authorization: `Bearer ${token}` } });
    if (result.statusCode === 429) { rejectedAt = request + 1; break; }
    assert.equal(result.statusCode, 200);
  }
  assert.ok(rejectedAt > 0 && rejectedAt <= 601);
  assert.equal((await app.inject({ url: '/api/devices/me', headers: { authorization: second.authorization } })).statusCode, 200);
  assert.equal((await app.inject({ url: '/api/snapshot', headers: { cookie } })).statusCode, 200);
});

test('proxy desativado ignora encaminhamento e configuração aceita somente zero a dois saltos', async t => {
  const { app } = await fixture(t, { trustProxyHops: 0 });
  app.get('/test/client-ip', request => ({ ip: request.ip }));
  const result = await app.inject({ url: '/test/client-ip', remoteAddress: '10.20.0.10', headers: { 'x-forwarded-for': '198.51.100.7, 10.20.0.5', forwarded: 'for=203.0.113.9' } });
  assert.equal(result.json().ip, '10.20.0.10');
  for (const value of [-1, 3, 1.5, Number.NaN]) assert.throws(() => readConfig({ environment: 'test', trustProxyHops: value }), /TRUST_PROXY_HOPS/);
  assert.equal(readConfig({}, { TRUST_PROXY_HOPS: '2' }).trustProxyHops, 2);
  assert.throws(() => readConfig({}, { TRUST_PROXY_HOPS: 'invalid' }), /TRUST_PROXY_HOPS/);
});

test('proxy de dois saltos seleciona cliente canônico sem aceitar prefixos forjados ou Forwarded alternativo', async t => {
  const { app } = await fixture(t, { trustProxyHops: 2 });
  app.get('/test/client-ip', request => ({ ip: request.ip }));
  const canonical = await app.inject({ url: '/test/client-ip', remoteAddress: '10.20.0.10', headers: { 'x-forwarded-for': '198.51.100.7, 10.20.0.5' } });
  assert.equal(canonical.json().ip, '198.51.100.7');
  const prefixed = await app.inject({ url: '/test/client-ip', remoteAddress: '10.20.0.10', headers: { 'x-forwarded-for': '203.0.113.66, 198.51.100.7, 10.20.0.5', forwarded: 'for=192.0.2.99', 'x-real-ip': '192.0.2.88' } });
  assert.equal(prefixed.json().ip, '198.51.100.7');
  const directPublic = await app.inject({ url: '/test/client-ip', remoteAddress: '203.0.113.99', headers: { 'x-forwarded-for': '198.51.100.7, 10.20.0.5' } });
  assert.equal(directPublic.json().ip, '203.0.113.99');
  // Login limits must distinguish real clients behind the same private Nginx,
  // while fabricated leading hops cannot reset one client's exhausted bucket.
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '10.20.0.10', headers: { origin, 'x-forwarded-for': `198.51.100.7, 10.20.0.5` }, payload: { email: `missing-${attempt}@example.test`, password: 'Invalid-password!' } });
    assert.equal(result.statusCode, 401, result.body);
  }
  const blocked = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '10.20.0.10', headers: { origin, 'x-forwarded-for': '192.0.2.123, 198.51.100.7, 10.20.0.5' }, payload: admin });
  assert.equal(blocked.statusCode, 429);
  const anotherClient = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '10.20.0.10', headers: { origin, 'x-forwarded-for': '198.51.100.8, 10.20.0.5' }, payload: admin });
  assert.equal(anotherClient.statusCode, 200, anotherClient.body);
});

test('proxy de um salto usa o cabeçalho canônico inserido pelo único proxy controlado', async t => {
  const { app } = await fixture(t, { trustProxyHops: 1 });
  app.get('/test/client-ip', request => ({ ip: request.ip }));
  const result = await app.inject({ url: '/test/client-ip', remoteAddress: '10.20.0.10', headers: { 'x-forwarded-for': '203.0.113.66, 198.51.100.7' } });
  assert.equal(result.json().ip, '198.51.100.7');
});

test('persistência sobrevive reinício com ocorrência, localização, sessão e auditoria', async t => {
  const { app, databasePath } = await fixture(t);
  const { cookie } = await login(app);
  const paired = await registerDevice(app, cookie);
  const { incident: created } = await incident(app, paired.authorization);
  await app.close();
  const restarted = await createApp({ environment: 'test', databasePath, demoMode: false, panelOrigin: origin });
  t.after(async () => restarted.close());
  const snapshot = await restarted.inject({ url: '/api/snapshot', headers: { cookie } });
  assert.equal(snapshot.statusCode, 200, snapshot.body);
  assert.equal(snapshot.json().incidents[0].id, created.id);
  assert.ok(snapshot.json().audit.find((row: { action: string }) => row.action === 'incident.created'));
  assert.equal((await restarted.inject({ url: '/api/devices/me', headers: { authorization: paired.authorization } })).json().activeIncident.id, created.id);
});

test('demonstração explícita contém três ocorrências fictícias e nunca pode virar produção', async t => {
  const { app, databasePath } = await fixture(t, { demoMode: true });
  const { cookie } = await login(app, { email: 'demo@mulher.ro.gov.br', password: 'Lume-Demo-2026!' });
  const snapshot = (await app.inject({ url: '/api/snapshot', headers: { cookie } })).json();
  assert.equal(snapshot.incidents.length, 3);
  assert.ok(snapshot.incidents.every((row: Incident) => row.simulated && row.audioCount === 0));
  assert.ok(snapshot.women.every((row: Woman) => row.name.includes('fictícia') && row.notes.includes('SIMULAÇÃO')));
  await assert.rejects(createApp({ environment: 'production', databasePath: ':memory:', demoMode: true, panelOrigin: 'https://central.example', secureCookies: true }), /Produção/);
  await app.close();
  await assert.rejects(createApp({ environment: 'test', databasePath, demoMode: false, panelOrigin: origin }), /Banco de demonstração/);
});

test('SSE autentica cookie, entrega eventos/heartbeat, reconecta por seq e fecha no logout', async t => {
  const { app } = await fixture(t);
  const { cookie, operator } = await login(app);
  assert.equal((await app.inject({ url: '/api/events' })).statusCode, 401);
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const abort = new AbortController();
  t.after(() => abort.abort());
  const response = await fetch(`${address}/api/events`, { headers: { cookie }, signal: abort.signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type')!, /text\/event-stream/);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (!text.includes('event: change')) text += decoder.decode((await reader.read()).value);
  assert.match(text, /"kind":"snapshot"/);
  const initialSequence = app.store.latestSequence(operator.agencyId);
  app.store.createWoman(operator, { name: 'Pessoa SSE fictícia', phone: '00000000', reference: 'SSE-TEST', notes: '' });
  while (!text.includes('woman.created') || !text.includes(': heartbeat')) {
    const result = await reader.read();
    assert.equal(result.done, false);
    text += decoder.decode(result.value);
  }
  assert.match(text, /"seq":\d+/);
  await reader.cancel();
  const replayAbort = new AbortController();
  t.after(() => replayAbort.abort());
  const replay = await fetch(`${address}/api/events`, { headers: { cookie, 'Last-Event-ID': String(initialSequence) }, signal: replayAbort.signal });
  const replayReader = replay.body!.getReader();
  const replayText = decoder.decode((await replayReader.read()).value);
  assert.match(replayText, /woman.created/);
  const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { origin, cookie }, payload: {} });
  assert.equal(logout.statusCode, 200);
  while (!(await replayReader.read()).done) { /* Drain pending heartbeat before closed stream. */ }
});
