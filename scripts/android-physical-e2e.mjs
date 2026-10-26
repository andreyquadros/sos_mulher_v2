import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { constants } from 'node:fs';
import { access, chmod, mkdir, open, readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const android = join(root, 'apps/mobile/android');
const fixture = join(android, 'app/src/androidTest/assets/physical-e2e.json');
const configuration = join(root, 'artifacts/e2e-config.json');
const logPath = join(root, 'artifacts/physical-trigger-e2e.log');
const packageName = 'br.gov.ro.lume.lume_navegador';
const markerPattern = /\bdriver:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(unlocked|short|locked|alert|repeat)(?=\s|$)/i;
const stopped = new AbortController();
const seenMarkers = new Set();
const completedPhases = new Set();
const tail = [];
let adb;
let serial;
let inputDevice;
let restoreAdb = false;
let logFile;
let pairingCode;
let logcat;
let gradle;
let closing = false;
let failure;
let driverWork = Promise.resolve();
let gradleTimer;
const flushers = [];

class TestFailure extends Error {}

function redact(value) {
  let safe = String(value);
  if (pairingCode) safe = safe.replaceAll(pairingCode, '[PAIRING REDACTED]');
  return safe.replace(/(Bearer\s+)[A-Za-z0-9._~-]+/gi, '$1[REDACTED]')
    .replace(/((?:deviceToken|E2E_PAIRING_CODE|password)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[REDACTED]');
}

async function logLine(line) {
  const safe = redact(line);
  tail.push(safe);
  if (tail.length > 60) tail.shift();
  if (logFile) await logFile.write(`${safe}\n`);
}

function terminate(child) {
  if (!child?.pid || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
  } catch { /* Already exited. */ }
}

async function stopChild(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolveExit => child.once('close', resolveExit));
  terminate(child);
  const force = setTimeout(() => {
    try {
      if (process.platform === 'win32') child.kill('SIGKILL');
      else process.kill(-child.pid, 'SIGKILL');
    } catch { /* Already exited. */ }
  }, 5_000);
  try { await exited; } finally { clearTimeout(force); }
}

function fail(message) {
  failure ??= message;
  stopped.abort();
  // Escalate even if Gradle ignores SIGTERM; otherwise the six-minute deadline could hang.
  void stopChild(gradle).catch(() => {});
}

function attachLines(stream, label, onLine) {
  let pending = '';
  let writes = Promise.resolve();
  const emit = line => {
    writes = writes.then(() => logLine(`[${label}] ${line}`)).catch(() => fail('Não foi possível gravar o log privado.'));
    if (onLine) onLine(line);
  };
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    pending += chunk;
    let boundary;
    while ((boundary = pending.indexOf('\n')) !== -1) {
      emit(pending.slice(0, boundary).replace(/\r$/, ''));
      pending = pending.slice(boundary + 1);
    }
    if (pending.length > 128 * 1024) { emit(pending.slice(0, 128 * 1024)); pending = ''; }
  });
  flushers.push(async () => { if (pending) { emit(pending); pending = ''; } await writes; });
}

async function adbCommand(args, timeout = 10_000) {
  return execute(adb, ['-s', serial, ...args], { timeout, maxBuffer: 1024 * 1024, env: process.env });
}

async function resolveAdb() {
  const roots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, join(homedir(), 'Library/Android/sdk')].filter(Boolean);
  for (const sdk of roots) {
    const candidate = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* Try next SDK. */ }
  }
  throw new TestFailure('ADB não encontrado. Configure ANDROID_HOME ou ANDROID_SDK_ROOT.');
}

async function selectEmulator() {
  const result = await execute(adb, ['devices'], { timeout: 10_000, maxBuffer: 1024 * 1024 });
  const devices = result.stdout.split(/\r?\n/).map(line => line.trim())
    .filter(line => line && !line.startsWith('List of devices') && !line.startsWith('*'))
    .map(line => line.split(/\s+/));
  if (devices.length !== 1 || devices[0][1] !== 'device' || !devices[0][0].startsWith('emulator-')) {
    throw new TestFailure('Conecte exatamente um emulador isolado e nenhum aparelho físico.');
  }
  serial = process.env.LUME_TEST_SERIAL || devices[0][0];
  if (serial !== devices[0][0] || !/^emulator-\d+$/.test(serial)) throw new TestFailure('LUME_TEST_SERIAL não corresponde ao único emulador conectado.');
  const resultName = await adbCommand(['emu', 'avd', 'name']);
  const name = resultName.stdout.split(/\r?\n/).find(line => line.trim() && line.trim() !== 'OK')?.trim();
  if (!name || (process.env.LUME_TEST_AVD && name !== process.env.LUME_TEST_AVD)) {
    throw new TestFailure('O AVD não corresponde ao ambiente de teste solicitado.');
  }
}

