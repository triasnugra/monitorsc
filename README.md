# monitorsc

Monitor untuk mengevaluasi dan memantau 5 mesin analisis scalping crypto: **sc**, **scalp**, **scv2**, **scv3**, **scv4**. Semuanya dinilai dengan satu standar. Hanya membaca jurnal mesin (tidak mengubah repo mesin, tidak ada eksekusi order).

## Pasang (lewat browser)
1. Upload seluruh isi folder ini ke repo `triasnugra/monitorsc` (pastikan folder `.github/workflows/` ikut).
2. Settings > Pages > Build and deployment > Source: **GitHub Actions**.
3. Settings > Actions > General > Workflow permissions: **Read and write permissions**.
4. Tab Actions > **monitor** > Run workflow. Situs: `https://triasnugra.github.io/monitorsc/`. Setelah itu otomatis tiap 15 menit.

Jika repo mesin ada yang privat: buat Personal Access Token (read-only Contents) dan simpan sebagai secret `SOURCE_TOKEN`.

## Yang dipantau
- Perbandingan 5 mesin: win rate, R/trade (+CI95), total R, PF, max drawdown, SQN, fill rate, loss beruntun, durasi.
- Kurva ekuitas (kumulatif R), per sisi dan per setup, sinyal aktif, riwayat sinyal (filter mesin/status).
- Gerbang validasi sebelum uang sungguhan: ≥200 trade, ≥56 hari, batas bawah CI95 > 0, PF ≥ 1,2, SQN ≥ 2 (ubah di `config.json`).
- Kesehatan mesin: umur scan terakhir, ID ganda, baris tidak valid, ringkasan laporan, backtest.

## Standar penilaian
- Trade dihitung bila order terisi dan hasil final. Tidak terisi/batal masuk fill rate.
- R terstandar = R kotor − `unifiedCostPct` ÷ jarak SL%. Biaya asli tiap mesin tetap ditampilkan sebagai pembanding.
- Jurnal digabung ke `data/archive/*.json` (di-commit oleh workflow) agar baris yang terpotong di repo mesin tidak hilang.

## Pengaturan (`config.json`)
- `start`: tanggal mulai forward test per mesin (mis. `"2026-11-14"`); sinyal sebelumnya tidak dihitung. Kosong = semua.
- `unifiedCostPct`, `gates`, `staleAfterMin` (batas "Terlambat"), `repo`/`branch`/path jurnal bila struktur repo mesin berubah.

## Uji lokal (opsional)
`node scripts/selftest.mjs` lalu `node scripts/build.mjs` (hasil di `site/`).

Catatan: GitHub menonaktifkan workflow terjadwal pada repo tanpa aktivitas 60 hari. Bukan saran finansial.
