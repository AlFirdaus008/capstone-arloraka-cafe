-- Struktur inti transaksi Arloraka Coffee. Seluruh nominal dalam rupiah bulat.
-- Jalankan pada database pengembangan yang dituju, sebelum seed.sql.
BEGIN;
CREATE SCHEMA IF NOT EXISTS arloraka;

CREATE TABLE IF NOT EXISTS arloraka.freelancers (
    freelancer_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL CHECK (length(btrim(display_name)) > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_dummy BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS arloraka.products (
    product_id TEXT PRIMARY KEY,
    product_code TEXT NOT NULL UNIQUE,
    product_name TEXT NOT NULL CHECK (length(btrim(product_name)) > 0),
    current_price BIGINT NOT NULL CHECK (current_price > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS arloraka.sales_reports (
    report_id TEXT PRIMARY KEY,
    source_dataset TEXT,
    source_transaction_id TEXT,
    freelancer_id TEXT NOT NULL REFERENCES arloraka.freelancers(freelancer_id) ON DELETE RESTRICT,
    sale_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'revision')),
    total_bottles INTEGER NOT NULL CHECK (total_bottles > 0),
    gross_amount BIGINT NOT NULL CHECK (gross_amount > 0),
    commission_rule_version TEXT NOT NULL DEFAULT 'commission_10pct_ceil_v1'
        CHECK (commission_rule_version = 'commission_10pct_ceil_v1'),
    -- Pembagian integer mencegah galat floating point dan pembulatan total bulanan.
    commission_amount BIGINT GENERATED ALWAYS AS
        (gross_amount / 10 + CASE WHEN gross_amount % 10 = 0 THEN 0 ELSE 1 END) STORED,
    management_amount BIGINT GENERATED ALWAYS AS
        (gross_amount - (gross_amount / 10 + CASE WHEN gross_amount % 10 = 0 THEN 0 ELSE 1 END)) STORED,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'QRIS', 'Transfer')),
    sale_location TEXT NOT NULL CHECK (length(btrim(sale_location)) > 0),
    notes TEXT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    is_dummy BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source_dataset, source_transaction_id),
    CHECK ((source_dataset IS NULL) = (source_transaction_id IS NULL))
);

CREATE TABLE IF NOT EXISTS arloraka.sales_report_items (
    report_id TEXT NOT NULL REFERENCES arloraka.sales_reports(report_id) ON DELETE RESTRICT,
    product_id TEXT NOT NULL REFERENCES arloraka.products(product_id) ON DELETE RESTRICT,
    product_name_at_sale TEXT NOT NULL CHECK (length(btrim(product_name_at_sale)) > 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_at_sale BIGINT NOT NULL CHECK (unit_price_at_sale > 0),
    subtotal BIGINT GENERATED ALWAYS AS (quantity::BIGINT * unit_price_at_sale) STORED,
    PRIMARY KEY (report_id, product_id)
);

CREATE INDEX IF NOT EXISTS reports_freelancer_date_idx
    ON arloraka.sales_reports(freelancer_id, sale_date);
CREATE INDEX IF NOT EXISTS reports_status_date_idx
    ON arloraka.sales_reports(status, sale_date);

-- Perubahan laporan dan rincian diselesaikan dalam satu transaksi.
-- Pemeriksaan jumlah ditunda sampai COMMIT agar header dan rincian dapat diubah bersama.
CREATE OR REPLACE FUNCTION arloraka.assert_report_totals(p_report_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    report_bottles INTEGER;
    report_gross BIGINT;
    item_bottles BIGINT;
    item_gross NUMERIC;
BEGIN
    SELECT total_bottles, gross_amount INTO report_bottles, report_gross
    FROM arloraka.sales_reports WHERE report_id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(subtotal), 0)
        INTO item_bottles, item_gross
    FROM arloraka.sales_report_items WHERE report_id = p_report_id;
    IF report_bottles <> item_bottles OR report_gross <> item_gross THEN
        RAISE EXCEPTION 'Laporan % tidak cocok dengan rincian: botol % vs %, omzet % vs %',
            p_report_id, report_bottles, item_bottles, report_gross, item_gross;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION arloraka.check_report_totals()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME = 'sales_reports' THEN
        PERFORM arloraka.assert_report_totals(NEW.report_id);
    ELSE
        IF TG_OP IN ('UPDATE', 'DELETE') THEN
            PERFORM arloraka.assert_report_totals(OLD.report_id);
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
            PERFORM arloraka.assert_report_totals(NEW.report_id);
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS report_totals_check ON arloraka.sales_reports;
CREATE CONSTRAINT TRIGGER report_totals_check
    AFTER INSERT OR UPDATE ON arloraka.sales_reports
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION arloraka.check_report_totals();

DROP TRIGGER IF EXISTS report_item_totals_check ON arloraka.sales_report_items;
CREATE CONSTRAINT TRIGGER report_item_totals_check
    AFTER INSERT OR UPDATE OR DELETE ON arloraka.sales_report_items
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION arloraka.check_report_totals();

CREATE OR REPLACE VIEW arloraka.approved_reports AS
SELECT report_id, freelancer_id, sale_date, total_bottles, gross_amount,
       commission_amount, management_amount, is_dummy, source_dataset
FROM arloraka.sales_reports WHERE status = 'approved';

CREATE OR REPLACE VIEW arloraka.report_reconciliation AS
SELECT r.report_id, r.total_bottles, r.gross_amount,
       COALESCE(SUM(i.quantity), 0) AS item_bottles,
       COALESCE(SUM(i.subtotal), 0) AS item_gross,
       r.total_bottles - COALESCE(SUM(i.quantity), 0) AS bottle_difference,
       r.gross_amount - COALESCE(SUM(i.subtotal), 0) AS gross_difference
FROM arloraka.sales_reports r
LEFT JOIN arloraka.sales_report_items i ON i.report_id = r.report_id
GROUP BY r.report_id, r.total_bottles, r.gross_amount;
COMMIT;
