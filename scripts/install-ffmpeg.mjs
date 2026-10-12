import './lib/project-tmp.mjs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { ROOT, run, writeJson } from './lib/media.mjs';
import { assertProjectOutput } from './lib/project-paths.mjs';
import { mediaToolPath, selectRuntime } from './lib/platform-runtime.mjs';
import { readLock } from './lib/studio-lock.mjs';
import { downloadVerified } from './lib/studio-download.mjs';

const lock = await readLock(ROOT);
const runtime = selectRuntime(lock);
if (!runtime.supported) throw new Error(`Unsupported FFmpeg platform: ${process.platform} ${process.arch}.`);
const { version } = runtime.ffmpeg;
const dir = assertProjectOutput(path.join(ROOT, 'Tools/bin'));
await fs.mkdir(dir, { recursive: true });
async function digest(file) {
  if (!(await fs.stat(file).catch(() => null))) return null;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

const ffmpeg = mediaToolPath(ROOT, 'ffmpeg', runtime);
const ffprobe = mediaToolPath(ROOT, 'ffprobe', runtime);
if (runtime.id === 'win32-x64') {
  const artifact = runtime.ffmpeg;
  const archive = assertProjectOutput(path.join(ROOT, 'state/cache/downloads', `ffmpeg-${version}-full_build.7z`));
  await fs.mkdir(path.dirname(archive), { recursive: true });
  if (await digest(archive) !== artifact.sha256) {
    console.error(`Downloading verified FFmpeg ${version} Full into ${dir}`);
    const response = await fetch(artifact.url);
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
    const partial = `${archive}.part`;
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
    if (await digest(partial) !== artifact.sha256) throw new Error('FFmpeg archive SHA256 mismatch');
    await fs.rename(partial, archive);
  }
  const base = `ffmpeg-${version}-full_build`;
  await run(path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32/tar.exe'), [
    '-xf', archive, '-C', dir, '--strip-components', '2', `${base}/bin/ffmpeg.exe`, `${base}/bin/ffprobe.exe`,
  ]);
  await fs.rm(archive, { force: true });
} else {
  await fs.mkdir(path.join(ROOT, 'state/cache/downloads'), { recursive: true });
  for (const name of ['ffmpeg', 'ffprobe']) {
    const artifact = runtime.ffmpeg[name];
    const archive = assertProjectOutput(path.join(ROOT, 'state/cache/downloads', `ffmpeg-${version}-${runtime.id}-${name}.gz`));
    const output = mediaToolPath(ROOT, name, runtime);
    if (await digest(output) === artifact.binarySha256) continue;
    await downloadVerified({ url: artifact.url, sha256: artifact.sha256, bytes: artifact.bytes, target: archive });
    const partial = assertProjectOutput(`${output}.partial`);
    await pipeline(createReadStream(archive), createGunzip(), createWriteStream(partial, { mode: 0o755 }));
    if (await digest(partial) !== artifact.binarySha256) throw new Error(`${name} binary SHA256 mismatch after decompression`);
    await fs.chmod(partial, 0o755);
    await fs.rename(partial, output);
    await fs.rm(archive, { force: true });
  }
}
const ver = await run(ffmpeg, ['-version']);
if (!ver.stdout.includes(version)) throw new Error('Unexpected FFmpeg version');
const filters = await run(ffmpeg, ['-hide_banner', '-filters']);
for (const filter of ['ebur128', 'loudnorm', 'sidechaincompress']) {
  if (!(filters.stdout + filters.stderr).includes(filter)) throw new Error(`Missing required filter: ${filter}`);
}
const report = { ok: true, platform: runtime.id, version, build: runtime.id === 'win32-x64' ? 'full' : 'static',
  url: runtime.ffmpeg.url ?? runtime.ffmpeg.ffmpeg.url,
  ...(runtime.id === 'win32-x64' ? { archiveSha256: runtime.ffmpeg.sha256 } : {
    ffmpegSha256: await digest(ffmpeg), ffprobeSha256: await digest(ffprobe),
  }),
  ffmpeg, ffprobe, filters: ['ebur128', 'loudnorm', 'sidechaincompress'] };
await writeJson(path.join(dir, 'ffmpeg-install.json'), report);
console.log(JSON.stringify(report, null, 2));
