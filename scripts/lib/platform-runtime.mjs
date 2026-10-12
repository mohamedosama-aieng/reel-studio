import path from 'node:path';

export const runtimePlatformId = (platform = process.platform, arch = process.arch) => {
  if (platform === 'win32' && arch === 'x64') return 'win32-x64';
  if (platform === 'darwin' && ['arm64', 'x64'].includes(arch)) return `darwin-${arch}`;
  return null;
};

export function selectRuntime(lock, platform = process.platform, arch = process.arch) {
  const id = runtimePlatformId(platform, arch);
  if (!id) return {id: null, supported: false, platform, arch};
  const windows = id === 'win32-x64';
  const browser = windows ? lock.browser : lock.browser.platforms?.[id];
  const ffmpeg = windows ? lock.ffmpeg : lock.ffmpeg.platforms?.[id];
  return {id, supported: !!browser && !!ffmpeg, platform, arch, browser, ffmpeg, extension: windows ? '.exe' : ''};
}

export const unsupportedPlatformLine = (platform = process.platform, arch = process.arch) =>
  `الاستوديو بيدعم Windows 64-bit وmacOS بمعالجات Apple Silicon أو Intel؛ الجهاز الحالي ${platform} ${arch}.`;

export function mediaToolPath(root, name, runtime) {
  return path.join(root, 'Tools', 'bin', `${name}${runtime.extension ?? (process.platform === 'win32' ? '.exe' : '')}`);
}

export function browserToolPath(root, runtime, home = 'engine') {
  const base = home === 'engine' ? path.join(root, 'engine', 'node_modules', '.remotion') : path.join(root, '.remotion');
  return path.join(base, ...runtime.browser.exe.split('/'));
}