async function setupHardwareInput() {
  // Host-only test privilege on the single isolated AVD. The APK never requests root.
  // Google Play/production images reject adb root and cannot run this hardware test.
  restoreAdb = true;
  await adbCommand(['root'], 15_000);
  await adbCommand(['wait-for-device'], 30_000);
  const identity = await adbCommand(['shell', 'id', '-u']);
  if (identity.stdout.trim() !== '0') {
    throw new TestFailure('O ensaio de hardware exige um AVD Google APIs isolado que permita adb root; imagens Google Play/produção não são compatíveis.');
  }
  const inventory = await adbCommand(['shell', 'getevent', '-pl']);
  const blocks = inventory.stdout.split(/(?=^add device\s+\d+:)/m);
  const candidates = blocks.flatMap(block => {
    const path = /^add device\s+\d+:\s*(\/dev\/input\/event\d+)\s*$/m.exec(block)?.[1];
    return path && /\bKEY_VOLUMEDOWN\b/.test(block) && /\bKEY_VOLUMEUP\b/.test(block) ? [path] : [];
  });
  if (candidates.length !== 1) {
    throw new TestFailure('O emulador precisa expor exatamente um dispositivo de entrada com os dois botões de volume.');
  }
  inputDevice = candidates[0];
}

async function writePrivate(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const file = await open(path, 'w', 0o600);
  try { await file.chmod(0o600); await file.writeFile(value); }
  finally { await file.close(); }
}

async function prepareFixture() {
  const response = await fetch('http://127.0.0.1:3001/api/health', { signal: AbortSignal.timeout(10_000), redirect: 'error' });
  if (!response.ok || (await response.json()).demoMode !== true) throw new TestFailure('A API local precisa estar em DEMO_MODE=true.');
  if (process.env.LUME_E2E_REUSE_CONFIG !== 'true') {
    // Capture output: prepare:e2e prints only its path/instruction, never pairing secrets.
    await execute(process.execPath, [join(root, 'scripts/prepare-e2e.mjs')], { cwd: root, env: process.env, timeout: 30_000, maxBuffer: 1024 * 1024 });
  }
  const config = JSON.parse(await readFile(configuration, 'utf8'));
  if (config.API_BASE_URL !== 'http://10.0.2.2:3001' || typeof config.E2E_PAIRING_CODE !== 'string' || !/^\d{8}$/.test(config.E2E_PAIRING_CODE)) {
    throw new TestFailure('Configuração E2E inválida; gere outro vínculo fictício na API demo.');
  }
  pairingCode = config.E2E_PAIRING_CODE;
  await chmod(configuration, 0o600);
  await writePrivate(fixture, `${JSON.stringify({ ...config, E2E_HARDWARE_DRIVER: true }, null, 2)}\n`);
}

async function releaseAll() {
  if (!adb || !serial || !inputDevice) return;
  for (const code of [114, 115]) {
    try { await sendKey(code, false); }
    catch { /* Still attempt the other release after a transport failure. */ }
  }
}

async function sendKey(code, pressed) {
  if (!inputDevice || ![114, 115].includes(code)) throw new TestFailure('Dispositivo ou tecla de teste inválido.');
  // Linux input: EV_KEY=1, KEY_VOLUMEDOWN=114, KEY_VOLUMEUP=115; EV_SYN/SYN_REPORT=0.
  await adbCommand(['shell', 'sendevent', inputDevice, '1', String(code), pressed ? '1' : '0'], 5_000);
  await adbCommand(['shell', 'sendevent', inputDevice, '0', '0', '0'], 5_000);
}

async function key(code, duration) {
  if (stopped.signal.aborted) throw new TestFailure('Ensaio interrompido.');
  await sendKey(code, true);
  try { await delay(duration, undefined, { signal: stopped.signal }); }
  finally { await sendKey(code, false); }
  await delay(160, undefined, { signal: stopped.signal });
}

async function drive(uuid, phase) {
  try {
    if (phase === 'alert') await adbCommand(['emu', 'geo', 'fix', '-63.0452', '-9.9238']);
    await key(114, 80);
    await key(115, 80);
    await key(114, 80);
    await key(115, phase === 'short' ? 600 : 2_150);
    if (stopped.signal.aborted) return;
    // Only the androidTest harness consumes this ack. It contains no secret or identity.
    await adbCommand(['shell', 'run-as', packageName, 'touch', `cache/physical-driver-${uuid}-${phase}`]);
    completedPhases.add(phase);
    await logLine(`[driver] fase ${phase} concluída`);
    process.stdout.write(`Fase ${phase} executada.\n`);
  } catch {
    await releaseAll();
    fail(`Não foi possível concluir a sequência de hardware na fase ${phase}.`);
  }
}

