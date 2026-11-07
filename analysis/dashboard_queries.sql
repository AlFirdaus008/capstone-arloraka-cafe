-- Acuan query dashboard. Parameter $1/$2 = tanggal awal/akhir (inklusif),
-- $3 = freelancer_id atau NULL, $4 = source_dataset atau NULL.
-- Backend tetap membatasi cakupan freelancer berdasarkan akun yang sedang masuk.

-- name: summary
SELECT COUNT(*) AS reports_total,
       COUNT(*) FILTER (WHERE status = 'approved') AS approved_reports,
       COUNT(*) FILTER (WHERE status = 'pending') AS pending_reports,
       COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_reports,
       COUNT(*) FILTER (WHERE status = 'revision') AS revision_reports,
       COALESCE(SUM(total_bottles) FILTER (WHERE status = 'approved'), 0) AS approved_bottles,
       COALESCE(SUM(gross_amount) FILTER (WHERE status = 'approved'), 0) AS approved_gross,
       COALESCE(SUM(commission_amount) FILTER (WHERE status = 'approved'), 0) AS approved_commission,
       COALESCE(SUM(management_amount) FILTER (WHERE status = 'approved'), 0) AS approved_management
FROM arloraka.sales_reports
WHERE sale_date BETWEEN $1::DATE AND $2::DATE
  AND ($3::TEXT IS NULL OR freelancer_id = $3::TEXT)
  AND ($4::TEXT IS NULL OR source_dataset = $4::TEXT);

-- name: daily
WITH days AS (
    SELECT generate_series($1::DATE::TIMESTAMP, $2::DATE::TIMESTAMP, INTERVAL '1 day')::DATE AS sale_date
)
SELECT to_char(d.sale_date, 'YYYY-MM-DD') AS sale_date,
       COUNT(r.report_id) AS approved_reports,
       COALESCE(SUM(r.total_bottles), 0) AS approved_bottles,
       COALESCE(SUM(r.gross_amount), 0) AS approved_gross,
       COALESCE(SUM(r.commission_amount), 0) AS approved_commission,
       COALESCE(SUM(r.management_amount), 0) AS approved_management
FROM days d
LEFT JOIN arloraka.approved_reports r
  ON r.sale_date = d.sale_date
 AND ($3::TEXT IS NULL OR r.freelancer_id = $3::TEXT)
 AND ($4::TEXT IS NULL OR r.source_dataset = $4::TEXT)
GROUP BY d.sale_date ORDER BY d.sale_date;

-- name: monthly
SELECT to_char(sale_date, 'YYYY-MM') AS sale_month,
       COUNT(*) AS approved_reports, SUM(total_bottles) AS approved_bottles,
       SUM(gross_amount) AS approved_gross, SUM(commission_amount) AS approved_commission,
       SUM(management_amount) AS approved_management
FROM arloraka.approved_reports
WHERE sale_date BETWEEN $1::DATE AND $2::DATE
  AND ($3::TEXT IS NULL OR freelancer_id = $3::TEXT)
  AND ($4::TEXT IS NULL OR source_dataset = $4::TEXT)
GROUP BY to_char(sale_date, 'YYYY-MM') ORDER BY sale_month;

-- name: freelancers
WITH scoped AS (
    SELECT * FROM arloraka.approved_reports
    WHERE sale_date BETWEEN $1::DATE AND $2::DATE
      AND ($3::TEXT IS NULL OR freelancer_id = $3::TEXT)
      AND ($4::TEXT IS NULL OR source_dataset = $4::TEXT)
), grouped AS (
    SELECT f.freelancer_id, f.display_name,
           COUNT(r.report_id) AS approved_reports,
           COALESCE(SUM(r.total_bottles), 0) AS approved_bottles,
           COALESCE(SUM(r.gross_amount), 0) AS approved_gross,
           COALESCE(SUM(r.commission_amount), 0) AS approved_commission,
           COALESCE(SUM(r.management_amount), 0) AS approved_management
    FROM arloraka.freelancers f LEFT JOIN scoped r USING (freelancer_id)
    WHERE $3::TEXT IS NULL OR f.freelancer_id = $3::TEXT
    GROUP BY f.freelancer_id, f.display_name
)
SELECT *, ROUND(approved_gross * 100.0 / NULLIF(SUM(approved_gross) OVER (), 0), 2) AS contribution_percent
FROM grouped ORDER BY freelancer_id;

-- name: products
WITH scoped_items AS (
    SELECT i.* FROM arloraka.sales_report_items i
    JOIN arloraka.approved_reports r USING (report_id)
    WHERE r.sale_date BETWEEN $1::DATE AND $2::DATE
      AND ($3::TEXT IS NULL OR r.freelancer_id = $3::TEXT)
      AND ($4::TEXT IS NULL OR r.source_dataset = $4::TEXT)
)
SELECT p.product_code, p.product_name,
       COUNT(DISTINCT i.report_id) AS approved_reports_containing_product,
       COALESCE(SUM(i.quantity), 0) AS approved_bottles,
       COALESCE(SUM(i.subtotal), 0) AS approved_gross
FROM arloraka.products p LEFT JOIN scoped_items i USING (product_id)
GROUP BY p.product_code, p.product_name ORDER BY p.product_code;

-- name: statuses
WITH states(status) AS (VALUES ('approved'), ('pending'), ('rejected'), ('revision'))
SELECT s.status, COUNT(r.report_id) AS reports
FROM states s LEFT JOIN arloraka.sales_reports r
  ON r.status = s.status AND r.sale_date BETWEEN $1::DATE AND $2::DATE
 AND ($3::TEXT IS NULL OR r.freelancer_id = $3::TEXT)
 AND ($4::TEXT IS NULL OR r.source_dataset = $4::TEXT)
GROUP BY s.status ORDER BY s.status;

-- name: target
-- $5 adalah nilai target botol untuk cakupan/periode yang sama.
-- Target ini input acuan uji; schema inti belum memiliki tabel target.
WITH actual AS (
    SELECT COALESCE(SUM(total_bottles), 0) AS actual_bottles
    FROM arloraka.approved_reports
    WHERE sale_date BETWEEN $1::DATE AND $2::DATE
      AND ($3::TEXT IS NULL OR freelancer_id = $3::TEXT)
      AND ($4::TEXT IS NULL OR source_dataset = $4::TEXT)
)
SELECT actual_bottles, $5::NUMERIC AS target_bottles,
       CASE WHEN $5::NUMERIC IS NULL THEN 'not_set'
            WHEN $5::NUMERIC = 0 THEN 'zero_target'
            WHEN $5::NUMERIC < 0 THEN 'invalid_target'
            ELSE 'configured' END AS target_status,
       CASE WHEN $5::NUMERIC > 0 THEN ROUND(actual_bottles * 100.0 / $5::NUMERIC, 2)
            ELSE NULL END AS achievement_percent
FROM actual;
