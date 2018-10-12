#! /usr/bin/env node

// tslint:disable no-console
import * as program from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { sync } from 'globby';
import { dirname, relative, resolve } from 'path';
import { loadConfig } from './util';

const debug = false;

function logConsole(...args: any[]): void {
  if (debug) console.log(...args);
}

program
  .version('0.0.1')
  .option('-p, --project <file>', 'path to tsconfig.json')
  .option('-s, --src <path>', 'source root path')
  .option('-o, --out <path>', 'output root path');

program.on('--help', () => {
  logConsole(`
  $ tscpath -p tsconfig.json
`);
});

program.parse(process.argv);

const { project, src, out } = program as {
  project?: string;
  src?: string;
  out?: string;
};
if (!project) {
  throw new Error('--project must be specified');
}
if (!src) {
  throw new Error('--src must be specified');
}

const configFile = resolve(process.cwd(), project);
logConsole(`tsconfig.json: ${configFile}`);
const srcRoot = resolve(src);
logConsole(`src: ${srcRoot}`);

const outRoot = out && resolve(out);
logConsole(`out: ${outRoot}`);

const { baseUrl, outDir, paths } = loadConfig(configFile);

if (!baseUrl) {
  throw new Error('compilerOptions.baseUrl is not set');
}
if (!paths) {
  throw new Error('compilerOptions.paths is not set');
}
if (!outDir) {
  throw new Error('compilerOptions.outDir is not set');
}
logConsole(`baseUrl: ${baseUrl}`);
logConsole(`outDir: ${outDir}`);
logConsole(`paths: ${JSON.stringify(paths, null, 2)}`);

const configDir = dirname(configFile);

const basePath = resolve(configDir, baseUrl);
logConsole(`basePath: ${basePath}`);

const outPath = outRoot || resolve(basePath, outDir);
logConsole(`outPath: ${outPath}`);

const outFileToSrcFile = (x: string): string =>
  resolve(srcRoot, relative(outPath, x));

const aliases = Object.keys(paths)
  .map((alias) => ({
    prefix: alias.replace(/\*$/, ''),
    aliasPaths: paths[alias as keyof typeof paths].map((p) =>
      resolve(basePath, p.replace(/\*$/, ''))
    ),
  }))
  .filter(({ prefix }) => prefix);
logConsole(`aliases: ${JSON.stringify(aliases, null, 2)}`);

const toRelative = (from: string, x: string): string => {
  const rel = relative(from, x);
  return rel.startsWith('.') ? rel : `./${rel}`;
};

const exts = ['.js', '.jsx', '.ts', '.tsx', '.d.ts', '.json'];

const absToRel = (modulePath: string, outFile: string): string => {
  const alen = aliases.length;
  for (let j = 0; j < alen; j += 1) {
    const { prefix, aliasPaths } = aliases[j];

    if (modulePath.startsWith(prefix)) {
      const modulePathRel = modulePath.substring(prefix.length);
      const srcFile = outFileToSrcFile(outFile);
      const outRel = relative(basePath, outFile);
      logConsole(`${outRel} (source: ${relative(basePath, srcFile)}):`);
      logConsole(`\timport '${modulePath}'`);
      const len = aliasPaths.length;
      for (let i = 0; i < len; i += 1) {
        const apath = aliasPaths[i];
        const moduleSrc = resolve(apath, modulePathRel);
        if (
          existsSync(moduleSrc) ||
          exts.some((ext) => existsSync(moduleSrc + ext))
        ) {
          const rel = toRelative(dirname(srcFile), moduleSrc);
          logConsole(
            `\treplacing '${modulePath}' -> '${rel}' referencing ${relative(
              basePath,
              moduleSrc
            )}`
          );
          return rel;
        }
      }
      logConsole(`\tcould not replace ${modulePath}`);
    }
  }
  return modulePath;
};

const requireRegex = /(?:import|require)\(['"]([^'"]*)['"]\)/g;
const importRegex = /import ['"]([^'"]*)['"]/g;
const fromRegex = /from ['"]([^'"]*)['"]/g;

const replaceImportStatement = (
  orig: string,
  matched: string,
  outFile: string
): string => {
  const index = orig.indexOf(matched);
  return (
    orig.substring(0, index) +
    absToRel(matched, outFile).replace(/\\/g, '/') +
    orig.substring(index + matched.length)
  );
};

const replaceAlias = (text: string, outFile: string): string =>
  text
    .replace(requireRegex, (orig, matched) =>
      replaceImportStatement(orig, matched, outFile)
    )
    .replace(fromRegex, (orig, matched) =>
      replaceImportStatement(orig, matched, outFile)
    )
    .replace(importRegex, (orig, matched) =>
      replaceImportStatement(orig, matched, outFile)
    );

// import relative to absolute path
const files = sync(`${outPath}/**/*.{js,jsx,ts,tsx}`, {
  dot: true,
  noDir: true,
} as any).map((x) => resolve(x));

const flen = files.length;
for (let i = 0; i < flen; i += 1) {
  const file = files[i];
  const text = readFileSync(file, 'utf8');
  const newText = replaceAlias(text, file);
  if (text !== newText) {
    writeFileSync(file, newText, 'utf8');
  }
}
