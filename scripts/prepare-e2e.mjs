import { randomUUID } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const api = 'http://127.0.0.1:3001/api';
const origin = 'http://127.0.0.1:5173';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configurationPath = resolve(root, 'artifacts/e2e-config.json');
let cookie;
class PreparationError extends Error {}

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json', Origin: origin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...options.headers,
    },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new PreparationError(`A API recusou a preparação de teste (HTTP ${response.status}).`);
  return response;
}

async function prepare() {
  const health = await (await request('/health')).json();
  if (health.demoMode !== true) throw new PreparationError('Preparação recusada: a API precisa estar em DEMO_MODE=true.');

  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'demo@mulher.ro.gov.br', password: 'Lume-Demo-2026!' }),
  });
  const sessionCookie = login.headers.getSetCookie().find(value => value.startsWith('ml_session='));
  cookie = sessionCookie?.split(';')[0];
  if (!cookie) throw new PreparationError('A API não forneceu a sessão de demonstração.');

  try {
    const created = await (await request('/women', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Teste integração Android',
        phone: '(69) 00000-0000',
        reference: `E2E-${randomUUID().slice(0, 8)}`,
        notes: 'SIMULAÇÃO: pessoa fictícia criada para ensaio de integração Android. Não deslocar equipes.',
      }),
    })).json();
    if (typeof created.woman?.id !== 'string') throw new PreparationError('A API não confirmou o cadastro fictício.');

    const pairing = await (await request(`/women/${encodeURIComponent(created.woman.id)}/pairing`, {
      method: 'POST', body: '{}',
    })).json();
    if (typeof pairing.code !== 'string' || !/^\d{8}$/.test(pairing.code)) {
      throw new PreparationError('A API não forneceu um código de pareamento válido.');
    }
    await mkdir(dirname(configurationPath), { recursive: true, mode: 0o700 });
    const file = await open(configurationPath, 'w', 0o600);
    try {
      await file.chmod(0o600);
      await file.writeFile(`${JSON.stringify({
        E2E_PAIRING_CODE: pairing.code,
        API_BASE_URL: 'http://10.0.2.2:3001',
      }, null, 2)}\n`);
    } finally { await file.close(); }
  } finally {
    await request('/auth/logout', { method: 'POST', body: '{}' });
    cookie = undefined;
  }

  process.stdout.write(`Configuração: ${configurationPath}\n`);
  process.stdout.write('Flutter: cd apps/mobile && flutter test integration_test/ --dart-define-from-file=../../artifacts/e2e-config.json\n');
}

try { await prepare(); }
catch (error) {
  // API responses, credentials, tokens and pairing codes are never printed.
  process.stderr.write(`${error instanceof PreparationError ? error.message : 'Não foi possível preparar a integração Android. Confira a API local e o diretório de artifacts.'}\n`);
  process.exitCode = 1;
}
