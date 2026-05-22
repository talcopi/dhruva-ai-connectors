import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    browser: 'src/browser.ts',
    'adapters/next': 'src/adapters/next.ts',
    'adapters/express': 'src/adapters/express.ts',
    'grok/index': 'src/grok/index.ts',
    'hru-ai': 'bin/hru-ai.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: 'node20',
  platform: 'node',
  shims: false,
});
