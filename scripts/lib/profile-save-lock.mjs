import net from 'node:net';
import {createHash} from 'node:crypto';
import {mkdir, open, readFile, realpath, stat, unlink} from 'node:fs/promises';
import path from 'node:path';




function listen(server, address) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(address, () => {server.removeListener('error', reject); resolve();});
  });
}

function socketIsActive(address) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(address);
    socket.once('connect', () => {socket.destroy(); resolve(true);});
    socket.once('error', error => {
      if (['ECONNREFUSED', 'ENOENT'].includes(error.code)) resolve(false);
      else reject(error);
    });
  });
}

export async function acquireProfileSaveLock(root) {
  const real = await realpath(root);
  const identity = process.platform === 'win32' ? real.toLowerCase() : real;
  const key = createHash('sha256').update(identity).digest('hex').slice(0, 32);
  if (!['win32', 'linux', 'darwin'].includes(process.platform)) throw new Error('Settings save locking is unsupported on this platform.');
  const address = process.platform === 'win32' ? '\\\\.\\pipe\\reel-studio-profile-' + key
    : process.platform === 'linux' ? `\0reel-studio-profile-${key}`
      : path.join(real, 'state', 'tmp', `p-${key.slice(0, 20)}.lock`);
  if (process.platform === 'darwin') {
    await mkdir(path.dirname(address), {recursive: true});
    for (;;) {
      try {
        const handle = await open(address, 'wx');
        await handle.writeFile(`${process.pid}\n`, 'utf8');
        await handle.close();
        return async () => unlink(address).catch(error => {if (error.code !== 'ENOENT') throw error;});
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const owner = Number((await readFile(address, 'utf8').catch(() => '')).trim());
        let alive = false;
        if (Number.isInteger(owner) && owner > 0) {
          try { process.kill(owner, 0); alive = true; } catch (probe) { alive = probe.code === 'EPERM'; }
        }
        if (alive) {
          const busy = new Error('شاشة تانية بتحفظ إعداداتك. جرّب تاني بعد لحظة.'); busy.status = 409; throw busy;
        }
        await unlink(address).catch(unlinkError => {if (unlinkError.code !== 'ENOENT') throw unlinkError;});
      }
    }
  }
  const server = net.createServer(socket => socket.destroy());
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await listen(server, address);
        break;
      } catch (error) {
        if (process.platform !== 'darwin' || error.code !== 'EADDRINUSE' || attempt >= 1) throw error;
        if (await socketIsActive(address)) throw error;
        const entry = await stat(address).catch(() => null);
        if (!entry?.isSocket()) throw error;
        await unlink(address).catch(unlinkError => {if (unlinkError.code !== 'ENOENT') throw unlinkError;});
      }
    }
  } catch (error) {
    if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
      const busy = new Error('شاشة تانية بتحفظ إعداداتك. جرّب تاني بعد لحظة.'); busy.status = 409; throw busy;
    }
    throw error;
  }
  return async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  };
}
