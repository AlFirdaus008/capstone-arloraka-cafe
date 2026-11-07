import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Setiap eksekusi membuat database di memori. Tidak ada URL database atau .env yang dibaca.
const databaseDir = fileURLToPath(new URL('../', import.meta.url));
const sourceCsv = fileURLToPath(new URL('../../dummy-data/dummy_sales_arloraka_coffee_750.csv', import.meta.url));
const writeReport = process.argv.includes('--write-report');
const baseline = {
  counts: { freelancers: 10, products: 6, reports: 750, items: 1681 },
  approved: { reports: 693, bottles: 1986, gross: 27776000, commission: 2777600, management: 24998400 },
};
let db;
let schema;
let seed;
let verify;

async function one(sql, params) {
  return (await db.query(sql, params)).rows[0];
}

async function totals() {
  const counts = await one(`SELECT
    (SELECT COUNT(*) FROM arloraka.freelancers) AS freelancers,
    (SELECT COUNT(*) FROM arloraka.products) AS products,
    (SELECT COUNT(*) FROM arloraka.sales_reports) AS reports,
    (SELECT COUNT(*) FROM arloraka.sales_report_items) AS items`);
  const approved = await one(`SELECT COUNT(*) AS reports, SUM(total_bottles) AS bottles,
    SUM(gross_amount) AS gross, SUM(commission_amount) AS commission,
    SUM(management_amount) AS management FROM arloraka.approved_reports`);
  const numbers = row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
  return { counts: numbers(counts), approved: numbers(approved) };
}

async function differences() {
  return (await db.query(`SELECT * FROM arloraka.report_reconciliation
    WHERE bottle_difference <> 0 OR gross_difference <> 0`)).rows;
}

async function resetFixture() {
  // Hanya tabel di database uji in-memory ini yang dikosongkan.
  await db.exec(`TRUNCATE arloraka.sales_report_items, arloraka.sales_reports,
    arloraka.products, arloraka.freelancers;`);
  await db.exec(seed);
}

async function expectSqlError(sql, expected) {
  const before = await totals();
  let rejection;
  try {
    await db.exec(`BEGIN; ${sql}; COMMIT;`);
  } catch (error) {
    rejection = error;
  } finally {
    await db.exec('ROLLBACK;');
  }
  assert.ok(rejection, 'Perubahan yang tidak valid harus ditolak.');
  assert.equal(rejection.code, expected.code, 'Penolakan harus memakai SQLSTATE yang diharapkan.');
  if (expected.constraint) assert.equal(rejection.constraint, expected.constraint);
  if (expected.message) assert.match(rejection.message, expected.message);
  assert.deepEqual(await totals(), before, 'Transaksi gagal tidak boleh mengubah angka kontrol.');
  return { code: rejection.code, message: rejection.message };
}

