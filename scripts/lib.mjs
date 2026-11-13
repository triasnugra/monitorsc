// Normalisasi jurnal 3 mesin ke satu skema + statistik dengan satu standar penilaian.
const num = v => (typeof v === 'number' && Number.isFinite(v)) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v)) ? +v : null;
const key = s => String(s ?? '').toLowerCase().replace(/[\s_-]+/g, '');
const usdt = s => { s = String(s).toUpperCase(); return s.endsWith('USDT') ? s : s + 'USDT'; };
const tms = v => { if (num(v) != null) return num(v); if (typeof v === 'string' && v) { const t = Date.parse(v.includes('T') ? v : v.replace(' ', 'T')); return Number.isFinite(t) ? t : null; } return null; };
const r4 = x => x == null ? null : Math.round(x * 1e4) / 1e4;

// R terstandar = R kotor - biayaSeragam% / jarak-SL%. rNative = memakai biaya asli mesin.
function finish(e, o, ctx) {
  const side = String(o.side).toUpperCase();
  if (!['LONG', 'SHORT'].includes(side)) return { err: 'arah tidak valid' };
  for (const k of ['entry', 'sl', 'tSig']) if (num(o[k]) == null) return { err: 'kolom ' + k + ' kosong' };
  const t = { e, id: o.id || `${o.sym}|${side}|${o.tSig}`, sym: o.sym, side, setup: o.setup || '-', grade: o.grade ?? null, score: o.score ?? null,
    entry: o.entry, sl: o.sl, tp: o.tp ?? null, tp2: o.tp2 ?? null, stopPct: r4(o.stopPct), tSig: o.tSig, tOut: o.tOut ?? null,
    state: o.state, outcome: o.outcome ?? null, rGross: null, rNative: null, rStd: null };
  if (o.state === 'CLOSED') {
    if (o.rGross == null || !(o.stopPct > 0)) return { err: 'trade selesai tanpa R / jarak SL' };
    t.rGross = r4(o.rGross); t.rNative = r4(o.rNative ?? (o.rGross - ctx.costPct / o.stopPct)); t.rStd = r4(o.rGross - ctx.unifiedCostPct / o.stopPct);
  }
  return { t };
}

export function normalize(kind, row, ctx) {
  const h = key(row.hasil ?? row.status);
  if (kind === 'sc') {
    const m = { menunggu: ['ACTIVE'], tp: ['CLOSED', 'TP'], sl: ['CLOSED', 'SL'], kedaluwarsa: ['CLOSED', 'TIME'], tidakterisi: ['NOFILL'] }[h];
    if (!m) return { err: 'hasil tidak dikenal: ' + row.hasil };
    const entry = num(row.entry), sl = num(row.sl);
    return finish('sc', { id: row.id, sym: usdt(row.aset), side: row.arah, setup: row.setup, score: num(row.skor), entry, sl, tp: num(row.tp), tSig: num(row.t0), tOut: num(row.tx),
      state: m[0], outcome: m[1], stopPct: Math.abs(entry - sl) / entry * 100, rGross: num(row.R) }, ctx);
  }
  if (kind === 'scalp') {
    const m = { menunggu: ['ACTIVE'], open: ['ACTIVE'], tidakterisi: ['NOFILL'], batal: ['CANCEL'], sl: ['CLOSED', 'SL'], 'tp1+be': ['CLOSED', 'PARTIAL'], tp2: ['CLOSED', 'TP'], timeout: ['CLOSED', 'TIME'] }[h];
    if (!m) return { err: 'hasil tidak dikenal: ' + row.hasil };
    return finish('scalp', { id: row.id, sym: usdt(row.sym), side: row.side, setup: (row.trig || []).join('+'), grade: row.grade, score: num(row.score), entry: num(row.entry), sl: num(row.sl),
      tp: num(row.tp1), tp2: num(row.tp2), tSig: num(row.t), tOut: num(row.tx), state: m[0], outcome: m[1], stopPct: num(row.slp), rGross: num(row.R), rNative: num(row.Rnet) }, ctx);
  }
  if (kind === 'scv2') {
    const o = key(row.outcome);
    let m;
    if (h === 'pending' || h === 'open') m = ['ACTIVE'];
    else if (h === 'closed') { const oc = { sl: 'SL', tp1be: 'PARTIAL', tp2: 'TP', time: 'TIME', time2: 'TIME' }[o]; if (oc) m = ['CLOSED', oc]; }
    else if (h === 'expired') m = o === 'datahilang' ? ['CANCEL'] : ['NOFILL'];
    else if (h === 'cancelled') m = ['CANCEL'];
    if (!m) return { err: `status/outcome tidak dikenal: ${row.status}/${row.outcome}` };
    const sp = num(row.stop_pct), c = num(row.cost_pct) ?? ctx.costPct, r = num(row.r);
    return finish('scv2', { id: row.id, sym: usdt(row.symbol), side: row.side, setup: row.trigger, score: num(row.score), entry: num(row.entry), sl: num(row.stop), tp: num(row.tp1), tp2: num(row.tp2),
      tSig: tms(row.ts), tOut: tms(row.exit_ts), state: m[0], outcome: m[1], stopPct: sp, rNative: r,
      rGross: (m[0] === 'CLOSED' && r != null && sp > 0) ? (r * (sp + c) + c) / sp : null }, ctx);   // r sumber = (kotor% - biaya%)/(stop%+biaya%)
  }
  if (kind === 'scv3') {
    const m = { open: ['ACTIVE'], tp1: ['ACTIVE'], win: ['CLOSED', 'TP'], loss: ['CLOSED', 'SL'], be: ['CLOSED', 'PARTIAL'], timeout: ['CLOSED', 'TIME'] }[h];
    if (!m) return { err: 'status tidak dikenal: ' + row.status };
    const entry = num(row.entry), sl = num(row.sl), sp = Math.abs(entry - sl) / entry * 100, r = num(row.r);
    return finish('scv3', { id: row.id, sym: usdt(row.symbol), side: row.side, setup: row.setup, score: num(row.score), entry, sl, tp: num(row.tp1), tp2: num(row.tp2),
      tSig: tms(row.bar_close ?? row.ts), tOut: tms(row.closed_at), state: m[0], outcome: m[1], stopPct: sp, rNative: r,
      rGross: (m[0] === 'CLOSED' && r != null && sp > 0) ? r + ctx.costPct / sp : null }, ctx);   // r sumber sudah dikurangi biaya (fee+slippage pulang-pergi)
  }
  if (kind === 'scv4') {
    const m = { open: ['ACTIVE'], tp1open: ['ACTIVE'], sl: ['CLOSED', 'SL'], tp1sl: ['CLOSED', 'SL'], tp1be: ['CLOSED', 'PARTIAL'], tp2: ['CLOSED', 'TP'], time: ['CLOSED', 'TIME'], tp1time: ['CLOSED', 'TIME'], invalid: ['CANCEL'] }[h];
    if (!m) return { err: 'status tidak dikenal: ' + row.status };
    const entry = num(row.entry), sl = num(row.stop), sp = Math.abs(entry - sl) / entry * 100, r = num(row.r);
    return finish('scv4', { id: row.id, sym: usdt(row.symbol), side: row.direction, setup: row.trigger, score: num(row.score), entry, sl, tp: num(row.tp1), tp2: num(row.tp2),
      tSig: tms(row.time), tOut: tms(row.closed_at), state: m[0], outcome: m[1], stopPct: sp, rNative: r,
      rGross: (m[0] === 'CLOSED' && r != null && sp > 0) ? r + ctx.costPct / sp : null }, ctx);   // r sumber sudah dikurangi biaya round-trip
  }
  return { err: 'jenis mesin tidak dikenal: ' + kind };
}

