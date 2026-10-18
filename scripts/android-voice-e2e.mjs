import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, mkdir, open, readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const android = join(root, 'apps/mobile/android');
const fixture = join(android, 'app/src/androidTest/assets/voice-e2e.json');
const logPath = join(root, 'artifacts/voice-trigger-e2e.log');
const adb = join(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), 'Library/Android/sdk'), 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
let child;
let log;
let pairingCode;
let serial;
let isolated = false;
let instrumented = false;
let timer;
let failure;
let output = '';
const tail = [];
const pending = [];

function redact(value) {
  return String(value).replaceAll(pairingCode || '\0', '[PAIRING REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~-]+/gi, '$1[REDACTED]')
    .replace(/((?:deviceToken|E2E_PAIRING_CODE|password)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[REDACTED]');
}
function stop() {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
  const force = setTimeout(() => {
    try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited. */ }
  }, 5_000);
  force.unref();
}
const interrupt = () => { failure = 'Ensaio interrompido.'; stop(); };
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);
try {
  const inventory = (await execute(adb, ['devices'], { timeout: 10_000 })).stdout.split(/\r?\n/)
    .filter(line => /^\S+\s+(device|offline|unauthorized)\b/.test(line));
  if (inventory.length !== 1 || !/^emulator-\d+\s+device\b/.test(inventory[0])) {
    throw new Error('Conecte exatamente um emulador isolado e nenhum telefone físico.');
  }
  serial = inventory[0].split(/\s+/)[0];
  if (process.env.LUME_TEST_SERIAL && process.env.LUME_TEST_SERIAL !== serial) throw new Error('Emulador diferente de LUME_TEST_SERIAL.');
  const avdName = (await execute(adb, ['-s', serial, 'emu', 'avd', 'name'], { timeout: 10_000 })).stdout.split(/\r?\n/).find(line => line.trim() && line.trim() !== 'OK')?.trim();
  if (!avdName || (process.env.LUME_TEST_AVD && process.env.LUME_TEST_AVD !== avdName)) throw new Error('AVD diferente de LUME_TEST_AVD.');
  isolated = true;
  const health = await fetch('http://127.0.0.1:3001/api/health', { signal: AbortSignal.timeout(10_000), redirect: 'error' });
  if (!health.ok || (await health.json()).demoMode !== true) throw new Error('A API local deve estar em DEMO_MODE=true.');
  await execute(process.execPath, [join(root, 'scripts/prepare-voice-model.mjs')], { cwd: root, timeout: 120_000 });
  await execute(process.execPath, [join(root, 'scripts/prepare-e2e.mjs')], { cwd: root, timeout: 30_000 });
  const configuration = join(root, 'artifacts/e2e-config.json');
  const config = JSON.parse(await readFile(configuration, 'utf8'));
  if (config.API_BASE_URL !== 'http://10.0.2.2:3001' || !/^\d{8}$/.test(config.E2E_PAIRING_CODE)) throw new Error('Fixture de demonstração inválida.');
  pairingCode = config.E2E_PAIRING_CODE;
  await chmod(configuration, 0o600);
  await mkdir(dirname(fixture), { recursive: true, mode: 0o700 });
  const asset = await open(fixture, 'w', 0o600);
  try { await asset.chmod(0o600); await asset.writeFile(JSON.stringify({ ...config, E2E_VOICE_LIFECYCLE: true })); }
  finally { await asset.close(); }
  // This known package contains only this project's demo fixture on this isolated AVD.
  const installed = await execute(adb, ['-s', serial, 'shell', 'pm', 'list', 'packages', 'br.gov.ro.lume.lume_navegador'], { timeout: 10_000 });
  if (installed.stdout.trim()) await execute(adb, ['-s', serial, 'shell', 'pm', 'clear', 'br.gov.ro.lume.lume_navegador'], { timeout: 10_000 });
  await mkdir(dirname(logPath), { recursive: true, mode: 0o700 });
  log = await open(logPath, 'w', 0o600);
  await log.chmod(0o600);
  process.stdout.write('Ensaio isolado: captura real sob keyguard, tela apagada e parada pela notificação.\n');
  const result = new Promise((resolveResult, reject) => {
    child = spawn(join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), [
      ':app:connectedDebugAndroidTest', '-Pandroid.testInstrumentationRunnerArguments.class=br.gov.ro.lume.lume_navegador.VoiceTriggerDeviceTest,br.gov.ro.lume.lume_navegador.VoiceRecognitionTest',
      '--no-daemon', '--max-workers=2', '-Dorg.gradle.jvmargs=-Xmx2g',
    ], { cwd: android, env: { ...process.env, ANDROID_SERIAL: serial }, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    instrumented = true;
    const consume = stream => {
      stream.setEncoding('utf8');
      stream.on('data', chunk => {
        output += chunk;
        let boundary;
        while ((boundary = output.indexOf('\n')) >= 0) {
          const safe = redact(output.slice(0, boundary)); output = output.slice(boundary + 1);
          tail.push(safe); if (tail.length > 45) tail.shift();
          pending.push(log.write(`${safe}\n`));
        }
        if (output.length > 128 * 1024) output = output.slice(-128 * 1024);
      });
    };
    consume(child.stdout); consume(child.stderr);
    child.once('error', reject);
    child.once('close', code => resolveResult(code));
  });
  timer = setTimeout(() => { failure = 'Ensaio excedeu seis minutos.'; stop(); }, 6 * 60_000);
  if (await result !== 0) throw new Error(failure || 'Instrumentação não aprovada; consulte o log privado.');
} catch (error) {
  failure ??= error.message || 'Falha no ensaio.';
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  stop();
  if (isolated && instrumented) {
    try {
      await execute(adb, ['-s', serial, 'shell', 'locksettings', 'clear', '--old', '846291'], { timeout: 10_000 });
      await execute(adb, ['-s', serial, 'shell', 'am', 'force-stop', 'br.gov.ro.lume.lume_navegador'], { timeout: 10_000 });
    } catch { if (failure) failure += ' Confira o PIN do AVD antes de reutilizá-lo.'; }
  }
  await Promise.allSettled(pending);
  await rm(fixture, { force: true });
  await log?.close();
  process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
  if (failure) process.stderr.write(`${redact(failure)}\n${tail.join('\n')}\nLog privado: ${logPath}\n`);
  else process.stdout.write(`Instrumentação aprovada. Log privado: ${logPath}\n`);
}
