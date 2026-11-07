# Skenario uji dan hasil yang diharapkan

Dokumen ini melengkapi assessment dan pemetaan DS-1. Dua belas skenario pertama memakai seed 750 laporan. Sembilan skenario berikutnya memakai fixture tambahan berlabel dummy pada `database/fixtures/ds1_scenarios.json`, dengan angka harapan terpisah pada `ds1_expected.json`.

Data tambahan tidak dimasukkan ke CSV/Excel sumber, `database/seed`, atau `seed.sql`. Skrip memasukkannya hanya ke PostgreSQL sementara untuk pengujian. Setiap skenario dimulai dengan seed awal yang bersih, lalu memuat grup fixture yang dibutuhkan.

## Tabel skenario

| ID | Skenario dan langkah | Hasil yang diharapkan | Bukti otomatis |
|---|---|---|---|
| DS1-01 | Import schema dan seed awal | 10 freelancer, 6 produk, 750 laporan, 1.681 rincian; 693 approved, 1.986 botol, omzet approved Rp27.776.000 | Suite inti 1 |
| DS1-02 | Jalankan schema dan seed kembali | Jumlah record dan kontribusi tetap; identitas sumber tidak ganda | Suite inti 2 |
| DS1-03 | Ubah harga/nama master Americano, lalu import ulang | Rincian lama mempertahankan snapshot; harga/nama master yang sudah diubah tidak ditimpa | Suite inti 3 |
| DS1-04 | Tambah Rp1 pada omzet header TRX-0001 tanpa mengubah rincian | Commit ditolak; angka kontrol tidak berubah | Suite inti 4 |
| DS1-05 | Tambah kuantitas rincian tanpa mengubah total header | Commit ditolak; angka kontrol tidak berubah | Suite inti 5 |
| DS1-06 | Kirim status Verified langsung ke database | Ditolak; database memakai status aplikasi approved | Suite inti 6 |
| DS1-07 | Isi kuantitas negatif | Ditolak oleh constraint kuantitas positif | Suite inti 7 |
| DS1-08 | Tambah pasangan laporan-produk yang sudah ada | Ditolak oleh primary key gabungan | Suite inti 8 |
| DS1-09 | Tambah rincian untuk produk tanpa master | Ditolak oleh foreign key | Suite inti 9 |
| DS1-10 | Koreksi TRX-0001 dalam satu transaksi, kemudian import ulang | Menjadi 5 botol, omzet Rp62.000, komisi Rp6.200, bagian manajemen Rp55.800, versi 2; koreksi tetap tersimpan | Suite inti 10 |
| DS1-11 | Uji pending/rejected/revision, approve TRX-0465 dua kali, lalu import ulang | Status non-approved tidak masuk kontribusi; persetujuan menambah 2 botol dan Rp23.000 tepat sekali | Suite inti 11 |
| DS1-12 | Uji nominal rupiah di batas pembulatan | Omzet Rp15.005 menghasilkan komisi Rp1.501 dan bagian manajemen Rp13.504 | Suite inti 12 |
| DS1-13 | Laporan approved tanggal 31 Oktober dan 1 November | Oktober: 1 botol/Rp14.000/komisi Rp1.400; November: 2 botol/Rp32.000/komisi Rp3.200 | Suite skenario DS1-13 |
| DS1-14 | Laporan 31 Oktober masih pending, lalu disetujui pada konteks simulasi 3 November | Sebelum persetujuan tidak ada kontribusi; sesudahnya omzet Rp16.000 dan komisi Rp1.600 masuk bulan Oktober | Suite skenario DS1-14 |
| DS1-15 | Ambil 1–3 Desember pada data fixture yang tidak memiliki laporan di periode itu | Jumlah laporan dan metrik approved nol; kalender harian memuat tiga baris nol | Suite skenario DS1-15 |
| DS1-16 | Dua laporan approved Rp15.005 pada bulan yang sama | Omzet Rp30.010; komisi bulanan Rp3.002; bagian manajemen Rp27.008 | Suite skenario DS1-16 |
| DS1-17 | Aktual 6 botol, target belum ditetapkan | Target null, persentase null, status not_set | Suite skenario DS1-17 |
| DS1-18 | Aktual 6 botol, target nol | Persentase null, status zero_target; tidak terjadi pembagian nol | Suite skenario DS1-18 |
| DS1-19 | Aktual 6 botol, target 10 botol pada periode yang sama | Pencapaian 60% | Suite skenario DS1-19 |
| DS1-20 | Aktual 6 botol, target 5 botol | Pencapaian 120%, tidak dipotong menjadi 100% | Suite skenario DS1-20 |
| DS1-21 | Filter FL-001 pada fixture target; terdapat satu approved dan satu pending | Dua laporan terlihat pada hitungan status; kontribusi hanya 3 botol/Rp42.000/komisi Rp4.200 | Suite skenario DS1-21 |

