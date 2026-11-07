import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!process.argv.slice(2).every(value => value === '--write-report')) throw new Error('Argumen tidak dikenal.');
const flags = process.argv.includes('--write-report') ? ['--write-report'] : [];
for (const script of ['run-tests.mjs', 'run-scenarios.mjs', 'check-dashboard-reference.mjs']) {
  const file = fileURLToPath(new URL(script, import.meta.url));
  const child = spawnSync(process.execPath, [file, ...flags], { stdio: 'inherit' });
  if (child.error || child.status !== 0) {
    console.error(`Suite ${script} gagal; suite berikutnya belum dijalankan.`);
    if (child.error) console.error(child.error.message);
    process.exit(child.status || 1);
  }
}
console.log('Seluruh 3 suite lulus: inti database, skenario tambahan DS-1, dan acuan dashboard.');
