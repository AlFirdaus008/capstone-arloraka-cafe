-- Kontrol untuk seed awal. Koreksi resmi dapat mengubah angka acuan awal.
SELECT 'freelancers' AS entity, COUNT(*) AS row_count FROM arloraka.freelancers
UNION ALL SELECT 'products', COUNT(*) FROM arloraka.products
UNION ALL SELECT 'sales_reports', COUNT(*) FROM arloraka.sales_reports
UNION ALL SELECT 'sales_report_items', COUNT(*) FROM arloraka.sales_report_items;

SELECT status, COUNT(*) AS reports, SUM(total_bottles) AS bottles,
       SUM(gross_amount) AS gross_amount, SUM(commission_amount) AS commission_amount,
       SUM(management_amount) AS management_amount
FROM arloraka.sales_reports
WHERE source_dataset = 'dummy_sales_arloraka_coffee_750'
GROUP BY status ORDER BY status;

-- Hasil harus kosong, termasuk setelah koreksi resmi.
SELECT * FROM arloraka.report_reconciliation
WHERE bottle_difference <> 0 OR gross_difference <> 0;

-- Rekap bulanan berdasarkan tanggal penjualan, hanya approved.
-- Nominal ini belum membuktikan pengakuan atau pembayaran komisi.
SELECT date_trunc('month', sale_date::TIMESTAMP)::DATE AS sale_month,
       COUNT(*) AS reports, SUM(gross_amount) AS gross_amount,
       SUM(commission_amount) AS commission_amount
FROM arloraka.approved_reports
WHERE source_dataset = 'dummy_sales_arloraka_coffee_750'
GROUP BY sale_month ORDER BY sale_month;

SELECT freelancer_id, COUNT(*) AS reports, SUM(total_bottles) AS bottles,
       SUM(gross_amount) AS gross_amount, SUM(commission_amount) AS commission_amount
FROM arloraka.approved_reports
WHERE source_dataset = 'dummy_sales_arloraka_coffee_750'
GROUP BY freelancer_id ORDER BY gross_amount DESC;
