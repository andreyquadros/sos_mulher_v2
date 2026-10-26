import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, mkdir, open, readFile, readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const android = join(root, 'apps/mobile/android');
const fixture = join(android, 'app/src/androidTest/assets/floating-e2e.json');
const logPath = join(root, 'artifacts/floating-trigger-e2e.log');
const reportPath = join(root, 'apps/mobile/build/app/outputs/androidTest-results/connected/debug');
const packageName = 'br.gov.ro.lume.lume_navegador';
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), 'Library/Android/sdk');
const adb = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
let serial;
let pairingCode;
let child;
let log;
let timer;
let forceTimer;
let failure;
let instrumented = false;
let writes = Promise.resolve();
const tail = [];

function redact(value) {
  return String(value).replaceAll(pairingCode || '\0', '[PAIRING REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~-]+/gi, '$1[REDACTED]')
    .replace(/((?:deviceToken|E2E_PAIRING_CODE|password)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[REDACTED]');
}

function signalChild(signal) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch { /* The child may have already exited. */ }
}

function stop() {
  signalChild('SIGTERM');
  if (!forceTimer && child?.exitCode === null && child?.signalCode === null) {
    forceTimer = setTimeout(() => signalChild('SIGKILL'), 5_000);
    forceTimer.unref();
  }
}

const interrupt = () => { failure = 'Ensaio interrompido.'; stop(); };
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);

async function adbCommand(args) {
  return execute(adb, ['-s', serial, ...args], { timeout: 15_000, maxBuffer: 1024 * 1024 });
}

async function isInstalled() {
  const result = await adbCommand(['shell', 'pm', 'list', 'packages', packageName]);
  return result.stdout.split(/\r?\n/).some(line => line.trim() === `package:${packageName}`);
}

async function verifyEnvironment() {
  const inventory = (await execute(adb, ['devices'], { timeout: 10_000 })).stdout.split(/\r?\n/)
    .filter(line => /^\S+\s+(device|offline|unauthorized)\b/.test(line));
  if (inventory.length !== 1 || !/^emulator-\d+\s+device\b/.test(inventory[0])) {
    throw new Error('Conecte exatamente um emulador isolado e nenhum telefone físico.');
  }
  serial = inventory[0].split(/\s+/)[0];
  if (process.env.LUME_TEST_SERIAL && process.env.LUME_TEST_SERIAL !== serial) throw new Error('Emulador diferente de LUME_TEST_SERIAL.');
  const avdName = (await adbCommand(['emu', 'avd', 'name'])).stdout.split(/\r?\n/)
    .find(line => line.trim() && line.trim() !== 'OK')?.trim();
  if (!avdName || (process.env.LUME_TEST_AVD && process.env.LUME_TEST_AVD !== avdName)) throw new Error('AVD diferente de LUME_TEST_AVD.');
  const response = await fetch('http://127.0.0.1:3001/api/health', { signal: AbortSignal.timeout(10_000), redirect: 'error' });
  if (!response.ok || (await response.json()).demoMode !== true) throw new Error('A API local deve estar em DEMO_MODE=true.');
}

async function prepareFixture() {
  await execute(process.execPath, [join(root, 'scripts/prepare-voice-model.mjs')], { cwd: root, timeout: 120_000 });
  await execute(process.execPath, [join(root, 'scripts/prepare-e2e.mjs')], { cwd: root, timeout: 30_000 });
  const path = join(root, 'artifacts/e2e-config.json');
  const config = JSON.parse(await readFile(path, 'utf8'));
  if (config.API_BASE_URL !== 'http://10.0.2.2:3001' || typeof config.E2E_PAIRING_CODE !== 'string' || !/^\d{8}$/.test(config.E2E_PAIRING_CODE)) {
    throw new Error('Fixture de demonstração inválida.');
  }
  pairingCode = config.E2E_PAIRING_CODE;
  await chmod(path, 0o600);
  await mkdir(dirname(fixture), { recursive: true, mode: 0o700 });
  const asset = await open(fixture, 'w', 0o600);
  try {
    await asset.chmod(0o600);
    await asset.writeFile(JSON.stringify({ ...config, E2E_FLOATING_TEST: true }));
  } finally { await asset.close(); }
}

async function verifyReports() {
  async function xmlFiles(directory) {
    const found = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) found.push(...await xmlFiles(path));
      else if (entry.isFile() && entry.name.endsWith('.xml')) found.push(path);
    }
    return found;
  }
  let completed = 0;
  for (const path of await xmlFiles(reportPath)) {
    const xml = await readFile(path, 'utf8');
    const suites = [...xml.matchAll(/<testsuite\s+([^>]+)>/g)];
    if (suites.length === 0) throw new Error('Relatório Android sem suíte de testes.');
    for (const [, attributes] of suites) {
      const count = name => {
        const value = new RegExp(`\\b${name}="(\\d+)"`).exec(attributes)?.[1];
        if (value === undefined) throw new Error('Relatório Android incompleto.');
        return Number(value);
      };
      if (count('failures') || count('errors') || count('skipped')) throw new Error('O ensaio contém falhas ou testes ignorados.');
      completed += count('tests');
    }
    const cases = [...xml.matchAll(/<testcase\s+([^>]+)>?/g)];
    if (cases.length === 0 || cases.some(([, attributes]) => !attributes.includes(`classname="${packageName}.FloatingTriggerDeviceTest"`))) {
      throw new Error('O relatório não corresponde ao teste do botão flutuante.');
    }
  }
  if (completed < 1) throw new Error('Nenhum teste do botão flutuante foi executado.');
  process.stdout.write(`${completed} teste(s) instrumental(is) executado(s), sem falhas ou ignorados.\n`);
}