const cases = [
  {
    name: 'schema dan seed awal menghasilkan angka kontrol',
    async run() {
      assert.deepEqual(await totals(), baseline);
      const sourceTotals = await one(`SELECT SUM(total_bottles) AS bottles, SUM(gross_amount) AS gross
        FROM arloraka.sales_reports`);
      assert.equal(Number(sourceTotals.bottles), 2145);
      assert.equal(Number(sourceTotals.gross), 30019000);
      await db.exec(verify);
    },
  },
  {
    name: 'schema dan seed dapat dijalankan ulang tanpa data ganda',
    async run() {
      await db.exec(schema);
      await db.exec(seed);
      assert.deepEqual(await totals(), baseline);
      const duplicateSources = await db.query(`SELECT source_dataset, source_transaction_id
        FROM arloraka.sales_reports GROUP BY source_dataset, source_transaction_id HAVING COUNT(*) > 1`);
      assert.equal(duplicateSources.rows.length, 0);
    },
  },
  {
    name: 'perubahan harga/nama master dan import ulang mempertahankan snapshot laporan lama',
    async run() {
      const originalItems = (await db.query('SELECT * FROM arloraka.sales_report_items ORDER BY report_id, product_id')).rows;
      await db.exec(`UPDATE arloraka.products SET current_price = 12500, product_name = 'Americano baru'
        WHERE product_id = 'PRD-001'`);
      assert.deepEqual((await db.query('SELECT * FROM arloraka.sales_report_items ORDER BY report_id, product_id')).rows, originalItems);
      await db.exec(seed);
      const product = await one("SELECT current_price, product_name FROM arloraka.products WHERE product_id = 'PRD-001'");
      assert.equal(Number(product.current_price), 12500);
      assert.equal(product.product_name, 'Americano baru');
      assert.deepEqual((await db.query('SELECT * FROM arloraka.sales_report_items ORDER BY report_id, product_id')).rows, originalItems);
      assert.deepEqual(await totals(), baseline);
    },
  },
  {
    name: 'header tanpa rincian yang cocok',
    run: () => expectSqlError(
      "UPDATE arloraka.sales_reports SET gross_amount = gross_amount + 1 WHERE report_id = 'TRX-0001'",
      { code: 'P0001', message: /Laporan TRX-0001 tidak cocok dengan rincian/ },
    ),
  },
  {
    name: 'rincian tanpa pembaruan total header',
    run: () => expectSqlError(
      "UPDATE arloraka.sales_report_items SET quantity = quantity + 1 WHERE report_id = 'TRX-0001' AND product_id = 'PRD-001'",
      { code: 'P0001', message: /Laporan TRX-0001 tidak cocok dengan rincian/ },
    ),
  },
  {
    name: 'status tidak dikenal',
    run: () => expectSqlError(
      "UPDATE arloraka.sales_reports SET status = 'Verified' WHERE report_id = 'TRX-0001'",
      { code: '23514', constraint: 'sales_reports_status_check' },
    ),
  },
  {
    name: 'kuantitas negatif',
    run: () => expectSqlError(
      "UPDATE arloraka.sales_report_items SET quantity = -1 WHERE report_id = 'TRX-0001' AND product_id = 'PRD-001'",
      { code: '23514', constraint: 'sales_report_items_quantity_check' },
    ),
  },
  {
    name: 'rincian produk ganda',
    run: () => expectSqlError(
      `INSERT INTO arloraka.sales_report_items(report_id, product_id, product_name_at_sale, quantity, unit_price_at_sale)
       SELECT report_id, product_id, product_name_at_sale, quantity, unit_price_at_sale
       FROM arloraka.sales_report_items WHERE report_id = 'TRX-0001' AND product_id = 'PRD-001'`,
      { code: '23505', constraint: 'sales_report_items_pkey' },
    ),
  },
  {
    name: 'produk tanpa master',
    run: () => expectSqlError(
      `INSERT INTO arloraka.sales_report_items(report_id, product_id, product_name_at_sale, quantity, unit_price_at_sale)
       VALUES ('TRX-0001', 'UNKNOWN', 'Uji', 1, 10000)`,
      { code: '23503', constraint: 'sales_report_items_product_id_fkey' },
    ),
  },
  {
    name: 'koreksi atomik memperbarui total/komisi dan tidak ditimpa import ulang',
    async run() {
      await db.exec(`BEGIN;
        SELECT report_id FROM arloraka.sales_reports WHERE report_id = 'TRX-0001' FOR UPDATE;
        UPDATE arloraka.sales_report_items SET quantity = quantity + 1
          WHERE report_id = 'TRX-0001' AND product_id = 'PRD-001';
        UPDATE arloraka.sales_reports SET total_bottles = total_bottles + 1,
          gross_amount = gross_amount + 10000, version = version + 1 WHERE report_id = 'TRX-0001';
        COMMIT;`);
      const report = await one("SELECT * FROM arloraka.sales_reports WHERE report_id = 'TRX-0001'");
      assert.equal(report.total_bottles, 5);
      assert.equal(Number(report.gross_amount), 62000);
      assert.equal(Number(report.commission_amount), 6200);
      assert.equal(Number(report.management_amount), 55800);
      assert.equal(report.version, 2);
      const items = (await db.query("SELECT * FROM arloraka.sales_report_items WHERE report_id = 'TRX-0001' ORDER BY product_id")).rows;
      await db.exec(seed);
      assert.deepEqual(await one("SELECT * FROM arloraka.sales_reports WHERE report_id = 'TRX-0001'"), report);
      assert.deepEqual((await db.query("SELECT * FROM arloraka.sales_report_items WHERE report_id = 'TRX-0001' ORDER BY product_id")).rows, items);
      const after = await totals();
      assert.equal(after.approved.gross, baseline.approved.gross + 10000);
      assert.equal(after.approved.commission, baseline.approved.commission + 1000);
    },
  },
  {
    name: 'approved masuk satu kali; pending/rejected/revision tidak masuk kontribusi',
    async run() {
      const report = await one("SELECT status FROM arloraka.sales_reports WHERE report_id = 'TRX-0465'");
      assert.equal(report.status, 'pending');
      for (const status of ['pending', 'rejected', 'revision']) {
        await db.query('UPDATE arloraka.sales_reports SET status = $1 WHERE report_id = $2', [status, 'TRX-0465']);
        assert.deepEqual(await totals(), baseline);
      }
      await db.exec("UPDATE arloraka.sales_reports SET status = 'approved' WHERE report_id = 'TRX-0465'");
      const approved = await totals();
      assert.equal(approved.approved.reports, 694);
      assert.equal(approved.approved.bottles, 1988);
      assert.equal(approved.approved.gross, 27799000);
      assert.equal(approved.approved.commission, 2779900);
      await db.exec("UPDATE arloraka.sales_reports SET status = 'approved' WHERE report_id = 'TRX-0465'");
      await db.exec(seed);
      assert.deepEqual(await totals(), approved);
    },
  },
  {
    name: 'pembulatan komisi Rp15.005 menghasilkan Rp1.501 dan batas rupiah sesuai',
    async run() {
      const values = [[1, 1], [10, 1], [11, 2], [15005, 1501], [15010, 1501]];
      for (const [gross, expected] of values) {
        const reportId = `TEST-ROUNDING-${gross}`;
        await db.exec('BEGIN');
        await db.query(`INSERT INTO arloraka.sales_reports
          (report_id, freelancer_id, sale_date, total_bottles, gross_amount, payment_method, sale_location, is_dummy)
          VALUES ($1, 'FL-001', '2026-10-20', 1, $2, 'QRIS', 'Uji pembulatan', TRUE)`, [reportId, gross]);
        await db.query(`INSERT INTO arloraka.sales_report_items
          (report_id, product_id, product_name_at_sale, quantity, unit_price_at_sale)
          VALUES ($1, 'PRD-001', 'Americano uji', 1, $2)`, [reportId, gross]);
        await db.exec('COMMIT');
        const actual = await one('SELECT commission_amount, management_amount FROM arloraka.sales_reports WHERE report_id = $1', [reportId]);
        assert.equal(Number(actual.commission_amount), expected);
        assert.equal(Number(actual.management_amount), gross - expected);
      }
    },
  },
];

