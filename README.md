# Arloraka Coffee — Capstone Null Syndicate

Proyek Capstone Asah 2026 untuk membantu Arloraka Coffee mencatat laporan penjualan freelancer, memverifikasi laporan, dan memantau kontribusi serta komisi. Freelancer melihat laporan dan kontribusinya sendiri; manajemen memeriksa laporan dan memantau seluruh tim.

Repository ini berisi generator data dummy, assessment, dan fondasi database. Frontend, backend aplikasi, autentikasi, dan model AI belum tersedia pada versi awal ini.

## Isi repository

```text
arloraka-cafe-project/
├── Asessment.ipynb           # Audit kualitas, rekonsiliasi, dan kamus data
├── DataDummyCafe.ipynb       # Generator dataset sintetis
├── dummy-data/              # Sumber simulasi bersama: CSV dan Excel
├── database/
│   ├── README.md            # Pemetaan data dan panduan database
│   ├── schema.sql           # Struktur PostgreSQL
│   ├── seed.sql             # Import awal yang dapat dijalankan ulang
│   ├── verify.sql           # Pemeriksaan hasil import
│   ├── prepare_seed.py      # Pembentuk data relasional dan SQL seed
│   ├── column_mapping.csv   # Pemetaan 18 kolom sumber
│   ├── seed/                # Empat tabel data awal dalam CSV
│   ├── validation_report.json
│   └── test_results.json
├── requirements.txt
├── .env.example
└── CONTRIBUTING.md
```

## Menjalankan pekerjaan data

Lingkungan pemeriksaan menggunakan Python 3.12 dengan versi pustaka pada `requirements.txt`. Dari root repository, buat lingkungan Python lokal:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Buka `Asessment.ipynb` pada editor notebook/Jupyter yang digunakan tim, pilih Python dari `.venv`, lalu jalankan cell secara berurutan. Notebook akan mencari dataset pada `dummy-data`. Untuk Colab, unggah CSV ke `/content` atau isi `DATA_FILE` dengan lokasi dataset. Jupyter atau editor notebook dipasang terpisah; `requirements.txt` memuat pustaka analisisnya.

Mulai dari dataset yang sudah tersedia. `DataDummyCafe.ipynb` menyimpan seed 42 dan parameter generator untuk reproduksi atau pengujian tambahan. Jika generator dijalankan dari root proyek, ekspornya berada di root; salinan ekspor ini diabaikan Git. Periksa hasilnya sebelum memperbarui sumber bersama di `dummy-data`.

## Menyiapkan database

Rancangan memakai PostgreSQL dengan empat tabel: `freelancers`, `products`, `sales_reports`, dan `sales_report_items`. Baca [panduan pemetaan database](database/README.md) sebelum menjalankan SQL.

Urutan pengerjaan:

1. Siapkan database pengembangan dan isi variabel sesi `ARLORAKA_DATABASE_URL`.
2. Jalankan `database/schema.sql`.
3. Jalankan `database/seed.sql`.
4. Periksa hasil dengan `database/verify.sql`.

`.env.example` hanya template tanpa kredensial. File `.env` lokal diabaikan Git dan belum dimuat otomatis oleh skrip yang tersedia. Panduan SQL memakai variabel lingkungan pada sesi terminal.

Untuk membentuk ulang data relasional dan SQL dari sumber bersama:

```powershell
.\.venv\Scripts\python.exe database/prepare_seed.py
```

Proses ini memeriksa CSV sumber, membaca harga literal dari notebook generator, dan menulis hasil turunan ke folder `database`. Jika sumber atau skema berubah, jalankan kembali pemeriksaan yang terdampak. `test_results.json` mencatat pengujian versi awal; hasil tersebut tidak otomatis berlaku untuk perubahan berikutnya.

## Status awal dan angka kontrol

| Bagian | Status |
|---|---|
| Generator dan dataset simulasi | Tersedia |
| Assessment dan kamus data | Tersedia; 9 cell kode telah dijalankan berurutan |
| Pemetaan, struktur, dan seed database | Tersedia; 12 skenario pengujian database sementara lulus |
| Integrasi ke database/backend tim | Belum dikerjakan |
| Frontend, autentikasi, dan fitur pengguna | Belum tersedia |
| Model AI dan integrasinya | Belum tersedia |

| Kontrol dataset awal | Nilai |
|---|---:|
| Transaksi/laporan | 750 |
| Freelancer | 10 |
| Produk | 6 |
| Rincian produk positif | 1.681 |
| Laporan approved | 693 |
| Botol approved | 1.986 |
| Omzet approved | Rp27.776.000 |
| Jumlah nominal komisi approved | Rp2.777.600 |

Pengujian database menggunakan PostgreSQL 17.5 melalui PGlite di memori. Pengujian tersebut mencakup import ulang, harga historis, koreksi, status, validasi relasi, dan pembulatan. Database aplikasi tim, akses pengguna, pembayaran, dan penggunaan bersamaan pada server belum diuji.

## Aturan bisnis yang dipakai

- Satu transaksi sumber menjadi satu laporan. Revisi mempertahankan identitas laporan.
- Status sumber dipetakan menjadi `Verified → approved`, `Pending → pending`, dan `Rejected → rejected`. Aplikasi juga menyediakan `revision`.
- Kontribusi botol dan omzet hanya menghitung laporan approved.
- Komisi per laporan adalah 10% omzet, dibulatkan ke atas ke rupiah penuh. Bagian manajemen adalah sisanya dan belum menjadi laba setelah biaya.
- Harga saat transaksi tersimpan pada rincian laporan. Perubahan harga master tidak mengubah laporan lama.
- Estimasi, pengakuan akhir bulan, dan pembayaran komisi perlu dibedakan. Dataset ini tidak memuat bukti pembayaran.

Seluruh transaksi dan identitas freelancer pada dataset adalah dummy. Frekuensi penjualan, komposisi pembelian, status, dan pola waktu dipengaruhi asumsi generator. Hasilnya dipakai untuk pengembangan dan demonstrasi, tanpa klaim sebagai kondisi operasional nyata UMKM.

## Mulai berkolaborasi

Gunakan repository GitHub **private** sesuai ketentuan Capstone Playbook yang menjadi acuan proyek, lalu undang anggota tim sebagai collaborator. URL repository dan pengaturan akses ditentukan pemilik repository.

Branch utama adalah `main`. Kerjakan perubahan pada branch fitur, kemudian ajukan pull request. Panduan langkah dan isi perubahan yang perlu disertakan tersedia pada [CONTRIBUTING.md](CONTRIBUTING.md).

Tim dapat mulai dari pekerjaan berikut:

| Peran | Pekerjaan awal |
|---|---|
| DS-1 | Menjaga kualitas sumber, pemetaan, dan data uji |
| DS-2 | Mendefinisikan metrik/filter serta acuan hasil dashboard |
| Backend | Memasang schema/seed, menguji import, serta menyiapkan akun, API, dan hak akses |
| Frontend | Membuat alur laporan, verifikasi, dashboard, dan riwayat pengguna |
| AI Engineer | Menyelaraskan tugas model wajib dengan Playbook serta menyiapkan validasi dan integrasi terkait |

Simpan kredensial dan data operasional privat di lingkungan lokal yang sesuai. `.gitignore` mengecualikan konfigurasi rahasia, virtual environment, cache, unggahan privat, dan berkas sementara. Dataset dummy dan seed sengaja disertakan agar seluruh anggota memakai acuan awal yang sama.
