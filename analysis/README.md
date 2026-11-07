# Acuan hasil dashboard untuk DS-1, DS-2, dan backend

Folder ini menyediakan angka pembanding yang dihitung langsung dari CSV sumber. `build_reference.py` membaca CSV mentah dan harga literal dari notebook generator. Program tidak membaca seed SQL, CSV hasil normalisasi, atau hasil query database. Dengan demikian, hasilnya dapat dibandingkan dengan query pada `dashboard_queries.sql` melalui jalur perhitungan yang berbeda.

Seluruh angka adalah simulasi Arloraka Coffee. Acuan ini disiapkan untuk ditinjau bersama Athallah (DS-2) dan digunakan backend saat integrasi; persetujuan metrik oleh anggota tim belum tercatat dalam repository.

## Isi folder

| Berkas | Isi |
|---|---|
| `build_reference.py` | Membentuk ulang acuan dari sumber dengan pustaka standar Python |
| `dashboard_queries.sql` | Tujuh query berparameter untuk ringkasan, tren, freelancer, produk, status, dan target botol |
| `reference/dashboard_reference.json` | Ringkasan, seluruh tabel acuan, delapan kasus filter, batas periode, dan sidik sumber |
| `reference/approved_daily.csv` | 112 tanggal pada rentang seed, termasuk nol bila tidak ada laporan approved |
| `reference/approved_monthly.csv` | Rekap approved per bulan penjualan |
| `reference/approved_by_freelancer.csv` | Kontribusi sepuluh freelancer berdasarkan ID |
| `reference/approved_by_product.csv` | Botol dan omzet produk menurut harga transaksi |
| `reference/reports_by_status.csv` | Jumlah laporan untuk approved, pending, rejected, dan revision |

Dari root proyek, jalankan:

```powershell
python analysis/build_reference.py
npm --prefix database ci
npm --prefix database run test:reference
```

Untuk menjalankan seluruh suite dan memperbarui tiga laporan pengujian:

```powershell
npm --prefix database run test:all:report
```

Perubahan CSV/generator perlu ditinjau, dilanjutkan pembaruan seed dengan `python database/prepare_seed.py`, kemudian pembentukan acuan. Pengujian menolak acuan dengan sidik CSV/generator yang sudah berubah. Jangan memperbarui angka harapan hanya untuk membuat tes lulus tanpa menjelaskan perubahan sumber atau aturan bisnis.

## Arti metrik

| Metrik | Dasar hitung |
|---|---|
| `reports_total` | Seluruh laporan pada filter, termasuk status non-approved |
| `approved_reports` | Jumlah laporan approved, dihitung pada tabel header |
| `pending_reports`, `rejected_reports`, `revision_reports` | Jumlah laporan masing-masing status pada filter yang sama |
| `approved_bottles` | Jumlah botol dari laporan approved |
| `approved_gross` | Jumlah omzet laporan approved |
| `approved_commission` | Jumlah komisi per laporan approved setelah pembulatan ke atas |
| `approved_management` | Jumlah sisa omzet setelah komisi, sebelum biaya usaha |
| `contribution_percent` | Omzet approved freelancer dibagi total omzet approved dalam cakupan tabel, dikali 100 |
| `approved_reports_containing_product` | Jumlah laporan approved yang memuat suatu produk; satu laporan dapat muncul pada beberapa produk |

Seluruh nominal dalam rupiah bulat. Persentase kontribusi dibulatkan dua desimal; total persentase yang sudah dibulatkan dapat berbeda tipis dari 100%. Jika total omzet pada cakupan kosong, persentase tidak tersedia (`null`), bukan nol yang dibuat sebagai pengganti pembagian tidak valid.

Acuan ini mendukung pertanyaan tentang kontribusi approved setiap freelancer, botol/omzet per produk, tren menurut tanggal penjualan, dan jumlah laporan yang masih menunggu keputusan. Sebagai contoh pada simulasi awal, FL-001 (Andi) memiliki omzet approved Rp4.162.000 atau 14,98% dari total Rp27.776.000. Angka ini dapat dipakai untuk mencocokkan tabel dan kartu kontribusi; peringkatnya dipengaruhi bobot generator dan belum menjadi penilaian performa freelancer nyata.

