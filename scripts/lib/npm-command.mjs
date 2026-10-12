import path from 'node:path';
import {existsSync} from 'node:fs';

const localCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const prefixCli = path.join(path.dirname(path.dirname(process.execPath)), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
export const npmCliPath = [process.env.npm_execpath, localCli, prefixCli].find(file => file && existsSync(file)) ?? null;

export const resolveNpmCommand=(args=[])=>npmCliPath
  ? {command: process.execPath, args: [npmCliPath, ...args]}
  : {command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args};