function consume(stream) {
  let pending = '';
  const writeLine = line => {
    const safe = redact(line);
    tail.push(safe);
    if (tail.length > 45) tail.shift();
    writes = writes.then(() => log.write(`${safe}\n`)).catch(() => {
      failure = 'Não foi possível gravar o log privado.';
      stop();
    });
  };
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    pending += chunk;
    let boundary;
    while ((boundary = pending.indexOf('\n')) >= 0) {
      writeLine(pending.slice(0, boundary));
      pending = pending.slice(boundary + 1);
    }
    if (pending.length > 128 * 1024) { writeLine(pending); pending = ''; }
  });
  stream.on('end', () => { if (pending) writeLine(pending); });
}

try {
  await verifyEnvironment();
  if (failure) throw new Error(failure);
  await prepareFixture();
  if (failure) throw new Error(failure);
  // Only this project's disposable demo installation on the verified isolated AVD.
  if (await isInstalled()) await adbCommand(['shell', 'pm', 'clear', packageName]);
  await mkdir(dirname(logPath), { recursive: true, mode: 0o700 });
  log = await open(logPath, 'w', 0o600);
  await log.chmod(0o600);
  // Remove only generated test reports, so stale successes cannot approve this run.
  await rm(reportPath, { recursive: true, force: true });
  process.stdout.write('Ensaio isolado: botão flutuante, pressão de 5s, cancelamento, treino e envio simulado.\n');
  const result = new Promise((resolveResult, reject) => {
    child = spawn(join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), [
      ':app:connectedDebugAndroidTest',
      `-Pandroid.testInstrumentationRunnerArguments.class=${packageName}.FloatingTriggerDeviceTest`,
      '--no-daemon', '--max-workers=2', '-Dorg.gradle.jvmargs=-Xmx2g',
    ], { cwd: android, env: { ...process.env, ANDROID_SERIAL: serial }, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    instrumented = true;
    consume(child.stdout);
    consume(child.stderr);
    child.once('error', () => reject(new Error('Não foi possível iniciar o Gradle.')));
    child.once('close', code => resolveResult(code));
  });
  timer = setTimeout(() => { failure = 'O ensaio excedeu seis minutos.'; stop(); }, 6 * 60_000);
  if (await result !== 0) throw new Error(failure || 'Instrumentação não aprovada; consulte o log privado.');
  await verifyReports();
} catch (error) {
  failure ??= error.message || 'Falha ao executar o ensaio.';
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  clearTimeout(forceTimer);
  stop();
  if (serial && instrumented) {
    try {
      // AGP may already have uninstalled both APKs after instrumentation.
      if (await isInstalled()) {
        await adbCommand(['shell', 'am', 'force-stop', packageName]);
        await adbCommand(['shell', 'appops', 'set', packageName, 'SYSTEM_ALERT_WINDOW', 'deny']);
      }
    } catch { failure ??= 'Não foi possível limpar o estado do app no AVD.'; }
  }
  await writes;
  await rm(fixture, { force: true });
  await log?.close();
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
  if (failure) {
    process.exitCode = 1;
    process.stderr.write(`${redact(failure)}\n${tail.join('\n')}\nLog privado: ${logPath}\n`);
  } else process.stdout.write(`Instrumentação aprovada. Log privado: ${logPath}\n`);
}