function marker(line) {
  const match = markerPattern.exec(line);
  if (!match || closing || stopped.signal.aborted) return;
  const [, uuid, phase] = match;
  const identity = `${uuid.toLowerCase()}:${phase.toLowerCase()}`;
  if (seenMarkers.has(identity)) return;
  seenMarkers.add(identity);
  driverWork = driverWork.then(() => stopped.signal.aborted ? undefined : drive(uuid, phase.toLowerCase()));
}

async function runGradle() {
  // Epoch timestamps allow ignoring the one old line included by logcat -T 1.
  const clock = await adbCommand(['shell', 'date', '+%s']);
  const firstFreshSecond = Number(clock.stdout.trim()) + 1;
  if (!Number.isSafeInteger(firstFreshSecond)) throw new TestFailure('Não foi possível consultar o relógio do emulador.');
  logcat = spawn(adb, ['-s', serial, 'logcat', '-T', '1', '-v', 'epoch', '-s', 'LumePhysicalTest:I'], { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  logcat.once('error', () => fail('Não foi possível acompanhar os marcadores do teste.'));
  logcat.once('close', () => { if (!closing) fail('O acompanhamento de marcadores terminou antes do ensaio.'); });
  attachLines(logcat.stdout, 'logcat', line => {
    const timestamp = Number(/^\s*(\d+(?:\.\d+)?)\s/.exec(line)?.[1]);
    if (Number.isFinite(timestamp) && timestamp >= firstFreshSecond) marker(line);
  });
  attachLines(logcat.stderr, 'logcat-error');

  const wrapper = join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  const result = new Promise((resolveResult, reject) => {
    gradle = spawn(wrapper, [':app:connectedDebugAndroidTest',
      '-Pandroid.testInstrumentationRunnerArguments.class=br.gov.ro.lume.lume_navegador.PhysicalTriggerDeviceTest',
      '--no-daemon', '--max-workers=2', '-Dorg.gradle.jvmargs=-Xmx2g'], {
      cwd: android, env: { ...process.env, ANDROID_SERIAL: serial },
      stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32',
    });
    attachLines(gradle.stdout, 'gradle');
    attachLines(gradle.stderr, 'gradle-error');
    gradle.once('error', () => reject(new TestFailure('Não foi possível iniciar o Gradle.')));
    gradle.once('close', (code, signal) => resolveResult({ code, signal }));
  });
  gradleTimer = setTimeout(() => fail('O ensaio excedeu seis minutos (build e instrumentação).'), 6 * 60_000);
  const { code } = await result;
  clearTimeout(gradleTimer);
  await driverWork;
  if (failure) throw new TestFailure(failure);
  if (code !== 0) throw new TestFailure('A instrumentação Android não foi aprovada; veja o log privado.');
  if (!['unlocked', 'short', 'locked', 'alert', 'repeat'].every(phase => completedPhases.has(phase))) {
    throw new TestFailure('O teste não concluiu todas as fases de hardware esperadas.');
  }
}

const interrupt = () => fail('Ensaio interrompido pelo operador.');
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);
try {
  adb = await resolveAdb();
  await selectEmulator();
  await setupHardwareInput();
  await prepareFixture();
  await mkdir(dirname(logPath), { recursive: true, mode: 0o700 });
  logFile = await open(logPath, 'w', 0o600);
  await logFile.chmod(0o600);
  process.stdout.write('Ensaio isolado: acompanhando marcadores e eventos de hardware do emulador.\n');
  await runGradle();
} catch (error) {
  failure ??= error instanceof TestFailure ? error.message : 'Falha ao preparar ou executar o ensaio isolado.';
  process.exitCode = 1;
} finally {
  closing = true;
  clearTimeout(gradleTimer);
  stopped.abort();
  await Promise.all([stopChild(gradle), stopChild(logcat)]);
  await driverWork.catch(() => {});
  await releaseAll();
  if (restoreAdb) {
    try {
      await adbCommand(['unroot'], 15_000);
      await adbCommand(['wait-for-device'], 30_000);
    } catch { /* Best effort: the emulator may already have stopped. */ }
  }
  for (const flush of flushers) await flush();
  await rm(fixture, { force: true });
  await logFile?.close();
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
  if (failure) {
    process.exitCode = 1;
    process.stderr.write(`${redact(failure)}\n`);
    if (tail.length) process.stderr.write(`${tail.slice(-40).join('\n')}\n`);
    process.stderr.write(`Log privado: ${logPath}\n`);
  } else process.stdout.write(`Instrumentação concluída. Log privado: ${logPath}\n`);
}