Hitung jumlah laporan pada tabel header. Menggabungkan header dan rincian sebelum menjumlahkan omzet dapat menghitung laporan beberapa kali. Rekap produk menjumlahkan subtotal rincian berdasarkan harga transaksi; harga master terbaru tidak dipakai untuk menghitung ulang penjualan lama. Jumlah laporan per produk juga tidak boleh dijumlahkan untuk memperoleh jumlah laporan unik seluruh tim.

## Filter query

Query diberi penanda `-- name: ...` agar skrip uji dan backend dapat menelusuri sumber SQL yang sama.

| Parameter | Makna |
|---|---|
| `$1` | Tanggal awal inklusif, tipe DATE |
| `$2` | Tanggal akhir inklusif, tipe DATE |
| `$3` | ID freelancer atau NULL untuk seluruh cakupan yang diizinkan |
| `$4` | Nama sumber dataset atau NULL; pengujian baseline memakai `dummy_sales_arloraka_coffee_750` |
| `$5` | Khusus query target: nilai target botol untuk periode dan cakupan yang sama |

Backend perlu memvalidasi rentang tanggal dan menentukan cakupan berdasarkan akun yang sedang masuk. Filter ID pada query ini belum menjadi mekanisme otorisasi. Freelancer yang memilih ID orang lain melalui request tidak boleh otomatis mendapat akses ke datanya.

Query harian membentuk kalender pada rentang filter dan mengisi nol untuk jumlah laporan approved yang tidak tersedia. Query bulanan menampilkan bulan yang memiliki laporan approved. Data referensi hanya mencakup 1 Juli–20 Oktober 2026; nol di luar rentang sumber berarti tidak ada laporan yang cocok pada dataset yang diberikan dan belum membuktikan tidak ada penjualan operasional.

Oktober berhenti pada tanggal 20. Batas tersebut disimpan pada `monthly_coverage` di JSON, dengan `complete_calendar_month = false`. Total Oktober tidak langsung sebanding dengan bulan penuh. Gunakan periode setara atau metrik harian yang disepakati DS-2 bila membutuhkan perbandingan.

## Komisi bulanan dan target

Periode komisi mengikuti `sale_date`. Rekap menjumlahkan nominal per laporan approved tanpa pembulatan ulang pada total bulanan. Dua laporan Rp15.005 menghasilkan komisi Rp1.501 masing-masing, sehingga jumlahnya Rp3.002. Pembulatan satu kali dari total omzet Rp30.010 akan menghasilkan angka yang berbeda.

Rekap ini belum menjadi bukti pengakuan atau pembayaran komisi aktual. Schema inti tidak menyimpan waktu keputusan dan proses pengakuan akhir bulan. Kasus persetujuan terlambat hanya membuktikan bahwa query memasukkan nominal ke bulan penjualan ketika status terkini menjadi approved.

Query target memakai satuan botol. Nilai target belum disimpan pada tabel aplikasi dan diberikan sebagai input acuan pengujian. Target belum ditetapkan menghasilkan `target_status = not_set`; target nol menghasilkan `zero_target`. Keduanya memiliki `achievement_percent = null`. Target positif dihitung dari botol approved pada cakupan yang sama, dan pencapaian di atas 100% tetap ditampilkan. Nama status ini adalah rancangan respons acuan yang perlu diselaraskan dengan DS-2/backend.

## Penyerahan ke tim

Athallah dapat memakai CSV dan definisi metrik ini untuk memilih isi dashboard serta memeriksa maknanya. Kevin dapat menjalankan query dengan parameter yang disepakati dan mencocokkan respons API dengan `filter_cases` di JSON. Gunakan identitas sumber dan snapshot harga yang sudah dipetakan pada folder `database`.

Setelah backend tersedia, simpan contoh request, respons aktual, hasil pencocokan, dan perbaikan yang dilakukan. Sampai tahap tersebut dijalankan, bukti pada folder ini berlaku untuk perhitungan sumber dan query SQL di database sementara.
