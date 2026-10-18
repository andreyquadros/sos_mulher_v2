import { DatabaseSync } from 'node:sqlite';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { readConfig, type AppConfig } from './config.js';
import type { Operator } from './models.js';
import { Store } from './store.js';

const operatorInputSchema = z.object({
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  name: z.string().trim().min(2).max(120),
  role: z.enum(['admin', 'dispatcher', 'observer']),
  agencyId: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/),
  password: z.string().min(14).max(256).refine(value => value.trim().length > 0),
}).strict();

export interface OperatorInput {
  email: string;
  name: string;
  role: Operator['role'];
  agencyId: string;
  password: string;
}

/** Privileged local provisioning only: never seeds, never replaces an existing account. */
export async function provisionOperator(config: AppConfig, input: OperatorInput): Promise<Operator> {
  const parsed = operatorInputSchema.safeParse(input);
  if (!parsed.success) throw new Error('Operador inválido: confira e-mail, nome, perfil, agência e senha de 14–256 caracteres.');
  if (config.demoMode) throw new Error('Provisionamento institucional não é permitido em DEMO_MODE.');
  if (config.databasePath === ':memory:') throw new Error('Use o DATABASE_PATH de um banco institucional já inicializado.');
  try {
    if (!statSync(config.databasePath).isFile()) throw new Error('missing');
  } catch { throw new Error('Banco institucional inexistente. Inicialize o primeiro administrador pela configuração da API.'); }

  // Open read-only before Store so a typo, empty database or demo file cannot create a
  // database/schema/seed. The write connection is opened only after these checks.
  let existing: DatabaseSync | undefined;
  try {
    existing = new DatabaseSync(config.databasePath, { readOnly: true });
    const demo = existing.prepare('SELECT value FROM metadata WHERE key=?').get('demo');
    if (demo?.value === 'true') throw new Error('demo');
    const initialized = existing.prepare('SELECT COUNT(*) count FROM operators').get();
    if (!initialized || Number(initialized.count) === 0) throw new Error('empty');
  } catch (error) {
    if (error instanceof Error && error.message === 'demo') throw new Error('Banco de demonstração recusado. Use um banco institucional.');
    throw new Error('Banco institucional vazio ou inválido. Este comando não cria o primeiro administrador.');
  } finally { existing?.close(); }

  const store = new Store(config);
  try {
    if (store.operatorByEmail(parsed.data.email)) throw new Error('Já existe uma conta com esse e-mail. Nenhuma conta foi alterada.');
    const { password, ...identity } = parsed.data;
    let operator: Operator;
    try { operator = await store.createOperator(identity, password, 'Administração local do servidor'); }
    catch { throw new Error('Não foi possível criar a conta. Confira se o e-mail já está cadastrado; nenhuma conta foi substituída.'); }
    return operator;
  } finally { store.close(); }
}

export async function runOperatorCli(env: NodeJS.ProcessEnv = process.env) {
  try {
    const config = readConfig({}, env);
    await provisionOperator(config, {
      email: env.OPERATOR_EMAIL ?? '',
      name: env.OPERATOR_NAME ?? '',
      role: env.OPERATOR_ROLE as Operator['role'],
      agencyId: env.OPERATOR_AGENCY_ID ?? env.AGENCY_ID ?? '',
      password: env.OPERATOR_PASSWORD ?? '',
    });
    // Deliberately exclude identity, password, database path and configuration values.
    process.stdout.write('Conta institucional criada. Credenciais existentes não foram alteradas.\n');
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Falha ao provisionar operador.'}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runOperatorCli();
}
