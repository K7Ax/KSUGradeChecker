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
  console.log('\n✅ جهّزت لك ملف الإعدادات: .env');
  console.log('👉 افتح ملف ".env" وعبّي ٣ خانات بس:');
  console.log('     BOT_TOKEN          ← رمز البوت من @BotFather');
  console.log('     EDUGATE_USERNAME   ← اسم المستخدم في إيدوجيت');
  console.log('     EDUGATE_PASSWORD   ← كلمة المرور حقتك');
  console.log('   احفظ الملف، وبعدها اكتب:  npm start\n');
  process.exit(0);
}
