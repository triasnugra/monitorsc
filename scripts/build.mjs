// Ambil jurnal 3 mesin -> normalisasi -> gabung ke arsip -> hitung statistik -> tulis site/.
// LOCAL_DIR=<dir> membaca <dir>/<id>/<path> (uji offline). SOURCE_TOKEN dipakai bila repo mesin privat.
import fs from 'node:fs';
import { normalize, summarize, gates } from './lib.mjs';

const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const TOKEN = process.env.SOURCE_TOKEN || process.env.GITHUB_TOKEN || '', PRIV = !!process.env.SOURCE_TOKEN, LOCAL = process.env.LOCAL_DIR;
const now = Date.now(), UA = { 'User-Agent': 'monitorsc' };
const H = (extra = {}) => ({ ...UA, ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}), ...extra });

async function get(url, headers) {
  let last;
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) }); if (r.status === 404) return null; if (r.ok) return r; last = new Error(r.status + ' ' + url); }
    catch (e) { last = e; }
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
  }
  throw last;
}
async function src(e, path, branch = e.branch) {            // teks file dari repo mesin; null bila tidak ada
  if (!path) return null;
  const isUrl = /^https?:\/\//.test(path);
  if (LOCAL) { const f = `${LOCAL}/${e.id}/${isUrl ? path.split('/').pop() : path}`; return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; }
  if (isUrl) { const r = await get(path + '?_=' + now, UA); return r ? await r.text() : null; }   // sumber di GitHub Pages mesin
  const r = PRIV ? await get(`https://api.github.com/repos/${e.repo}/contents/${path}?ref=${branch}`, H({ Accept: 'application/vnd.github.raw' }))
                 : await get(`https://raw.githubusercontent.com/${e.repo}/${branch}/${path}`, UA);
  return r ? await r.text() : null;
}
async function lastCommit(e) {
  if (LOCAL) return null;
  try { const r = await get(`https://api.github.com/repos/${e.repo}/commits?sha=${e.branch}&per_page=1`, H({ Accept: 'application/vnd.github+json' })); const j = r && await r.json(); return j?.[0]?.commit?.committer?.date ? Date.parse(j[0].commit.committer.date) : null; }
  catch { return null; }
}

fs.mkdirSync('data/archive', { recursive: true });
const archFile = id => `data/archive/${id}.json`;
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const FINAL = new Set(['CLOSED', 'NOFILL', 'CANCEL']);

async function health(e, jr) {                                // tanda kehidupan mesin + ringkasan laporan terakhir
  const h = { notes: [], lastScanAt: null, lastCommitAt: e.kind === 'scv4' ? null : await lastCommit(e) };   // scv4 tidak commit per scan
  try {
    if (e.kind === 'sc') {
      const t = await src(e, e.report) || '';
      h.lastScanAt = Date.parse((t.match(/\d{4}-\d\d-\d\dT[\d:.]+Z/) || [])[0]) || null;
      h.notes = t.split('\n').filter(l => /^(Rezim BTC|Trade selesai|Terbuka|Hash kode)/.test(l));
    } else if (e.kind === 'scalp') {
      const r = JSON.parse(await src(e, e.report) || 'null');
      if (r) { h.lastScanAt = Date.parse(r.generatedAt || r.checkedAt) || null; h.notes = [`Status: ${r.status}`];
        if (r.btc) h.notes.push(`BTC tren 1D ${r.btc.t1}, 4H ${r.btc.t4}, 6 jam ${r.btc.mv6?.toFixed(2)}%`);
        if (r.funnel) h.notes.push(`Dipindai ${r.funnel.scanned}/${r.funnel.universe}, kandidat ${r.funnel.candidates}, terbit ${r.funnel.published}`); }
    } else if (e.kind === 'scv4') {
      const r = JSON.parse(await src(e, e.report) || 'null');
      if (r) { h.lastScanAt = Date.parse(r.generated_at) || null; h.mode = r.mode; const c = {}; (r.results || []).forEach(x => c[x.decision] = (c[x.decision] || 0) + 1);
        h.notes = [`Mode ${r.mode}; provider ${(r.providers || []).join(', ') || '-'}; keputusan: ${Object.entries(c).map(([k, v]) => k + ' ' + v).join(', ') || '-'}`];
        const ne = Object.keys(r.errors || {}).length; if (ne) h.notes.push(`Error data: ${ne} simbol`); }
    } else if (e.kind === 'scv3') {
      const r = JSON.parse(await src(e, e.report) || 'null');
      if (r) { h.lastScanAt = Date.parse(r.updated) || null; h.notes = [`Mode ${r.mode}; candle ${r.ltf}/${r.htf}; skor minimum ${r.min_score}`]; }
    } else if (e.kind === 'scv2' && e.pagesLatest) {
      const r = await get(e.pagesLatest, UA).then(x => x && x.json()).catch(() => null);
      if (r) { h.lastScanAt = Date.parse(r.generated) || null; const c = {}; (r.decisions || []).forEach(d => c[d.decision] = (c[d.decision] || 0) + 1);
        h.notes = [`Mode ${r.mode}; keputusan: ${Object.entries(c).map(([k, v]) => k + ' ' + v).join(', ') || '-'}`]; if (Object.keys(r.errors || {}).length) h.notes.push(`Error data: ${Object.keys(r.errors).length} simbol`); }
    }
  } catch (x) { h.notes.push('Gagal baca laporan: ' + x.message); }
  const at = h.lastScanAt || h.lastCommitAt;
  h.ageMin = at ? Math.round((now - at) / 6e4) : null;
  h.status = jr.fetchError ? 'ERROR' : h.ageMin == null ? 'UNKNOWN' : h.ageMin <= e.staleAfterMin ? 'OK' : 'STALE';
  return h;
}
async function backtest(e) {
  try {
    if (e.backtest) { const t = await src(e, e.backtest); if (t) return { kind: 'md', text: t.slice(0, 6000) }; }
    if (e.backtestJson) { const t = await src(e, e.backtestJson, e.backtestBranch); if (t) { const j = JSON.parse(t);
      if (e.kind === 'scv3') { const o = j.stats?.overall || {}; return { kind: 'json', days: j.days, signals: o.n, overall: { n: o.n, win_rate: o.win_rate, expectancy_r: o.avg_r, profit_factor: o.profit_factor, max_dd_r: j.stats?.max_drawdown_r },
        notes: [`Periode ${String(j.span?.from).slice(0, 10)} s/d ${String(j.span?.to).slice(0, 10)}, ${j.symbols?.length ?? '?'} simbol`, ...(j.assumptions || [])] }; } return { kind: 'json', days: j.days, signals: j.signals, overall: j.overall, folds: j.folds, notes: j.notes }; } }
  } catch (x) { return { kind: 'md', text: 'Gagal baca backtest: ' + x.message }; }
  return null;
}

