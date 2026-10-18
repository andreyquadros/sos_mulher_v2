#!/usr/bin/env node
/** Build-time only: verifies and bundles the official offline Portuguese model. No runtime download. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, lstat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = 'vosk-model-small-pt-0.3';
const source = `https://alphacephei.com/vosk/models/${name}.zip`;
const sha256 = '6e1ce909032e1afa7a88e68a3d628ecafff302bdf195befab308826c395e93b7';
const target = join(root, 'apps/mobile/android/app/src/main/assets/voice-model-pt');
const archiveLimit = 40 * 1024 * 1024;
const expandedLimit = 64 * 1024 * 1024;
const expected = new Set([
  'README', 'final.mdl', 'disambig_tid.int', 'phones.txt', 'Gr.fst', 'HCLr.fst',
  'mfcc.conf', 'word_boundary.int', 'ivector/global_cmvn.stats', 'ivector/online_cmvn.conf',
  'ivector/splice.conf', 'ivector/final.ie', 'ivector/final.dubm', 'ivector/final.mat',
]);
const digest = data => createHash('sha256').update(data).digest('hex');

async function alreadyPrepared() {
  try {
    const info = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
    if (info.archiveSha256 !== sha256 || info.files.length !== expected.size) return false;
    const seen = new Set();
    for (const entry of info.files) {
      if (!expected.has(entry.path) || seen.has(entry.path)) return false;
      seen.add(entry.path);
      const file = join(target, entry.path);
      if (!(await lstat(file)).isFile()) return false;
      const bytes = await readFile(file);
      if (bytes.length !== entry.size || digest(bytes) !== entry.sha256) return false;
    }
    return true;
  } catch { return false; }
}

/** ZIP parser accepts only the pinned archive's bounded regular-file allowlist, no shell extraction. */
function extract(archive) {
  if (archive.length > archiveLimit) throw new Error('Modelo excede o limite de download');
  if (digest(archive) !== sha256) throw new Error('SHA256 do modelo divergente; nada foi instalado');
  let eocd = -1;
  for (let at = archive.length - 22; at >= Math.max(0, archive.length - 65557); at--) {
    if (archive.readUInt32LE(at) === 0x06054b50) { eocd = at; break; }
  }
  if (eocd < 0 || archive.readUInt16LE(eocd + 4) !== 0 || archive.readUInt16LE(eocd + 6) !== 0)
    throw new Error('ZIP ausente ou dividido');
  const count = archive.readUInt16LE(eocd + 10);
  const size = archive.readUInt32LE(eocd + 12);
  let at = archive.readUInt32LE(eocd + 16);
  if (count > 32 || count !== archive.readUInt16LE(eocd + 8) || at + size > eocd)
    throw new Error('Diretório ZIP inválido');
  const files = new Map();
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (at + 46 > archive.length || archive.readUInt32LE(at) !== 0x02014b50) throw new Error('Entrada ZIP inválida');
    const flags = archive.readUInt16LE(at + 8);
    const method = archive.readUInt16LE(at + 10);
    const compressed = archive.readUInt32LE(at + 20);
    const uncompressed = archive.readUInt32LE(at + 24);
    const length = archive.readUInt16LE(at + 28);
    const extra = archive.readUInt16LE(at + 30);
    const comment = archive.readUInt16LE(at + 32);
    const mode = archive.readUInt32LE(at + 38) >>> 16;
    const local = archive.readUInt32LE(at + 42);
    const full = archive.subarray(at + 46, at + 46 + length).toString('utf8');
    at += 46 + length + extra + comment;
    if (!full.startsWith(`${name}/`) || full.includes('\\') || full.includes('\0') ||
        full.split('/').some(part => part === '..' || part === '.') || (mode & 0xf000) === 0xa000 || flags & 1)
      throw new Error('Caminho/arquivo não permitido no modelo');
    const relative = full.slice(name.length + 1);
    if (full.endsWith('/')) continue;
    if (!expected.has(relative) || files.has(relative) || ![0, 8].includes(method) ||
        uncompressed > expandedLimit || (total += uncompressed) > expandedLimit)
      throw new Error('Conteúdo inesperado ou modelo expandido além do limite');
    if (local + 30 > archive.length || archive.readUInt32LE(local) !== 0x04034b50 ||
        archive.readUInt16LE(local + 8) !== method) throw new Error('Cabeçalho ZIP local inválido');
    const localLength = archive.readUInt16LE(local + 26);
    if (archive.subarray(local + 30, local + 30 + localLength).toString('utf8') !== full)
      throw new Error('Nome ZIP local divergente');
    const start = local + 30 + localLength + archive.readUInt16LE(local + 28);
    if (start + compressed > archive.length) throw new Error('Dados ZIP truncados');
    const data = archive.subarray(start, start + compressed);
    const bytes = method === 0 ? data : inflateRawSync(data, { maxOutputLength: expandedLimit });
    if (bytes.length !== uncompressed) throw new Error('Tamanho ZIP divergente');
    files.set(relative, bytes);
  }
  if (files.size !== expected.size) throw new Error('Modelo incompleto');
  return files;
}

if (await alreadyPrepared()) {
  console.log('Modelo offline português já verificado (SHA256 e 14 arquivos).');
} else {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--archive'))
    throw new Error('Uso: node scripts/prepare-voice-model.mjs [--archive caminho.zip]');
  let archive;
  if (args.length) {
    const local = resolve(args[1]);
    const info = await lstat(local);
    if (!info.isFile() || info.size > archiveLimit) throw new Error('Arquivo local inválido');
    archive = await readFile(local);
  } else {
    console.log(`Baixando modelo oficial para o build: ${source}`);
    const response = await fetch(source, { signal: AbortSignal.timeout(180000), redirect: 'error' });
    if (!response.ok || !response.body) throw new Error(`Download falhou: HTTP ${response.status}`);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > archiveLimit) throw new Error('Download excedeu limite');
      chunks.push(chunk);
    }
    archive = Buffer.concat(chunks);
  }
  const files = extract(archive);
  const staging = `${target}.pending`;
  // Only our fixed generated directory may be replaced; never follow a pre-existing symlink.
  for (const directory of [target, staging]) {
    try { if ((await lstat(directory)).isSymbolicLink()) throw new Error('Diretório gerado é link simbólico'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  const entries = [];
  try {
    for (const [path, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
      const output = join(staging, path);
      if (!output.startsWith(staging + sep)) throw new Error('Caminho fora da pasta gerada');
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, bytes);
      entries.push({ path, size: bytes.length, sha256: digest(bytes) });
    }
    await writeFile(join(staging, 'manifest.json'), JSON.stringify({ model: name, archiveSha256: sha256, source, license: 'Apache-2.0', files: entries }, null, 2) + '\n');
    await rm(target, { recursive: true, force: true });
    await rename(staging, target);
  } finally { await rm(staging, { recursive: true, force: true }); }
  console.log(`Modelo offline português verificado e incluído: ${files.size} arquivos, ${[...files.values()].reduce((sum, bytes) => sum + bytes.length, 0)} bytes.`);
}
