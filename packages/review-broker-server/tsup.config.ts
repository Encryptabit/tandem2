import { defineConfig } from 'tsup';

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
    sourcemap: true,
    dts: false,
    noExternal: ['review-broker-core'],
    external: ['@gsd/pi-agent-core', '@gsd/pi-ai'],
  },
  {
    entry: { index: 'src/index.ts' },
    format: 'esm',
    target: 'node20',
    platform: 'node',
    outDir: 'dist',
    clean: false,
    sourcemap: true,
    dts: false,
    noExternal: ['review-broker-core'],
    external: ['@gsd/pi-agent-core', '@gsd/pi-ai'],
  },
]);
