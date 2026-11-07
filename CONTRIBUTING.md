# Panduan kontribusi tim

Gunakan `main` sebagai dasar pekerjaan dan buat branch untuk setiap perubahan. Sebelum mulai, baca README utama dan panduan pada folder yang akan diubah.

## Alur pengerjaan

Setelah repository tersedia di GitHub, ambil pembaruan dan buat branch:

```powershell
git switch main
git pull --ff-only origin main
git switch -c feat/nama-fitur
```

Gunakan awalan `feat/`, `fix/`, atau `docs/` sesuai perubahan. Setelah memeriksa hasil pekerjaan:

```powershell
git status
git add nama-berkas-yang-diubah
git commit -m "Jelaskan perubahan yang dibuat"
git push -u origin HEAD
```

Buat pull request ke `main` dengan penjelasan perubahan dan hasil pemeriksaan. Sertakan berkas terkait agar reviewer dapat menelusuri dampaknya. Pengaturan review atau perlindungan branch belum dibuat otomatis oleh folder proyek ini.

## Notebook dan dataset

Jalankan cell notebook secara berurutan sebelum menyerahkan perubahan perhitungan. Pertahankan output yang membantu memeriksa hasil dan bersihkan output yang mengandung kredensial atau data privat. Hindari mengedit notebook yang sama bersamaan; beri tahu tim notebook atau bagian yang sedang dikerjakan.

`dummy-data` menyimpan sumber simulasi bersama. Perubahan sumber perlu disertai alasan, hasil assessment, dan pembaruan data turunan yang terdampak. `.gitattributes` mempertahankan byte notebook, CSV, dan SQL agar sidik berkas pada laporan validasi konsisten lintas komputer.

Jika mengubah `DataDummyCafe.ipynb`, periksa kembali sidik generator pada `database/validation_report.json` melalui `prepare_seed.py`. Jika mengubah schema, aturan import, atau seed, ulangi pengujian database yang terdampak dan perbarui bukti pengujiannya; menjalankan pembentuk seed saja tidak menguji SQL pada server.

## Konfigurasi dan data

Gunakan `.env.example` untuk menunjukkan nama variabel yang diperlukan tanpa mengisi kredensial. Konfigurasi lokal dan data operasional privat tidak dimasukkan ke Git. Tambahkan petunjuk setup ketika sebuah fitur membutuhkan dependensi atau variabel baru.

## Database dan backend

Pertahankan identitas asal laporan, harga transaksi, dan aturan kontribusi approved ketika menghubungkan aplikasi. Perubahan header dan rincian laporan harus berada dalam satu transaksi. Sertakan migrasi yang dapat diperiksa jika struktur penyimpanan berubah, dan perbarui panduan serta kontrak API yang terdampak.

## Menjalankan pengujian database

Dari root proyek, jalankan `npm --prefix database ci` sekali untuk memasang dependensi sesuai lockfile. Gunakan `npm --prefix database test` sebelum menyerahkan perubahan schema, seed, atau perhitungan database. Perintah biasa tidak mengubah laporan yang dilacak Git.

Jika ingin menyertakan bukti pengujian terbaru, jalankan `npm --prefix database run test:report`, lalu tinjau `database/test_results.json` bersama perubahan yang diuji. Petunjuk skenario dan arti hasil tersedia pada [panduan pengujian](database/tests/README.md).