const engines = [], allTrades = [];
for (const e of cfg.engines) {
  const ctx = { costPct: e.costPct, unifiedCostPct: cfg.unifiedCostPct }, jr = { fetchError: null, rows: 0, dupIds: 0, invalid: 0, invalidEx: [] };
  if (e.engineConfig && !LOCAL) { try { const c = JSON.parse(await src(e, e.engineConfig) || 'null'); if (c?.costPct > 0) ctx.costPct = c.costPct; } catch {} }
  const arch = new Map(readJson(archFile(e.id), []).map(t => [t.id, t])), seen = new Set(), fresh = new Map();
  try {
    const doc = JSON.parse(await src(e, e.journal) ?? 'null'), raw = e.journalKey ? doc?.[e.journalKey] : doc;
    jr.mode = doc?.mode ?? null;
    if (!Array.isArray(raw)) throw new Error('jurnal tidak ditemukan / bukan array');
    jr.rows = raw.length;
    for (const row of raw) {
      const { t, err } = normalize(e.kind, row, ctx);
      if (err) { jr.invalid++; if (jr.invalidEx.length < 5) jr.invalidEx.push(err); continue; }
      if (seen.has(t.id)) jr.dupIds++; seen.add(t.id); fresh.set(t.id, t);
    }
  } catch (x) { jr.fetchError = x.message; }
  let regress = 0;
  for (const [id, t] of fresh) { const o = arch.get(id); if (o && FINAL.has(o.state) && !FINAL.has(t.state)) { regress++; continue; } arch.set(id, t); }
  let lost = 0;
  if (!jr.fetchError) for (const t of arch.values()) if (t.state === 'ACTIVE' && !seen.has(t.id) && now - t.tSig > 72 * 36e5) { t.state = 'CANCEL'; t.outcome = 'HILANG'; lost++; }   // aktif tapi hilang dari sumber >72 jam
  const all = [...arch.values()].sort((a, b) => a.tSig - b.tSig);
  fs.writeFileSync(archFile(e.id), '[\n' + all.map(t => JSON.stringify(t)).join(',\n') + '\n]\n');
  const start = e.start ? Date.parse(e.start) : 0, win = all.filter(t => t.tSig >= start);
  const st = summarize(win, 'rStd'), nat = summarize(win, 'rNative');
  const span = win.length ? (now - win[0].tSig) / 864e5 : 0, g = gates(st, span, cfg.gates);
  const by = f => Object.fromEntries([...new Set(win.map(f))].sort().map(k => [k, summarize(win.filter(t => f(t) === k), 'rStd')]));
  const hl = await health(e, jr);
  engines.push({ id: e.id, name: e.name, repo: e.repo, color: e.color, start: e.start || null, costNative: ctx.costPct,
    counts: { signals: win.length, closed: st.n, active: win.filter(t => t.state === 'ACTIVE').length, nofill: win.filter(t => t.state === 'NOFILL').length,
      cancel: win.filter(t => t.state === 'CANCEL').length, beforeStart: all.length - win.length },
    std: st, native: { n: nat.n, avgR: nat.avgR, totalR: nat.totalR, pf: nat.pf }, gates: g, bySide: by(t => t.side), bySetup: by(t => t.setup),
    quality: { mode: jr.mode ?? hl.mode ?? null, rows: jr.rows, dupIds: jr.dupIds, invalid: jr.invalid, invalidEx: jr.invalidEx, archiveOnly: [...arch.keys()].filter(k => !seen.has(k)).length, lost, regress, fetchError: jr.fetchError },
    health: hl, backtest: await backtest(e) });
  allTrades.push(...win);
}
allTrades.sort((a, b) => b.tSig - a.tSig);
fs.mkdirSync('site/data', { recursive: true });
fs.writeFileSync('site/data/summary.json', JSON.stringify({ generatedAt: new Date(now).toISOString(), title: cfg.title, unifiedCostPct: cfg.unifiedCostPct, gates: cfg.gates, engines }));
fs.writeFileSync('site/data/trades.json', JSON.stringify(allTrades));
fs.copyFileSync('web/index.html', 'site/index.html');
fs.writeFileSync('site/.nojekyll', '');
for (const e of engines) console.log(`${e.id}: sinyal ${e.counts.signals}, selesai ${e.counts.closed}, aktif ${e.counts.active}, status ${e.health.status}${e.quality.fetchError ? ' [GAGAL: ' + e.quality.fetchError + ']' : ''}`);
