import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'tandem2-vitest-'));
const emptyConfigPath = path.join(tempDirectory, 'review-broker.config.json');

writeFileSync(emptyConfigPath, '{}\n', 'utf8');
process.env.REVIEW_BROKER_CONFIG_PATH = emptyConfigPath;

// Isolate XDG dirs so the broker's global-config fallback and DB defaults
// land in a per-suite sandbox instead of the developer's real $HOME.
process.env.XDG_CONFIG_HOME = path.join(tempDirectory, 'config');
process.env.XDG_STATE_HOME = path.join(tempDirectory, 'state');
