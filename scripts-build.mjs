import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

export const productionFiles = [
  'index.html',
  'workbench.html',
  'evidence.html',
  'connect.html',
  'src/ui.css',
  'src/ui-shell.js',
  'src/ui-start.js',
  'src/ui-workbench.js',
  'src/ui-evidence.js',
  'src/ui-connect.js',
  'src/runtime.js',
  'src/ui.js',
  'src/reducer-engine.js',
  'src/sandbox-policy.js'
];

if (process.argv.includes('--list')) {
  process.stdout.write(`${productionFiles.join('\n')}\n`);
  process.exit(0);
}

for (const file of productionFiles) {
  if (!existsSync(file)) {
    console.error(`Missing production file: ${file}`);
    process.exit(1);
  }
}

rmSync('public', { recursive: true, force: true });
for (const file of productionFiles) {
  const destination = `public/${file}`;
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(file, destination);
}

console.log(`static production tree verified and staged in public/ (${productionFiles.length} files)`);
