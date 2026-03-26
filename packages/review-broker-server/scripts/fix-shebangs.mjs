#!/usr/bin/env node
// Ensures CLI entrypoints have a shebang on line 1.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliFiles = ['tandem.js', 'start-broker.js', 'start-mcp.js'];
const shebang = '#!/usr/bin/env node\n';

for (const file of cliFiles) {
  const filePath = resolve(__dirname, '..', 'dist', 'cli', file);
  const content = readFileSync(filePath, 'utf8');
  if (!content.startsWith('#!')) {
    writeFileSync(filePath, shebang + content);
  }
}
