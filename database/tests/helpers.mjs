import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectDir = fileURLToPath(new URL('../../', import.meta.url));
export const databaseDir = fileURLToPath(new URL('../', import.meta.url));
export const readJson = async relative => JSON.parse(await fs.readFile(path.join(projectDir, relative), 'utf8'));
export const digestFile = async relative => createHash('sha256').update(await fs.readFile(path.join(projectDir, relative))).digest('hex');

export function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

export async function loadQueries() {
  const source = await fs.readFile(path.join(projectDir, 'analysis/dashboard_queries.sql'), 'utf8');
  const markers = [...source.matchAll(/^-- name: ([a-z_]+)\s*$/gm)];
  const queries = {};
  for (const [index, marker] of markers.entries()) {
    assert.ok(!queries[marker[1]], `Nama query ganda: ${marker[1]}`);
    queries[marker[1]] = source.slice(marker.index + marker[0].length, markers[index + 1]?.index ?? source.length).trim();
  }
  for (const name of ['summary', 'daily', 'monthly', 'freelancers', 'products', 'statuses', 'target']) assert.ok(queries[name], `Query belum tersedia: ${name}`);
  return queries;
}

export async function queryRows(db, queries, name, params) {
  return normalize((await db.query(queries[name], params)).rows);
}

export async function runChecks(checks, { label, reportFile, files, resetEach = false }) {
  const result = {
    suite: label, engine: null, generated_at_utc: new Date().toISOString(),
    test_environment: 'PGlite in-memory; tidak memakai database aplikasi atau kredensial',
    expected_test_count: checks.length, all_passed: false, tested_files: {},
    tests: checks.map(check => ({ id: check.id, name: check.name, status: 'not_run', passed: false })),
    scope: 'Acuan SQL dan data simulasi DS-1; belum membuktikan perilaku API, hak akses, scheduler pengakuan, atau UI aplikasi.',
  };
  let db;
  try {
    assert.ok(process.argv.slice(2).every(value => value === '--write-report'), 'Argumen tidak dikenal.');
    for (const file of files) result.tested_files[file] = await digestFile(file);
    const { PGlite } = await import('@electric-sql/pglite');
    db = new PGlite();
    await db.exec(await fs.readFile(path.join(databaseDir, 'schema.sql'), 'utf8'));
    const seed = await fs.readFile(path.join(databaseDir, 'seed.sql'), 'utf8');
    await db.exec(seed);
    result.engine = (await db.query('SELECT version() AS version')).rows[0].version;
    for (const [index, check] of checks.entries()) {
      try {
        if (resetEach) {
          await db.exec('TRUNCATE arloraka.sales_report_items, arloraka.sales_reports, arloraka.products, arloraka.freelancers');
          await db.exec(seed);
        }
        await check.run(db);
        const differences = await db.query('SELECT * FROM arloraka.report_reconciliation WHERE bottle_difference <> 0 OR gross_difference <> 0');
        assert.equal(differences.rows.length, 0, 'Header dan rincian harus tetap cocok.');
        Object.assign(result.tests[index], { status: 'passed', passed: true });
        console.log(`${label} PASS ${index + 1}/${checks.length} ${check.id} ${check.name}`);
      } catch (error) {
        Object.assign(result.tests[index], { status: 'failed', passed: false, error: error.message });
        console.error(`${label} FAIL ${check.id}: ${error.message}`);
        await db.exec('ROLLBACK');
      }
    }
  } catch (error) {
    result.fatal_error = error.message;
    console.error(`${label} tidak selesai: ${error.message}`);
  } finally {
    if (db) {
      try { await db.close(); }
      catch (error) { result.fatal_error = error.message; console.error(error.message); }
    }
  }
  result.passed_count = result.tests.filter(test => test.passed).length;
  result.failed_count = result.tests.filter(test => test.status === 'failed').length;
  result.not_run_count = result.tests.filter(test => test.status === 'not_run').length;
  result.all_passed = !result.fatal_error && result.passed_count === checks.length;
  if (process.argv.includes('--write-report')) {
    const target = path.join(databaseDir, reportFile);
    await fs.writeFile(target + '.tmp', JSON.stringify(result, null, 2) + '\n');
    await fs.rename(target + '.tmp', target);
  }
  console.log(`${label}: ${result.passed_count}/${checks.length} lulus, ${result.failed_count} gagal, ${result.not_run_count} belum dijalankan.`);
  process.exitCode = result.all_passed ? 0 : 1;
  return result;
}
