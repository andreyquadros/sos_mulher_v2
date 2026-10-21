import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { createApp } from '../src/app.js';

const origin = 'http://localhost:5173';
const credentials = { email: 'guide-admin@example.test', password: 'Guide-Test-2026!' };
type App = Awaited<ReturnType<typeof createApp>>;

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'lume-guide-'));
  const options = {
    environment: 'test' as const, databasePath: join(directory, 'test.sqlite'), panelOrigin: origin,
    demoMode: false, adminEmail: credentials.email, adminPassword: credentials.password,
    adminName: 'Operadora fictícia', agencyId: 'agency-guide-a',
  };
  let app = await createApp(options);
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  return { get app() { return app; }, async restart() { await app.close(); app = await createApp(options); return app; } };
}

async function login(app: App, account = credentials) {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: account });
  assert.equal(response.statusCode, 200);
  const cookie = response.headers['set-cookie'];
  assert.equal(typeof cookie, 'string');
  return (cookie as string).split(';')[0]!;
}

test('guia exige sessão, origem confiável e versão válida; não aceita escolher outro operador', async t => {
  const { app } = await fixture(t);
  for (const method of ['GET', 'POST'] as const) {
    const response = await app.inject({ method, url: '/api/me/onboarding', headers: { origin }, ...(method === 'POST' ? { payload: { version: 1 } } : {}) });
    assert.equal(response.statusCode, 401);
  }
  const cookie = await login(app);
  const initial = await app.inject({ method: 'GET', url: '/api/me/onboarding', headers: { cookie } });
  assert.deepEqual(initial.json(), { completed: false, version: 1 });
  assert.equal(initial.headers['cache-control'], 'no-store');
  for (const headers of [{ cookie }, { cookie, origin: 'https://hostile.example' }]) {
    const response = await app.inject({ method: 'POST', url: '/api/me/onboarding', headers, payload: { version: 1 } });
    assert.equal(response.statusCode, 403);
  }
  for (const payload of [{}, { version: 0 }, { version: 2 }, { version: '1' }, { version: 1, operatorId: 'someone-else' }]) {
    const response = await app.inject({ method: 'POST', url: '/api/me/onboarding', headers: { cookie, origin }, payload });
    assert.equal(response.statusCode, 400);
  }
  const unchanged = await app.inject({ method: 'GET', url: '/api/me/onboarding', headers: { cookie } });
  assert.deepEqual(unchanged.json(), { completed: false, version: 1 });
});

test('conclusão pertence ao operador, inclui perfil de consulta e não amplia acesso operacional', async t => {
  const { app } = await fixture(t);
  const observer = { email: 'guide-observer@example.test', password: 'Observer-Guide-2026!' };
  const otherAgency = { email: 'guide-other@example.test', password: 'Other-Guide-2026!' };
  await app.store.createOperator({ email: observer.email, name: 'Consulta fictícia', agencyId: 'agency-guide-a', role: 'observer' }, observer.password);
  await app.store.createOperator({ email: otherAgency.email, name: 'Outra agência fictícia', agencyId: 'agency-guide-b', role: 'admin' }, otherAgency.password);
  const adminCookie = await login(app);
  const observerCookie = await login(app, observer);
  const otherCookie = await login(app, otherAgency);
  const response = await app.inject({ method: 'POST', url: '/api/me/onboarding', headers: { cookie: observerCookie, origin }, payload: { version: 1 } });
  assert.deepEqual(response.json(), { completed: true, version: 1 });
  for (const cookie of [adminCookie, otherCookie]) {
    const state = await app.inject({ method: 'GET', url: '/api/me/onboarding', headers: { cookie } });
    assert.deepEqual(state.json(), { completed: false, version: 1 });
  }
  const forbidden = await app.inject({ method: 'POST', url: '/api/women', headers: { cookie: observerCookie, origin }, payload: { name: 'Pessoa fictícia', phone: '(69) 00000-0000', reference: 'GUIDE-TEST' } });
  assert.equal(forbidden.statusCode, 403);
});

test('conclusão é idempotente e persiste após logout, nova sessão e reinicialização da API', async t => {
  const setup = await fixture(t);
  let app = setup.app;
  const cookie = await login(app);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await app.inject({ method: 'POST', url: '/api/me/onboarding', headers: { cookie, origin }, payload: { version: 1 } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { completed: true, version: 1 });
  }
  await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie, origin }, payload: {} });
  const expired = await app.inject({ method: 'GET', url: '/api/me/onboarding', headers: { cookie } });
  assert.equal(expired.statusCode, 401);
  app = await setup.restart();
  const nextCookie = await login(app);
  const state = await app.inject({ method: 'GET', url: '/api/me/onboarding', headers: { cookie: nextCookie } });
  assert.deepEqual(state.json(), { completed: true, version: 1 });
});
