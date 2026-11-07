import assert from 'node:assert/strict';
import { digestFile, loadQueries, queryRows, readJson, runChecks } from './helpers.mjs';

const reference = await readJson('analysis/reference/dashboard_reference.json');
const queries = await loadQueries();
const defaultParams = [reference.period_start, reference.period_end, null, reference.source_dataset];
const checks = [{
  id: 'REF-01', name: 'Ringkasan SQL cocok dengan CSV sumber dan sidik sumber masih sesuai',
  async run(db) {
    assert.equal(await digestFile('dummy-data/dummy_sales_arloraka_coffee_750.csv'), reference.source_csv_sha256, 'CSV berubah; bangun ulang acuan setelah meninjau sumber.');
    assert.equal(await digestFile('DataDummyCafe.ipynb'), reference.generator_sha256, 'Generator berubah; bangun ulang acuan setelah meninjau harga/asumsi.');
    assert.deepEqual((await queryRows(db, queries, 'summary', defaultParams))[0], reference.summary);
  },
}];

for (const [name, label] of [
  ['daily', 'Rekap harian'], ['monthly', 'Rekap bulanan'], ['freelancers', 'Kontribusi per freelancer'],
  ['products', 'Penjualan per produk'], ['statuses', 'Jumlah laporan per status'],
]) {
  const id = `REF-${String(checks.length + 1).padStart(2, '0')}`;
  checks.push({ id, name: `${label} cocok dengan perhitungan sumber`, async run(db) {
    assert.deepEqual(await queryRows(db, queries, name, defaultParams), reference[name]);
    if (name === 'products') {
      const original = (await db.query("SELECT current_price FROM arloraka.products WHERE product_code = 'americano'")).rows[0];
      try {
        await db.exec("UPDATE arloraka.products SET current_price = current_price + 777 WHERE product_code = 'americano'");
        assert.deepEqual(await queryRows(db, queries, name, defaultParams), reference[name], 'Query produk harus memakai harga transaksi setelah master berubah.');
      } finally {
        await db.query("UPDATE arloraka.products SET current_price = $1 WHERE product_code = 'americano'", [original.current_price]);
      }
    }
  } });
}
for (const filter of reference.filter_cases) {
  checks.push({
    id: `REF-${String(checks.length + 1).padStart(2, '0')}`, name: `Filter ${filter.id}`,
    async run(db) {
      const params = [filter.start_date, filter.end_date, filter.freelancer_id, reference.source_dataset];
      assert.deepEqual((await queryRows(db, queries, 'summary', params))[0], filter.expected);
    },
  });
}

await runChecks(checks, {
  label: 'REFERENCE', reportFile: 'reference_test_results.json',
  files: ['database/schema.sql', 'database/seed.sql', 'analysis/dashboard_queries.sql',
    'analysis/build_reference.py', 'analysis/reference/dashboard_reference.json',
    'dummy-data/dummy_sales_arloraka_coffee_750.csv', 'DataDummyCafe.ipynb',
    'database/tests/helpers.mjs', 'database/tests/check-dashboard-reference.mjs'],
});
