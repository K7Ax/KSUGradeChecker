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
  console.log('\n✅ Created your settings file: .env');
  console.log('👉 Open ".env" in a text editor and fill in:');
  console.log('     BOT_TOKEN          (from @BotFather on Telegram)');
  console.log('     EDUGATE_USERNAME   (your edugate username)');
  console.log('     EDUGATE_PASSWORD   (your edugate password)');
  console.log('   Save the file, then run:  npm start\n');
  process.exit(0);
}
