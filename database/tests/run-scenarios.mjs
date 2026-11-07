import assert from 'node:assert/strict';
import { loadQueries, queryRows, readJson, runChecks } from './helpers.mjs';

const fixtures = await readJson('database/fixtures/ds1_scenarios.json');
const expected = await readJson('database/fixtures/ds1_expected.json');
const queries = await loadQueries();
assert.equal(fixtures.source_dataset, expected.source_dataset);

async function insertGroup(db, group) {
  assert.ok(fixtures.groups[group], `Grup fixture tidak tersedia: ${group}`);
  await db.exec('BEGIN');
  for (const report of fixtures.groups[group]) {
    await db.query(`INSERT INTO arloraka.sales_reports
      (report_id, source_dataset, source_transaction_id, freelancer_id, sale_date, status,
       total_bottles, gross_amount, payment_method, sale_location, notes, is_dummy)
      VALUES ($1, $2, $1, $3, $4, $5, $6, $7, 'QRIS', 'Fixture DS-1', $8, TRUE)`,
    [report.report_id, fixtures.source_dataset, report.freelancer_id, report.sale_date,
      report.status, report.total_bottles, report.gross_amount, `Data dummy tambahan: ${group}`]);
    for (const item of report.items) {
      await db.query(`INSERT INTO arloraka.sales_report_items
        (report_id, product_id, product_name_at_sale, quantity, unit_price_at_sale)
        VALUES ($1, $2, $3, $4, $5)`,
      [report.report_id, item.product_id, item.product_name_at_sale, item.quantity, item.unit_price_at_sale]);
    }
  }
  await db.exec('COMMIT');
}

const checks = expected.cases.map(scenario => ({
  id: scenario.id,
  name: scenario.name,
  async run(db) {
    await insertGroup(db, scenario.group);
    const params = [scenario.start_date, scenario.end_date, scenario.freelancer_id ?? null, fixtures.source_dataset];
    switch (scenario.kind) {
      case 'month_boundary':
      case 'monthly_rounding':
        assert.deepEqual(await queryRows(db, queries, 'monthly', params), scenario.expected);
        break;
      case 'late_approval':
        assert.deepEqual(await queryRows(db, queries, 'monthly', params), []);
        // Tanggal aksi adalah konteks skenario; schema inti belum menyimpan waktu keputusan.
        assert.equal(scenario.action_reference_date, '2026-11-03');
        await db.exec("UPDATE arloraka.sales_reports SET status = 'approved' WHERE report_id = 'DS1-LATE-OCT'");
        assert.deepEqual(await queryRows(db, queries, 'monthly', params), scenario.expected);
        break;
      case 'empty_period': {
        assert.deepEqual((await queryRows(db, queries, 'summary', params))[0], scenario.expected);
        const daily = await queryRows(db, queries, 'daily', params);
        assert.deepEqual(daily.map(row => row.sale_date), ['2026-12-01', '2026-12-02', '2026-12-03']);
        for (const row of daily) assert.equal(row.approved_reports + row.approved_bottles + row.approved_gross + row.approved_commission, 0);
        break;
      }
      case 'target':
        assert.deepEqual((await queryRows(db, queries, 'target', [...params, scenario.target_bottles]))[0], scenario.expected);
        break;
      case 'freelancer_scope':
        assert.deepEqual((await queryRows(db, queries, 'summary', params))[0], scenario.expected);
        break;
      default:
        throw new Error(`Jenis skenario belum didukung: ${scenario.kind}`);
    }
  },
}));

await runChecks(checks, {
  label: 'SCENARIO', reportFile: 'scenario_test_results.json', resetEach: true,
  files: ['database/schema.sql', 'database/seed.sql', 'analysis/dashboard_queries.sql',
    'database/fixtures/ds1_scenarios.json', 'database/fixtures/ds1_expected.json',
    'database/tests/helpers.mjs', 'database/tests/run-scenarios.mjs'],
});