// ---------- statistik ----------
const T = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042];
export const tCrit = df => df < 1 ? null : df <= 30 ? T[df] : 1.96 + (1.96 ** 3 + 1.96) / (4 * df);
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const sdev = a => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

export function summarize(trades, k = 'rStd') {
  const c = trades.filter(t => t.state === 'CLOSED' && Number.isFinite(t[k])).sort((a, b) => (a.tOut ?? 0) - (b.tOut ?? 0));
  const rs = c.map(t => t[k]), n = rs.length;
  const nonClosed = trades.filter(t => ['NOFILL', 'CANCEL'].includes(t.state)).length;
  const o = { n, fillRate: n + nonClosed ? r4(n / (n + nonClosed) * 100) : null };
  if (!n) return o;
  const w = rs.filter(r => r > 0), l = rs.filter(r => r <= 0), gp = w.reduce((s, x) => s + x, 0), gl = -l.reduce((s, x) => s + x, 0);
  const sd = sdev(rs), avg = mean(rs), se = sd == null ? null : sd / Math.sqrt(n), tc = tCrit(n - 1);
  let eq = 0, pk = 0, dd = 0, ls = 0, mls = 0;
  for (const r of rs) { eq += r; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = r <= 0 ? ls + 1 : 0; mls = Math.max(mls, ls); }
  const dur = c.filter(t => t.tOut && t.tSig).map(t => (t.tOut - t.tSig) / 6e4);
  return { ...o, win: w.length, loss: l.length, winRate: r4(w.length / n * 100), avgR: r4(avg), totalR: r4(eq), sd: r4(sd),
    ciLo: se == null ? null : r4(avg - tc * se), ciHi: se == null ? null : r4(avg + tc * se),
    pf: gl > 0 ? r4(gp / gl) : null, pfNoLoss: gl === 0 && gp > 0, maxDD: r4(dd), sqn: sd ? r4(Math.sqrt(Math.min(n, 100)) * avg / sd) : null,
    avgWin: r4(mean(w)), avgLoss: r4(mean(l)), maxLossStreak: mls, curLossStreak: ls, medDurMin: dur.length ? Math.round(med(dur)) : null };
}

export function gates(st, spanDays, g) {
  const ch = [
    { id: 'n', label: `≥ ${g.minTrades} trade selesai`, value: st.n, need: g.minTrades, pass: st.n >= g.minTrades },
    { id: 'days', label: `≥ ${g.minDays} hari`, value: Math.round(spanDays * 10) / 10, need: g.minDays, pass: spanDays >= g.minDays },
    { id: 'ci', label: 'Batas bawah CI95 R/trade > 0', value: st.ciLo ?? null, need: 0, pass: st.ciLo != null && st.ciLo > 0 },
    { id: 'pf', label: `Profit factor ≥ ${g.minPF}`, value: st.pf ?? null, need: g.minPF, pass: !!st.pfNoLoss || (st.pf != null && st.pf >= g.minPF) },
    { id: 'sqn', label: `SQN ≥ ${g.minSQN}`, value: st.sqn ?? null, need: g.minSQN, pass: st.sqn != null && st.sqn >= g.minSQN }];
  const verdict = !(ch[0].pass && ch[1].pass) ? 'DATA_KURANG' : ch.every(x => x.pass) ? 'LOLOS' : 'GAGAL';
  const warn = (st.n >= 30 && st.ciHi != null && st.ciHi < 0) ? `Bukti negatif: batas atas CI95 R/trade < 0 (n=${st.n}).` : null;
  return { checks: ch, verdict, warn };
}
