"""Siapkan seed relasional dari CSV awal; hanya memakai pustaka standar Python."""
import argparse
import ast
import csv
import hashlib
import json
from collections import Counter
from datetime import date
from pathlib import Path


SOURCE_DATASET = "dummy_sales_arloraka_coffee_750"
CATALOG = [
    ("PRD-001", "americano", "Americano"),
    ("PRD-002", "latte", "Latte"),
    ("PRD-003", "aren_latte", "Aren Latte"),
    ("PRD-004", "matcha_latte", "Matcha Latte"),
    ("PRD-005", "redvelvet_latte", "Redvelvet Latte"),
    ("PRD-006", "mocha_latte", "Mocha Latte"),
]
STATUS_MAP = {"Verified": "approved", "Pending": "pending", "Rejected": "rejected"}
LOCATIONS = {"Area Kampus", "Event Komunitas", "Area Perkantoran", "Car Free Day", "Acara Organisasi", "Penjualan Langsung"}
REPORT_COLUMNS = [
    "report_id", "source_dataset", "source_transaction_id", "freelancer_id", "sale_date",
    "status", "total_bottles", "gross_amount", "payment_method", "sale_location", "notes", "is_dummy",
]
ITEM_COLUMNS = ["report_id", "product_id", "product_name_at_sale", "quantity", "unit_price_at_sale"]
FREELANCER_COLUMNS = ["freelancer_id", "display_name", "is_active", "is_dummy"]
PRODUCT_COLUMNS = ["product_id", "product_code", "product_name", "current_price", "is_active"]


def get_generator_prices(generator):
    notebook = json.loads(generator.read_text(encoding="utf-8"))
    prices = None
    for cell in notebook["cells"]:
        if cell["cell_type"] != "code":
            continue
        try:
            tree = ast.parse("".join(cell["source"]))
        except SyntaxError:
            continue
        for statement in tree.body:
            if isinstance(statement, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id == "MENU_PRICES" for target in statement.targets
            ):
                value = ast.literal_eval(statement.value)
                if prices is not None and prices != value:
                    raise ValueError("Generator memiliki lebih dari satu definisi harga yang berbeda.")
                prices = value
    if prices is None or set(prices) != {code for _, code, _ in CATALOG}:
        raise ValueError("MENU_PRICES tidak sesuai enam produk yang dipetakan.")
    if any(isinstance(v, bool) or not isinstance(v, int) or v <= 0 for v in prices.values()):
        raise ValueError("Harga generator harus berupa rupiah bulat positif.")
    return prices


def integer(row, key, minimum=0):
    value = row[key]
    if not value or not value.isdecimal() or int(value) < minimum:
        raise ValueError(f"{row.get('transaction_id')}: {key} harus bilangan bulat >= {minimum}.")
    return int(value)


def sql_value(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, int):
        return str(value)
    if "\x00" in value:
        raise ValueError("Teks mengandung karakter NUL.")
    return "'" + value.replace("'", "''") + "'"


def sql_rows(rows, columns):
    return ",\n".join("(" + ", ".join(sql_value(row[c]) for c in columns) + ")" for row in rows)


