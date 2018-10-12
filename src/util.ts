import { readFileSync } from 'fs';
import * as json5 from 'json5';
import { dirname, resolve } from 'path';

/*
"baseUrl": ".",
"outDir": "lib",
"paths": {
  "src/*": ["src/*"]
},
*/

export interface IRawTSConfig {
  extends?: string;
  compilerOptions?: ITSConfig;
}

export interface ITSConfig {
  baseUrl?: string;
  rootDir?: string;
  outDir?: string;
  paths?: { [key: string]: string[] };
}

export const mapPaths = (
  paths: { [key: string]: string[] },
  mapper: (x: string) => string
): { [key: string]: string[] } => {
  const dest = {} as { [key: string]: string[] };
  Object.keys(paths).forEach((key) => {
    dest[key] = paths[key].map(mapper);
  });
  return dest;
};

export const loadConfig = (file: string): ITSConfig => {
  const fileData = readFileSync(file, { encoding: 'UTF-8' });
  const {
    extends: ext,
    compilerOptions: { baseUrl, rootDir, outDir, paths } = {} as ITSConfig,
  } = json5.parse(fileData) as IRawTSConfig;

  const config: ITSConfig = {};
  if (baseUrl) {
    config.baseUrl = baseUrl;
  }
  if (rootDir) {
    config.rootDir = rootDir;
  }
  if (outDir) {
    config.outDir = outDir;
  }
  if (paths) {
    config.paths = paths;
  }

  if (ext) {
    const parentConfig = loadConfig(resolve(dirname(file), ext));
    return {
      ...parentConfig,
      ...config,
    };
  }

  return config;
};
