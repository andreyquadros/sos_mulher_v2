import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const demo = process.argv.includes('--demo');
const env = {PANEL_ORIGIN: 'http://127.0.0.1:5173', ...process.env,
  ...(demo ? {DEMO_MODE: 'true', VITE_DEMO_MODE: 'true'} : {})};
const children = [
  spawn('npm', ['--prefix', 'services/api', 'run', 'dev'], {cwd: root, env, stdio: 'inherit'}),
  spawn('npm', ['--prefix', 'apps/panel', 'run', 'dev', '--', '--host', '127.0.0.1'], {cwd: root, env, stdio: 'inherit'}),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach(child => child.kill('SIGTERM'));
  process.exitCode = code;
}
children.forEach(child => {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => stop(code ?? 0));
});
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