Grup `month_boundary` dipakai DS1-13/15, `late_approval` dipakai DS1-14, `monthly_rounding` dipakai DS1-16, dan `target_scope` dipakai DS1-17 sampai DS1-21. Harga Rp15.005 adalah nominal uji pembulatan sintetis, bukan harga operasional yang diklaim berlaku di UMKM.

## Menjalankan dan membaca bukti

Dari root proyek:

```powershell
npm --prefix database ci
npm --prefix database run test:all:report
```

| Laporan | Bukti yang disimpan |
|---|---|
| `database/test_results.json` | Dua belas skenario inti, urutannya sesuai DS1-01 sampai DS1-12 |
| `database/scenario_test_results.json` | Sembilan skenario tambahan dengan ID DS1-13 sampai DS1-21 |
| `database/reference_test_results.json` | Perbandingan query dashboard terhadap acuan dari CSV mentah |

Laporan mencatat hasil per kasus dan sidik berkas yang diuji. Hasil eksekusi terbaru perlu ditinjau bersama perubahan sumber. Pengujian penolakan memeriksa penyebab penolakan yang sesuai, bukan sekadar adanya error.

## Batas bukti pengujian

DS1-14 menguji pengelompokan bulan melalui tanggal penjualan dan status terkini. Tanggal persetujuan 3 November adalah konteks fixture; schema belum menyimpan waktu keputusan. Pengujian ini belum membuktikan scheduler pengakuan akhir bulan, jejak penyesuaian, atau pembayaran aktual.

DS1-17 sampai DS1-20 menguji rumus dan respons acuan target melalui query dengan input target, karena tabel target aplikasi belum tersedia. DS1-21 menguji filter ID, bukan otorisasi akun. Hasil periode kosong berlaku untuk laporan pada dataset yang diberikan dan tidak membuktikan tidak ada penjualan nyata.

## Pemeriksaan integrasi setelah backend tersedia

| ID integrasi | Pekerjaan | Acuan | Status saat disusun |
|---|---|---|---|
| INT-01 | Cocokkan ringkasan respons API dengan filter tanggal/freelancer yang sama | `analysis/reference/dashboard_reference.json`, bagian filter_cases | Menunggu backend dan kontrak API |
| INT-02 | Cocokkan kartu, grafik, tabel, dan detail setelah persetujuan/koreksi resmi | Acuan per kasus dan snapshot harga | Menunggu aplikasi |
| INT-03 | Periksa bahwa freelancer hanya mendapat data miliknya dan tidak dapat menyetujui laporan | Hak akses sesuai Overview; diuji pada server | Menunggu autentikasi dan backend |
| INT-04 | Periksa revisi mempertahankan ID, keputusan tercatat, dan koreksi memperbarui periode terkait | Alur verifikasi dan riwayat keputusan aplikasi | Menunggu modul dan tabel pendukung |

Catat request, respons aktual, pengguna uji, hasil pencocokan, dan tindak lanjut ketika integrasi dijalankan. Status menunggu tidak dianggap sebagai pengujian aplikasi yang sudah lulus.
