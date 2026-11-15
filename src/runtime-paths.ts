import {existsSync, readFileSync} from 'node:fs';
import {dirname, isAbsolute, join} from 'node:path';

export interface RuntimePaths {
  python: string;
  node: string;
  ffmpeg: string;
  ffprobe: string;
  snowluma: string;
  snowlumaNode: string;
  qq?: string;
  wechat?: string;
}

export function loadRuntime(data: string): RuntimePaths {
  const file = join(data, 'runtime.json');
  const config: Partial<RuntimePaths> = existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    : {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value !== 'string' || !isAbsolute(value)) {
      throw Error('runtime.json 中的 ' + key + ' 必须是绝对路径');
    }
  }
  const bundledNode = join(dirname(process.execPath), 'resources', 'runtime', 'primary-runtime', 'dependencies', 'node', 'bin', 'node.exe');
  return {
    python: config.python ?? join(data, 'runtime', 'python', 'python.exe'),
    node: config.node ?? (existsSync(bundledNode) ? bundledNode : process.execPath),
    ffmpeg: config.ffmpeg ?? 'ffmpeg',
    ffprobe: config.ffprobe ?? 'ffprobe',
    snowluma: config.snowluma ?? join(data, 'platforms', 'snowluma'),
    snowlumaNode: config.snowlumaNode ?? join(data, 'runtime', 'node', 'node.exe'),
    qq: config.qq,
    wechat: config.wechat,
  };
}

