# Pengujian database Arloraka

Skrip `run-tests.mjs` menjalankan schema dan seed pada PostgreSQL sementara melalui PGlite. Setiap skenario dimulai dari data seed yang sama, sehingga perubahan pada satu tes tidak menjadi prasyarat tes berikutnya. Seluruh database uji berada di memori dan ditutup setelah pengujian.

## Menjalankan tes

Gunakan Node.js 20 atau lebih baru dan npm. Versi PGlite dikunci pada 0.3.14 untuk mereproduksi mesin pengujian awal. Dari root repository:

```powershell
npm --prefix database ci
npm --prefix database test
```

`npm ci` memasang dependensi sesuai `package-lock.json`; perilakunya dijelaskan pada [dokumentasi npm](https://docs.npmjs.com/cli/v11/commands/npm-ci/). Pemasangan pertama memerlukan akses registry npm. Setelah dependensi tersedia, pengujian memakai berkas SQL lokal dan database di memori sebagaimana penggunaan [PGlite](https://pglite.dev/docs/).

Perintah dapat dijalankan dari folder `database` dengan `npm ci` dan `npm test`. Pada PowerShell yang memblokir `npm.ps1`, gunakan `npm.cmd` untuk perintah yang sama.

Skrip membuat instance PGlite tanpa lokasi penyimpanan dan tidak membaca URL database, `.env`, atau kredensial. Pengosongan tabel di awal setiap skenario hanya menyentuh instance uji tersebut. Server database tim tidak dihubungkan.

## Dua jenis eksekusi

| Perintah dari root repository | Hasil |
|---|---|
| `npm --prefix database test` | Menjalankan tes dan menampilkan hasil; tidak mengubah berkas proyek |
| `npm --prefix database run test:report` | Menjalankan tes dan memperbarui `database/test_results.json` |

Status keluar adalah `0` jika seluruh skenario lulus dan hasil rekonsiliasi tanpa selisih. Status `1` berarti ada skenario gagal atau pengujian tidak dapat diselesaikan. Perintah pembaruan laporan menyimpan hasil gagal juga, agar kegagalan saat eksekusi tidak dilaporkan sebagai keberhasilan.

Laporan mencatat mesin PostgreSQL, versi Node.js, waktu eksekusi UTC, jumlah tes lulus/gagal/belum dijalankan, dan sidik SHA-256 berkas yang digunakan. `all_passed` hanya bernilai true setelah seluruh skenario lulus. Tinjau laporan sebelum memasukkannya ke commit.

## Cakupan 12 skenario

| No. | Skenario | Hasil yang diperiksa |
|---|---|---|
| 1 | Schema dan seed awal | 10 freelancer, 6 produk, 750 laporan, 1.681 rincian; angka approved sesuai acuan |
| 2 | Schema dan seed dijalankan ulang | Jumlah record dan kontribusi tetap, identitas sumber tidak ganda |
| 3 | Harga/nama master berubah lalu seed diulang | Snapshot rincian lama dan omzet tetap; perubahan master tidak ditimpa |
| 4 | Omzet header berubah tanpa rincian | Transaksi ditolak oleh pemeriksaan total laporan |
| 5 | Kuantitas rincian berubah tanpa total header | Transaksi ditolak oleh pemeriksaan total laporan |
| 6 | Status sumber Verified dikirim langsung ke database | Ditolak oleh aturan status database |
| 7 | Kuantitas negatif | Ditolak oleh aturan kuantitas positif |
| 8 | Pasangan laporan-produk ganda | Ditolak oleh primary key gabungan |
| 9 | Produk tidak terdaftar pada master | Ditolak oleh foreign key |
| 10 | Koreksi resmi dalam satu transaksi lalu seed diulang | Botol, omzet, komisi, dan versi diperbarui; koreksi tetap tersimpan |
| 11 | Status pending/rejected/revision dan persetujuan berulang | Status non-approved tidak masuk kontribusi; approved dihitung sekali dan tidak dibatalkan seed |
| 12 | Pembulatan komisi pada batas rupiah | Antara lain omzet Rp15.005 menghasilkan komisi Rp1.501 dan bagian manajemen Rp13.504 |

Tes yang mengharapkan penolakan memeriksa SQLSTATE serta nama constraint atau pesan pemeriksaan total yang sesuai. Kesalahan SQL lain tidak dianggap sebagai keberhasilan. Angka kontrol diperiksa kembali setelah rollback untuk memastikan transaksi gagal tidak meninggalkan perubahan.

Setiap skenario juga memeriksa bahwa jumlah botol dan omzet header tetap sama dengan total rincian. Ringkasan berhasil akan berakhir dengan:

```text
Hasil: 12/12 lulus, 0 gagal, 0 belum dijalankan.
```

## Jika sumber atau aturan berubah

Tes membaca `schema.sql`, `seed.sql`, dan `verify.sql` yang sudah tersedia. Skrip ini tidak menjalankan generator Python secara otomatis. Setelah mengubah CSV atau generator, jalankan `python database/prepare_seed.py` dari root proyek, periksa hasil turunannya, lalu jalankan tes.

Jika perubahan bisnis memang mengubah angka kontrol, dokumentasikan alasannya dan perbarui acuan yang relevan di skrip beserta assessment. Jika sebuah constraint dihapus tanpa menyesuaikan kebutuhan bisnis, tes penolakan terkait harus gagal.

Pengujian ini mencakup fondasi transaksi dan seed. Backend, pembatasan akses pengguna, file bukti, pengakuan/pembayaran komisi aktual, dan penggunaan bersamaan pada server masih memerlukan pengujian integrasi tersendiri.
