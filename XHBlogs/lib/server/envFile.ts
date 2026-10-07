// lib/server/envFile.ts —— 修改本地的 .env.local（仅供本地开发模式下的接口使用）
//
// 只替换 / 追加指定的那一行，其他内容和注释原样保留。.env.local 已被 .gitignore 忽略，不会被提交。
import fs from 'fs';
import path from 'path';

const ENV_FILE = path.join(process.cwd(), '.env.local');

export function setEnvValue(name: string, value: string): void {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name) || /[\r\n]/.test(value)) throw new Error('非法的环境变量');
  let lines: string[] = [];
  try {
    lines = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^\\s*${name}\\s*=`);
  const index = lines.findIndex((l) => pattern.test(l));
  if (index >= 0) lines[index] = line;
  else {
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push(line);
  }
  fs.writeFileSync(ENV_FILE, `${lines.join('\n')}\n`, 'utf8');
  // 当前进程立即生效，不用重启
  process.env[name] = value;
}
