import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// First-run convenience: if there's no .env yet, create one from .env.example and
// stop with friendly instructions — so non-technical users never have to copy or
// rename files by hand.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
  fs.copyFileSync(examplePath, envPath);
  console.log('\n[ OK ] Created your settings file: .env');
  console.log('Open ".env" and fill in these 3 fields:');
  console.log('     BOT_TOKEN          = bot token from @BotFather');
  console.log('     EDUGATE_USERNAME   = your edugate username');
  console.log('     EDUGATE_PASSWORD   = your edugate password');
  console.log('Save the file, then run:  npm start\n');
  process.exit(0);
}
