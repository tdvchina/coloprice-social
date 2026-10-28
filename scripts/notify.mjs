// CLI wrapper for workflows: node scripts/notify.mjs "message"   (or text on stdin / --file=path)
import { readFileSync, existsSync } from 'node:fs';
import { loadEnv, parseArgs } from './lib/env.mjs';
import { notify } from './lib/telegram.mjs';

loadEnv();
const args = parseArgs();
let text = args._.join(' ');
if (args.file) text = existsSync(args.file) ? readFileSync(args.file, 'utf8').trim() : '';
if (!text) {
  console.log('notify: empty message — nothing sent');
  process.exit(0);
}
await notify(text);
