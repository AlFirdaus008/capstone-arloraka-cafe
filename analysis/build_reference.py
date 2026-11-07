"""Hitung acuan dashboard langsung dari CSV sumber, tanpa membaca seed SQL/database."""
import ast
import calendar
import csv
import hashlib
import json
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "dummy-data" / "dummy_sales_arloraka_coffee_750.csv"
GENERATOR = ROOT / "DataDummyCafe.ipynb"
OUTPUT = ROOT / "analysis" / "reference"
PRODUCTS = {
    "americano": "Americano", "latte": "Latte", "aren_latte": "Aren Latte",
    "matcha_latte": "Matcha Latte", "redvelvet_latte": "Redvelvet Latte", "mocha_latte": "Mocha Latte",
}
STATUSES = {"Verified": "approved", "Pending": "pending", "Rejected": "rejected"}
METRICS = ["approved_reports", "approved_bottles", "approved_gross", "approved_commission", "approved_management"]


def prices_from_generator():
    values = []
    document = json.loads(GENERATOR.read_text(encoding="utf-8"))
    for cell in document["cells"]:
        if cell["cell_type"] != "code":
            continue
        try:
            statements = ast.parse("".join(cell["source"])).body
        except SyntaxError:
            continue
        for statement in statements:
            if isinstance(statement, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "MENU_PRICES" for t in statement.targets):
                values.append(ast.literal_eval(statement.value))
    if len(values) != 1 or set(values[0]) != set(PRODUCTS):
        raise ValueError("Definisi harga generator perlu diperiksa.")
    return values[0]


def totals(rows):
    approved = [row for row in rows if row["status"] == "approved"]
    return {
        "reports_total": len(rows),
        **{f"{status}_reports": sum(row["status"] == status for row in rows)
           for status in ["approved", "pending", "rejected", "revision"]},
        "approved_bottles": sum(row["bottles"] for row in approved),
        "approved_gross": sum(row["gross"] for row in approved),
        "approved_commission": sum(row["commission"] for row in approved),
        "approved_management": sum(row["gross"] - row["commission"] for row in approved),
    }


def approved_metrics(rows):
    summary = totals(rows)
    return {key: summary[key] for key in METRICS}


