# Progres dan penyerahan pekerjaan DS-1

Daftar ini merangkum pekerjaan yang dapat dibuktikan dari berkas repository. Bukti SQL diperoleh dari database sementara, sementara integrasi ke aplikasi tim memerlukan backend yang belum tersedia.

| Pekerjaan DS-1 | Hasil | Status |
|---|---|---|
| Memeriksa ID, kelengkapan, tipe data, tanggal, kuantitas, dan nominal | `Asessment.ipynb`, generator, dan laporan validasi | Selesai untuk dataset dummy awal |
| Menyusun kamus data dan pemetaan database | Kamus pada assessment; `database/column_mapping.csv` dan README database | Selesai sebagai acuan implementasi |
| Mencocokkan botol, omzet, dan komisi simulasi | Assessment, pemeriksaan per laporan, dan suite inti | Selesai pada data awal/database sementara |
| Menyiapkan import data awal tanpa duplikasi | Empat CSV seed, schema, seed SQL, dan tes import ulang | Selesai pada PostgreSQL sementara; pemasangan backend belum diuji |
| Menjaga produk dan harga historis | Snapshot pada rincian serta tes perubahan harga/koreksi | Selesai pada schema dan query acuan |
| Menambahkan data untuk kasus yang belum tercakup | Fixture tambahan dan DS1-13 sampai DS1-21 | Selesai sebagai data uji dan hasil harapan |
| Menyiapkan data/hasil untuk DS-2 dan backend | Rekap harian, bulanan, freelancer, produk, status, dan delapan filter | Siap diserahkan; persetujuan metrik oleh DS-2 belum tercatat |
| Membuktikan konsistensi hasil dashboard/API | Tabel INT-01 sampai INT-04 | Menunggu backend/aplikasi |
| Menyiapkan dokumentasi kontribusi untuk Project Brief | Assessment, dokumen skenario, panduan, dan laporan pengujian | Bukti tersedia; masukkan ringkasannya ke template resmi tim |

## Isi penyerahan

- Sumber bersama tetap 750 transaksi dummy, sepuluh freelancer, dan enam produk.
- Pemetaan menghasilkan 750 laporan dan 1.681 rincian produk.
- Angka kontribusi awal approved adalah 693 laporan, 1.986 botol, omzet Rp27.776.000, dan jumlah nominal komisi Rp2.777.600.
- Kasus uji tambahan dipisahkan dari seed awal dan hanya dimuat oleh skrip uji ke database di memori.
- Acuan dashboard dihitung dari CSV mentah dan harga generator melalui Python, lalu dibandingkan dengan query PostgreSQL.
- Pengujian dapat diulang anggota tim melalui `npm --prefix database run test:all:report`.

Gunakan `docs/ds1-test-cases.md` untuk menelusuri kasus dan `analysis/README.md` untuk memahami metrik/filter. Laporan hasil ada pada `database/test_results.json`, `database/scenario_test_results.json`, dan `database/reference_test_results.json`.

## Hal yang perlu ditindaklanjuti bersama tim

Athallah meninjau definisi metrik, persentase kontribusi, dan penyajian periode parsial. Kevin memasang schema/seed pada database pengembangan tim dan menyediakan respons API yang dapat dibandingkan dengan acuan. Waktu persetujuan, riwayat koreksi, target tersimpan, pengakuan komisi, dan pembayaran memerlukan tabel/modul pendukung sesuai Overview.

Setelah backend tersedia, jalankan INT-01 sampai INT-04 dan dokumentasikan respons aktual serta perbaikannya. Klaim bahwa dashboard sudah tepat atau akses pengguna sudah aman memerlukan bukti dari tahap tersebut. Hasil simulasi pada repository ini belum menjadi ukuran dampak bisnis aktual UMKM.
