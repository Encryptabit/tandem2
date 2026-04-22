import { defineConfig } from 'tsup';

const isProd = process.env.NODE_ENV === 'production';

export default defineConfig([
  {
    entry: {
      'cli/tandem': 'src/cli/tandem.ts',
      'cli/start-broker': 'src/cli/start-broker.ts',
      'cli/start-mcp': 'src/cli/start-mcp.ts',
    },
    format: 'esm',
    target: 'node20',
    platform: 'node',
    outDir: 'dist',
    clean: true,
    splitting: true,
    sourcemap: !isProd,
    minify: isProd,
    dts: false,
    external: ['review-broker-core', '@gsd/pi-agent-core', '@gsd/pi-ai'],
  },
  {
    entry: { index: 'src/index.ts' },
    format: 'esm',
    target: 'node20',
    platform: 'node',
    outDir: 'dist',
    clean: false,
    sourcemap: !isProd,
    minify: isProd,
    dts: false,
    external: ['review-broker-core', '@gsd/pi-agent-core', '@gsd/pi-ai'],
  },
]);
