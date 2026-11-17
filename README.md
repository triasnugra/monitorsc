# monitorsc

Monitor untuk mengevaluasi dan memantau 6 mesin analisis scalping crypto: **sc**, **scalp**, **scv2**, **scv3**, **scv4**, **scv5**. Semuanya dinilai dengan satu standar. Hanya membaca jurnal mesin (tidak mengubah repo mesin, tidak ada eksekusi order).

## Pasang (lewat browser)
1. Upload seluruh isi folder ini ke repo `triasnugra/monitorsc` (pastikan folder `.github/workflows/` ikut).
2. Settings > Pages > Build and deployment > Source: **GitHub Actions**.
3. Settings > Actions > General > Workflow permissions: **Read and write permissions**.
4. Tab Actions > **monitor** > Run workflow. Situs: `https://triasnugra.github.io/monitorsc/`. Setelah itu otomatis tiap 15 menit.

Jika repo mesin ada yang privat: buat Personal Access Token (read-only Contents) dan simpan sebagai secret `SOURCE_TOKEN`.

## Yang dipantau
- Perbandingan 6 mesin: win rate, R/trade (+CI95), total R, PF, max drawdown, SQN, fill rate, loss beruntun, durasi.
- Kurva ekuitas (kumulatif R), per sisi dan per setup, sinyal aktif, riwayat sinyal (filter mesin/status).
- Gerbang validasi sebelum uang sungguhan: ≥200 trade, ≥56 hari, batas bawah CI95 > 0, PF ≥ 1,2, SQN ≥ 2 (ubah di `config.json`).
- Kesehatan mesin: umur scan terakhir, ID ganda, baris tidak valid, ringkasan laporan, backtest.
- SCv5: verifikasi ulang rantai hash jurnal, epoch strategi, kondisi risiko, dan perbandingan sinyal per verdict Claude (lihat bagian SCv5).

## Standar penilaian
- Trade dihitung bila order terisi dan hasil final. Tidak terisi/batal masuk fill rate.
- R terstandar = R kotor − `unifiedCostPct` ÷ jarak SL%. Biaya asli tiap mesin tetap ditampilkan sebagai pembanding.
- Jurnal digabung ke `data/archive/*.json` (di-commit oleh workflow) agar baris yang terpotong di repo mesin tidak hilang.

## SCv5 (jurnal berantai-hash)
SCv5 menulis `data/journal.jsonl`: rantai event (SIGNAL, FILL, TP1, CLOSE, EXPIRE) berhash SHA-256. Monitor (`scripts/scv5.mjs`):
- **Memverifikasi ulang rantai** di setiap build, hasilnya tampil di Kesehatan. Bila ada catatan diubah/dihapus: status **Rantai jurnal rusak**, gerbang tidak boleh LOLOS, dan arsip tidak ditimpa dengan jurnal yang bermasalah (arsip tetap data valid terakhir). Bila Anda memang sengaja mereset jurnal SCv5, hapus `data/archive/scv5.json`.
- **Menurunkan state sinyal lewat replay event** (logika sama dengan `scalp/journal.py`). `TARGET_FIRST` (harga ke TP1 sebelum limit terisi) dihitung *tidak terisi*; `DATA_GAP` (celah data) bukan trade.
- **Hanya epoch strategi terkini yang dihitung** (`epochMode: "latest"`). Mengubah parameter SCv5 = hash strategi baru = statistik mulai dari nol; sinyal epoch lama tidak dicampur (jumlahnya tampil di Kesehatan). Hash terkini dibaca dari `state.json` SCv5 di GitHub Pages-nya, atau dari sinyal terbaru bila belum ada.
- Kelompok **Claude: TAKE/WAIT/SKIP/N/A** pada rincian memperlihatkan apakah review AI SCv5 menambah nilai. Ini diukur, bukan diasumsikan; sampel kecil tidak berarti.
- R terstandar memakai `r_gross` dari jurnal dikurangi biaya seragam. Jika profil SCv5 memakai `stop_slip_pct` > 0, slippage sudah ada di `r_gross` sehingga R terstandar sedikit lebih pesimis.

Syarat SCv5: repo `triasnugra/scv5` publik (atau pakai secret `SOURCE_TOKEN`), dan GitHub Pages SCv5 aktif agar `state.json` (kesehatan + hash epoch) terbaca. Tanpa Pages, status tampil “Tidak diketahui” tetapi statistik tetap dihitung. Backtest SCv5 (workflow manual) hanya menghasilkan artifact, jadi tidak tampil di monitor.

## Pengaturan (`config.json`)
- `start`: tanggal mulai forward test per mesin (mis. `"2026-11-14"`); sinyal sebelumnya tidak dihitung. Kosong = semua.
- `unifiedCostPct`, `gates`, `staleAfterMin` (batas "Terlambat"), `repo`/`branch`/path jurnal bila struktur repo mesin berubah.
- Khusus SCv5: `journalFormat: "jsonl-chain"` (jurnal berantai-hash), `epochMode: "latest"` (hanya hash strategi terkini), `report` (URL `state.json` di Pages SCv5).

## Uji lokal (opsional)
`node scripts/selftest.mjs` lalu `node scripts/build.mjs` (hasil di `site/`).

Catatan: GitHub menonaktifkan workflow terjadwal pada repo tanpa aktivitas 60 hari. Bukan saran finansial.