def write_csv(path, rows, columns):
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def prepare(source, generator, destination):
    prices = get_generator_prices(generator)
    with source.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        raw_columns = reader.fieldnames
        source_rows = list(reader)
    if not source_rows:
        raise ValueError("Dataset kosong.")
    expected = {
        "transaction_id", "tanggal_jual", "freelancer_id", "nama_freelancer",
        *[f"{code}_qty" for _, code, _ in CATALOG], "total_botol", "omzet_penjualan",
        "komisi_freelancer", "pendapatan_manajemen", "metode_pembayaran", "lokasi_penjualan",
        "status_verifikasi", "keterangan",
    }
    if set(raw_columns) != expected or len(raw_columns) != len(expected):
        raise ValueError("Skema CSV berbeda dari 18 kolom dataset awal.")
    freelancer_names, reports, items, seen = {}, [], [], set()
    commission_differences = []
    status_counts = Counter()
    status_totals = {}
    for row in source_rows:
        report_id = row["transaction_id"]
        if not report_id or report_id != report_id.strip() or report_id in seen:
            raise ValueError(f"ID laporan kosong, tidak rapi, atau ganda: {report_id!r}")
        seen.add(report_id)
        freelancer_id, name = row["freelancer_id"], row["nama_freelancer"]
        if not freelancer_id.strip() or not name.strip():
            raise ValueError(f"Identitas freelancer kosong pada {report_id}.")
        if freelancer_id in freelancer_names and freelancer_names[freelancer_id] != name:
            raise ValueError(f"Nama tidak konsisten untuk {freelancer_id}.")
        freelancer_names[freelancer_id] = name
        sale_date = date.fromisoformat(row["tanggal_jual"]).isoformat()
        if not "2026-07-01" <= sale_date <= "2026-10-20":
            raise ValueError(f"Tanggal di luar periode seed awal: {report_id}.")
        if row["status_verifikasi"] not in STATUS_MAP:
            raise ValueError(f"Status tidak dikenal pada {report_id}.")
        if row["metode_pembayaran"] not in {"Cash", "QRIS", "Transfer"} or row["lokasi_penjualan"] not in LOCATIONS:
            raise ValueError(f"Pembayaran atau lokasi tidak dikenal pada {report_id}.")
        bottle_count, gross = 0, 0
        for product_id, code, product_name in CATALOG:
            quantity = integer(row, f"{code}_qty")
            bottle_count += quantity
            gross += quantity * prices[code]
            if quantity:
                items.append(dict(zip(ITEM_COLUMNS, [report_id, product_id, product_name, quantity, prices[code]])))
        if bottle_count != integer(row, "total_botol", 1) or gross != integer(row, "omzet_penjualan", 1):
            raise ValueError(f"Total botol/omzet berbeda dari rincian dan harga generator: {report_id}.")
        source_commission = integer(row, "komisi_freelancer")
        if source_commission + integer(row, "pendapatan_manajemen") != gross:
            raise ValueError(f"Pembagian sumber tidak sama dengan omzet: {report_id}.")
        commission = (gross + 9) // 10
        if commission != source_commission:
            commission_differences.append({"report_id": report_id, "source_commission": source_commission, "spec_commission": commission})
        notes = None if row["keterangan"].strip() in ("", "-") else row["keterangan"]
        status = STATUS_MAP[row["status_verifikasi"]]
        reports.append(dict(zip(REPORT_COLUMNS, [
            report_id, SOURCE_DATASET, report_id, freelancer_id, sale_date, status,
            bottle_count, gross, row["metode_pembayaran"], row["lokasi_penjualan"], notes, True,
        ])))
        status_counts[status] += 1
        totals = status_totals.setdefault(status, dict(reports=0, bottles=0, gross_amount=0, commission_amount=0, management_amount=0))
        for key, value in dict(reports=1, bottles=bottle_count, gross_amount=gross, commission_amount=commission, management_amount=gross-commission).items():
            totals[key] += value

    freelancers = [dict(zip(FREELANCER_COLUMNS, [key, name, True, True])) for key, name in sorted(freelancer_names.items())]
    products = [dict(zip(PRODUCT_COLUMNS, [key, code, name, prices[code], True])) for key, code, name in CATALOG]
    reports.sort(key=lambda row: row["report_id"])
    items.sort(key=lambda row: (row["report_id"], row["product_id"]))
    if len({(row["report_id"], row["product_id"]) for row in items}) != len(items):
        raise ValueError("Pasangan laporan-produk ganda.")
    seed_dir = destination / "seed"
    seed_dir.mkdir(parents=True, exist_ok=True)
    tables = {
        "freelancers": (freelancers, FREELANCER_COLUMNS, "freelancer_id TEXT, display_name TEXT, is_active BOOLEAN, is_dummy BOOLEAN"),
        "products": (products, PRODUCT_COLUMNS, "product_id TEXT, product_code TEXT, product_name TEXT, current_price BIGINT, is_active BOOLEAN"),
        "sales_reports": (reports, REPORT_COLUMNS,
            "report_id TEXT, source_dataset TEXT, source_transaction_id TEXT, freelancer_id TEXT, sale_date DATE, status TEXT, total_bottles INTEGER, gross_amount BIGINT, payment_method TEXT, sale_location TEXT, notes TEXT, is_dummy BOOLEAN"),
        "sales_report_items": (items, ITEM_COLUMNS,
            "report_id TEXT, product_id TEXT, product_name_at_sale TEXT, quantity INTEGER, unit_price_at_sale BIGINT"),
    }
    parts = ["-- Dibuat oleh prepare_seed.py dari dataset simulasi; tidak memuat akun atau kredensial.\nBEGIN;\nSET LOCAL standard_conforming_strings = on;"]
    for table, (rows, columns, declaration) in tables.items():
        write_csv(seed_dir / f"{table}.csv", rows, columns)
        parts.append(f"CREATE TEMP TABLE _arloraka_seed_{table} ({declaration}) ON COMMIT DROP;\n"
                     f"INSERT INTO _arloraka_seed_{table} ({', '.join(columns)}) VALUES\n{sql_rows(rows, columns)};")
    parts.append("""
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM _arloraka_seed_products s JOIN arloraka.products p USING (product_id)
        WHERE p.product_code <> s.product_code
    ) THEN RAISE EXCEPTION 'ID produk sudah dipakai untuk kode produk berbeda. Periksa pemetaan.'; END IF;
    IF EXISTS (
        SELECT 1 FROM _arloraka_seed_sales_reports s JOIN arloraka.sales_reports r USING (report_id)
        WHERE r.source_dataset IS DISTINCT FROM s.source_dataset
           OR r.source_transaction_id IS DISTINCT FROM s.source_transaction_id
    ) THEN RAISE EXCEPTION 'ID laporan sudah dipakai sumber berbeda. Import dibatalkan.'; END IF;
END; $$;
""")
    for table, columns, key in [
        ("freelancers", FREELANCER_COLUMNS, "freelancer_id"),
        ("products", PRODUCT_COLUMNS, "product_id"),
    ]:
        columns_sql = ", ".join(columns)
        parts.append(f"INSERT INTO arloraka.{table} ({columns_sql}) SELECT {columns_sql} FROM _arloraka_seed_{table}\nON CONFLICT ({key}) DO NOTHING;")
    report_cols = ", ".join(REPORT_COLUMNS)
    item_cols = ", ".join(ITEM_COLUMNS)
    parts.append(f"""
CREATE TEMP TABLE _arloraka_seed_inserted_reports (report_id TEXT PRIMARY KEY) ON COMMIT DROP;
WITH inserted AS (
    INSERT INTO arloraka.sales_reports ({report_cols})
    SELECT {report_cols} FROM _arloraka_seed_sales_reports
    ON CONFLICT (source_dataset, source_transaction_id) DO NOTHING
    RETURNING report_id
)
INSERT INTO _arloraka_seed_inserted_reports SELECT report_id FROM inserted;

-- Rincian hanya diisi untuk header yang benar-benar baru pada import ini.
INSERT INTO arloraka.sales_report_items ({item_cols})
SELECT {', '.join('s.' + col for col in ITEM_COLUMNS)}
FROM _arloraka_seed_sales_report_items s
JOIN _arloraka_seed_inserted_reports n ON n.report_id = s.report_id;

SET CONSTRAINTS ALL IMMEDIATE;
SELECT COUNT(*) AS newly_inserted_reports FROM _arloraka_seed_inserted_reports;
COMMIT;
""")
    (destination / "seed.sql").write_text("\n\n".join(parts) + "\n", encoding="utf-8")

    mappings = [
        ("transaction_id", "sales_reports", "report_id; source_transaction_id", "Salin ID asal; source_dataset diisi nama seed", "Report ID unik; pasangan sumber dan ID asal unik"),
        ("tanggal_jual", "sales_reports", "sale_date", "Ubah ISO YYYY-MM-DD ke DATE", "Tanggal valid pada periode seed"),
        ("freelancer_id", "freelancers; sales_reports", "freelancer_id", "Satu master per ID; laporan merujuk ID yang sama", "FK wajib menemukan master"),
        ("nama_freelancer", "freelancers", "display_name", "Ambil satu nama per freelancer_id", "Tidak kosong dan tidak bertentangan untuk ID sama"),
    ]
    mappings += [(f"{code}_qty", "sales_report_items", "product_id; quantity; unit_price_at_sale; product_name_at_sale", f"{pid} ({name}); buat rincian hanya jika qty > 0; harga dari MENU_PRICES[{code}]", "Kuantitas bulat positif pada rincian; pasangan report_id/product_id unik") for pid, code, name in CATALOG]
    mappings += [
        ("total_botol", "sales_reports", "total_bottles", "Cocokkan dengan jumlah quantity rincian", "Sama per laporan; diperiksa saat COMMIT"),
        ("omzet_penjualan", "sales_reports", "gross_amount", "Cocokkan dengan jumlah quantity × unit_price_at_sale", "Sama per laporan; diperiksa saat COMMIT"),
        ("komisi_freelancer", "sales_reports", "commission_amount", "Bandingkan sumber; database menghitung ceil 10% per laporan", "Generated; jangan kirim nilai saat INSERT; bukan bukti pengakuan/pembayaran"),
        ("pendapatan_manajemen", "sales_reports", "management_amount", "Bandingkan sumber; database menghitung omzet dikurangi komisi", "Generated; biaya usaha belum diperhitungkan"),
        ("metode_pembayaran", "sales_reports", "payment_method", "Salin Cash/QRIS/Transfer", "CHECK nilai yang diperbolehkan"),
        ("lokasi_penjualan", "sales_reports", "sale_location", "Salin kategori lokasi", "Enam lokasi seed; database menerima teks berisi untuk lokasi baru"),
        ("status_verifikasi", "sales_reports", "status", "Verified→approved; Pending→pending; Rejected→rejected", "revision disediakan untuk alur aplikasi"),
        ("keterangan", "sales_reports", "notes", "Teks disalin; kosong atau tanda - diubah menjadi NULL", "Opsional; bukan alasan keputusan verifikasi"),
    ]
    assert {row[0] for row in mappings} == expected
    write_csv(destination / "column_mapping.csv", [dict(zip(
        ["source_column", "target_table", "target_columns", "transformation", "validation"], row
    )) for row in mappings], ["source_column", "target_table", "target_columns", "transformation", "validation"])
    manifest = {
        "dataset_kind": "dummy", "source_dataset": SOURCE_DATASET,
        "source_csv_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "generator_sha256": hashlib.sha256(generator.read_bytes()).hexdigest(),
        "price_source": "DataDummyCafe.ipynb / MENU_PRICES (dibaca sebagai literal, tanpa menjalankan generator)",
        "source_columns": len(raw_columns), "mapped_source_columns": len(mappings),
        "row_counts": {key: len(value[0]) for key, value in tables.items()},
        "all_bottles": sum(row["total_bottles"] for row in reports),
        "all_gross_amount": sum(row["gross_amount"] for row in reports),
        "status_controls": status_totals, "commission_differences": commission_differences,
        "source_csv_modified": False,
    }
    (destination / "validation_report.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=root.parent / "dummy-data" / f"{SOURCE_DATASET}.csv")
    parser.add_argument("--generator", type=Path, default=root.parent / "DataDummyCafe.ipynb")
    args = parser.parse_args()
    prepare(args.source, args.generator, root)
