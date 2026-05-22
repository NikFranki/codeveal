const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  outfile: './out/extension.js',
  external: ['vscode'],
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  minify: process.argv.includes('--minify'),
}).catch(() => process.exit(1));