def save_csv(name, rows):
    with (OUTPUT / name).open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main():
    prices = prices_from_generator()
    with SOURCE.open(encoding="utf-8-sig", newline="") as handle:
        raw = list(csv.DictReader(handle))
    rows, seen, names = [], set(), {}
    for row in raw:
        identifier = row["transaction_id"]
        if identifier in seen:
            raise ValueError(f"ID sumber ganda: {identifier}")
        seen.add(identifier)
        quantities = {code: int(row[f"{code}_qty"]) for code in PRODUCTS}
        if any(value < 0 for value in quantities.values()):
            raise ValueError(f"Kuantitas negatif: {identifier}")
        gross = sum(quantities[code] * prices[code] for code in PRODUCTS)
        bottles = sum(quantities.values())
        if gross != int(row["omzet_penjualan"]) or bottles != int(row["total_botol"]):
            raise ValueError(f"Nominal/jumlah sumber tidak sesuai rincian: {identifier}")
        freelancer = row["freelancer_id"]
        if freelancer in names and names[freelancer] != row["nama_freelancer"]:
            raise ValueError(f"Nama tidak konsisten: {freelancer}")
        names[freelancer] = row["nama_freelancer"]
        rows.append({"id": identifier, "date": date.fromisoformat(row["tanggal_jual"]),
                     "freelancer_id": freelancer, "status": STATUSES[row["status_verifikasi"]],
                     "bottles": bottles, "gross": gross, "commission": (gross + 9) // 10,
                     "quantities": quantities})
    if not rows:
        raise ValueError("Dataset sumber kosong.")
    first, last = min(row["date"] for row in rows), max(row["date"] for row in rows)
    summary = totals(rows)
    by_date, by_month, by_freelancer = defaultdict(list), defaultdict(list), defaultdict(list)
    for row in rows:
        by_date[row["date"]].append(row)
        by_month[row["date"].strftime("%Y-%m")].append(row)
        by_freelancer[row["freelancer_id"]].append(row)
    daily = []
    day = first
    while day <= last:
        daily.append({"sale_date": day.isoformat(), **approved_metrics(by_date[day])})
        day += timedelta(days=1)
    monthly = [{"sale_month": month, **approved_metrics(by_month[month])} for month in sorted(by_month)]
    freelancers = []
    for identifier in sorted(names):
        metrics = approved_metrics(by_freelancer[identifier])
        share = (float((Decimal(metrics["approved_gross"]) * 100 / Decimal(summary["approved_gross"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
                 if summary["approved_gross"] else None)
        freelancers.append({"freelancer_id": identifier, "display_name": names[identifier],
                            **metrics, "contribution_percent": share})
    products = []
    for code in sorted(PRODUCTS):
        selected = [row for row in rows if row["status"] == "approved" and row["quantities"][code] > 0]
        bottles = sum(row["quantities"][code] for row in selected)
        products.append({"product_code": code, "product_name": PRODUCTS[code],
                         "approved_reports_containing_product": len(selected),
                         "approved_bottles": bottles, "approved_gross": bottles * prices[code]})
    statuses = [{"status": status, "reports": summary[f"{status}_reports"]}
                for status in ["approved", "pending", "rejected", "revision"]]
    filters = [
        ("all_period", first.isoformat(), last.isoformat(), None),
        ("july", "2026-07-01", "2026-07-31", None),
        ("october_partial", "2026-10-01", "2026-10-20", None),
        ("first_day", first.isoformat(), first.isoformat(), None),
        ("freelancer_fl001", first.isoformat(), last.isoformat(), "FL-001"),
        ("freelancer_fl001_july", "2026-07-01", "2026-07-31", "FL-001"),
        ("empty_period", "2026-11-01", "2026-11-03", None),
    ]
    pairs = defaultdict(list)
    for row in rows:
        pairs[(row["date"], row["freelancer_id"])].append(row)
    pending_scope = next((key for key in sorted(pairs)
                          if any(row["status"] == "pending" for row in pairs[key])
                          and not any(row["status"] == "approved" for row in pairs[key])), None)
    if pending_scope is None:
        raise ValueError("Kasus cakupan Pending tanpa Approved tidak tersedia pada sumber.")
    filters.append(("pending_only_scope", pending_scope[0].isoformat(), pending_scope[0].isoformat(), pending_scope[1]))
    filter_cases = []
    for name, start, end, freelancer in filters:
        selected = [row for row in rows if start <= row["date"].isoformat() <= end
                    and (freelancer is None or row["freelancer_id"] == freelancer)]
        filter_cases.append({"id": name, "start_date": start, "end_date": end,
                             "freelancer_id": freelancer, "expected": totals(selected),
                             "within_source_period": first.isoformat() <= start <= end <= last.isoformat()})
    coverage = {}
    for month in sorted(by_month):
        year, number = map(int, month.split("-"))
        start, end = date(year, number, 1), date(year, number, calendar.monthrange(year, number)[1])
        coverage[month] = {"period_start": max(first, start).isoformat(), "period_end": min(last, end).isoformat(),
                           "complete_calendar_month": first <= start and last >= end}
    document = {
        "dataset_kind": "dummy", "source_dataset": SOURCE.stem,
        "source_csv_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "generator_sha256": hashlib.sha256(GENERATOR.read_bytes()).hexdigest(),
        "method": "CSV mentah + harga literal generator; tidak membaca seed SQL, hasil query, atau CSV database.",
        "period_start": first.isoformat(), "period_end": last.isoformat(),
        "monthly_coverage": coverage, "summary": summary, "daily": daily, "monthly": monthly,
        "freelancers": freelancers, "products": products, "statuses": statuses, "filter_cases": filter_cases,
    }
    assert sum(row["approved_gross"] for row in products) == summary["approved_gross"]
    assert sum(row["approved_gross"] for row in daily) == summary["approved_gross"]
    assert sum(row["approved_commission"] for row in monthly) == summary["approved_commission"]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, table in [("approved_daily.csv", daily), ("approved_monthly.csv", monthly),
                        ("approved_by_freelancer.csv", freelancers), ("approved_by_product.csv", products),
                        ("reports_by_status.csv", statuses)]:
        save_csv(name, table)
    (OUTPUT / "dashboard_reference.json").write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"summary": summary, "daily_rows": len(daily), "monthly_rows": len(monthly),
                      "freelancer_rows": len(freelancers), "product_rows": len(products),
                      "filter_cases": len(filter_cases)}, indent=2))


if __name__ == "__main__":
    main()