const report = {
  engine: null,
  node_version: process.version,
  generated_at_utc: new Date().toISOString(),
  test_environment: 'PGlite in-memory; database aplikasi pengguna tidak dihubungkan',
  baseline,
  expected_test_count: cases.length,
  tests: cases.map(({ name }) => ({ name, status: 'not_run', passed: false })),
  all_passed: false,
  reconciliation_differences: null,
  scope: 'Schema inti transaksi, seed berulang, snapshot harga, koreksi, status, constraints, dan pembulatan. Belum menguji backend, login, akses antarpengguna, pembayaran, atau konkurensi server.',
  tested_files: {},
};

async function main() {
  try {
    assert.ok(process.argv.slice(2).every(argument => argument === '--write-report'), 'Argumen tidak dikenal. Gunakan --write-report untuk memperbarui laporan.');
    const { PGlite } = await import('@electric-sql/pglite');
    for (const name of ['schema.sql', 'seed.sql', 'verify.sql', 'prepare_seed.py', 'tests/run-tests.mjs', 'package.json', 'package-lock.json']) {
      const bytes = await fs.readFile(path.join(databaseDir, name));
      report.tested_files[name] = createHash('sha256').update(bytes).digest('hex');
    }
    report.source_csv_sha256 = createHash('sha256').update(await fs.readFile(sourceCsv)).digest('hex');
    schema = await fs.readFile(path.join(databaseDir, 'schema.sql'), 'utf8');
    seed = await fs.readFile(path.join(databaseDir, 'seed.sql'), 'utf8');
    verify = await fs.readFile(path.join(databaseDir, 'verify.sql'), 'utf8');
    db = new PGlite();
    await db.exec(schema);
    report.engine = (await one('SELECT version() AS version')).version;

    for (const [index, testCase] of cases.entries()) {
      const result = report.tests[index];
      try {
        await resetFixture();
        const rejection = await testCase.run();
        const unmatched = await differences();
        assert.equal(unmatched.length, 0, 'Header dan rincian harus tetap cocok setelah pengujian.');
        Object.assign(result, { status: 'passed', passed: true });
        if (rejection) result.rejection = rejection;
        console.log(`PASS ${index + 1}/${cases.length} ${testCase.name}`);
      } catch (error) {
        Object.assign(result, { status: 'failed', passed: false, error: error.message });
        if (error.code) result.error_code = error.code;
        console.error(`FAIL ${index + 1}/${cases.length} ${testCase.name}: ${error.message}`);
        await db.exec('ROLLBACK;');
      }
    }
    report.reconciliation_differences = (await differences()).length;
  } catch (error) {
    report.fatal_error = error.message;
    console.error(`Pengujian tidak selesai: ${error.message}`);
  } finally {
    if (db) {
      try { await db.close(); }
      catch (error) { report.fatal_error = `Database uji gagal ditutup: ${error.message}`; }
    }
  }
  report.passed_count = report.tests.filter(test => test.status === 'passed').length;
  report.failed_count = report.tests.filter(test => test.status === 'failed').length;
  report.not_run_count = report.tests.filter(test => test.status === 'not_run').length;
  report.all_passed = !report.fatal_error && report.passed_count === cases.length && report.reconciliation_differences === 0;
  if (writeReport) {
    const temporary = path.join(databaseDir, 'test_results.json.tmp');
    await fs.writeFile(temporary, JSON.stringify(report, null, 2) + '\n');
    await fs.rename(temporary, path.join(databaseDir, 'test_results.json'));
    console.log('Laporan diperbarui: database/test_results.json');
  }
  console.log(`Hasil: ${report.passed_count}/${cases.length} lulus, ${report.failed_count} gagal, ${report.not_run_count} belum dijalankan.`);
  process.exitCode = report.all_passed ? 0 : 1;
}

await main();
