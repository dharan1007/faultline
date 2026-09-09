import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const productionFiles = [
  'index.html',
  'src/runtime.js',
  'src/ui.js',
  'src/capture-format.js',
  'src/reducer-engine.js',
  'src/sandbox-policy.js'
];

for (const file of productionFiles) {
  if (!existsSync(file)) {
    console.error(`Missing production file: ${file}`);
    process.exit(1);
  }
}

rmSync('public', { recursive: true, force: true });
mkdirSync('public/src', { recursive: true });

for (const file of productionFiles) {
  copyFileSync(file, `public/${file}`);
}

console.log('static production tree verified and staged in public/');
