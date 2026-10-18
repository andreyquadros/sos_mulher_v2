import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { provisionOperator, type OperatorInput } from '../src/operator.js';
import { verifyPassword } from '../src/security.js';

const identity: OperatorInput = { email: 'pc.individual@example.test', name: 'Operador PC fictício', role: 'dispatcher', agencyId: 'central-ariquemes', password: 'Individual-Safe-Test-2026!' };

test('provisionamento cria operador individual com scrypt e mesma agência, sem sobrescrever conta', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lume-operator-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = readConfig({ environment: 'test', demoMode: false, databasePath: join(directory, 'institutional.sqlite'), panelOrigin: 'http://127.0.0.1:5173', adminEmail: 'admin@example.test', adminName: 'Admin teste', adminPassword: 'First-Administrator-2026!', agencyId: identity.agencyId });
  const initialized = await createApp(config);
  await initialized.close();
  const operator = await provisionOperator(config, identity);
  assert.equal(operator.email, identity.email);
  assert.equal(operator.agencyId, identity.agencyId);
  assert.equal(operator.role, 'dispatcher');
  assert.equal('passwordHash' in operator, false);
  const app = await createApp(config);
  t.after(() => app.close());
  const stored = app.store.operatorByEmail(identity.email)!;
  assert.match(stored.passwordHash, /^scrypt\$/);
  assert.ok(await verifyPassword(identity.password, stored.passwordHash));
  const result = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: config.panelOrigin }, payload: { email: identity.email, password: identity.password } });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.json().operator.agencyId, identity.agencyId);
  const count = app.store.get<{ count: number }>('SELECT COUNT(*) count FROM operators')!.count;
  await assert.rejects(provisionOperator(config, { ...identity, password: 'Different-Password-2026!' }), /Já existe/);
  assert.equal(app.store.get<{ count: number }>('SELECT COUNT(*) count FROM operators')!.count, count);
  assert.ok(await verifyPassword(identity.password, app.store.operatorByEmail(identity.email)!.passwordHash));
  assert.equal(app.store.get<{ count: number }>('SELECT COUNT(*) count FROM audit WHERE action=?', 'operator.provisioned')!.count, 1);
});

test('provisionamento recusa dados inválidos, demo, inexistente ou vazio sem criar seed', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lume-operator-guards-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'nonexistent.sqlite');
  const config = readConfig({ environment: 'test', demoMode: false, databasePath, panelOrigin: 'http://127.0.0.1:5173' });
  await assert.rejects(provisionOperator(config, { ...identity, role: 'root' as OperatorInput['role'] }), /Operador inválido/);
  await assert.rejects(provisionOperator(config, { ...identity, password: 'short' }), /Operador inválido/);
  await assert.rejects(provisionOperator(config, { ...identity, email: 'invalid-email' }), /Operador inválido/);
  await assert.rejects(provisionOperator({ ...config, demoMode: true }, identity), /DEMO_MODE/);
  await assert.rejects(provisionOperator(config, identity), /inexistente/);
  await assert.rejects(stat(databasePath), /ENOENT/);
  await writeFile(databasePath, '');
  await assert.rejects(provisionOperator(config, identity), /vazio ou inválido/);
  assert.equal((await stat(databasePath)).size, 0);
  const demoPath = join(directory, 'demo.sqlite');
  const demo = await createApp({ ...config, databasePath: demoPath, demoMode: true });
  await demo.close();
  await assert.rejects(provisionOperator({ ...config, databasePath: demoPath }, identity), /demonstração/);
});
