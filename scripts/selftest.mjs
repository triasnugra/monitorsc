import fs from 'node:fs';
import assert from 'node:assert/strict';
import { normalize, summarize, gates, tCrit } from './lib.mjs';
import { loadChain, parseRaw, plain, canon, pickEpoch, replay } from './scv5.mjs';
const ok = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-3, `${m}: ${a} != ${b}`);
const ctx = (c) => ({ costPct: c, unifiedCostPct: 0.2 });

// sc: SL (baris nyata) dan TP; biaya asli 0,2%
let r = normalize('sc', { id: 'a', aset: 'GRAM', arah: 'SHORT', entry: 1.141, sl: 1.15379, tp: 1.11797, hasil: 'SL', R: -1, t0: 1794539700000, tx: 1794545100000, setup: 'pullback' }, ctx(0.2));
ok(r.t.rNative, -1 - 0.2 / (0.01279 / 1.141 * 100), 'sc SL'); assert.equal(r.t.sym, 'GRAMUSDT');
r = normalize('sc', { id: 'b', aset: 'X', arah: 'LONG', entry: 100, sl: 99, tp: 101.8, hasil: 'TP', R: 1.8, t0: 1, tx: 2 }, ctx(0.2)); ok(r.t.rStd, 1.6, 'sc TP');
assert.equal(normalize('sc', { aset: 'X', arah: 'LONG', entry: 100, sl: 99, hasil: 'tidak terisi', R: 0, t0: 1 }, ctx(0.2)).t.state, 'NOFILL');
assert.equal(normalize('sc', { aset: 'X', arah: 'LONG', entry: 100, sl: 99, hasil: 'menunggu', R: '', t0: 1 }, ctx(0.2)).t.state, 'ACTIVE');
// scalp: Rnet asli dipertahankan, R terstandar memakai biaya seragam
r = normalize('scalp', { id: 'c', sym: 'NVDABUSDT', side: 'SHORT', trig: ['BR'], entry: 165.22, sl: 168.77, tp1: 159.9, tp2: 149.2, slp: 2.145, t: 1794506400000, tx: 1794528000000, hasil: 'SL', R: -1, Rnet: -1.047 }, ctx(0.1));
ok(r.t.rNative, -1.047, 'scalp native'); ok(r.t.rStd, -1 - 0.2 / 2.145, 'scalp std');
assert.equal(normalize('scalp', { sym: 'A', side: 'LONG', entry: 1, sl: 0.9, t: 1, hasil: 'TP1+BE', R: 0.9, slp: 1 }, ctx(0.1)).t.outcome, 'PARTIAL');
// scv2: r sumber (bersih) dikonversi balik ke R kotor lalu distandarkan
r = normalize('scv2', { id: 'd', ts: '2026-11-13T05:00:00+00:00', symbol: 'BTCUSDT', side: 'long', trigger: 'T1', entry: 100, stop: 99, tp1: 101.5, tp2: 102.4, stop_pct: 1, cost_pct: 0.15, status: 'CLOSED', outcome: 'SL', r: -1, exit_ts: '2026-11-13 05:15:00+00:00' }, ctx(0.15));
ok(r.t.rGross, -1, 'scv2 SL gross'); ok(r.t.rStd, -1.2, 'scv2 SL std'); assert.ok(r.t.tOut > r.t.tSig);
r = normalize('scv2', { ts: '2026-11-13T05:00:00+00:00', symbol: 'ETHUSDT', side: 'short', entry: 100, stop: 101, stop_pct: 1, cost_pct: 0.15, status: 'CLOSED', outcome: 'TP2', r: (2.4 - 0.15) / 1.15 }, ctx(0.15)); ok(r.t.rGross, 2.4, 'scv2 TP2 gross');
assert.equal(normalize('scv2', { ts: '2026-11-13T05:00:00+00:00', symbol: 'A', side: 'long', entry: 1, stop: .9, status: 'EXPIRED', outcome: 'LIMIT_TIDAK_TERISI' }, ctx(0.15)).t.state, 'NOFILL');
assert.ok(normalize('scv2', { status: 'ANEH' }, ctx(0.15)).err);
// scv3: r sumber (bersih, biaya 0,16%) dikonversi ke R kotor; baris SL nyata dari backtest scv3
r = normalize('scv3', { id: 'e', symbol: 'LTCUSDT', side: 'long', setup: 'level_sweep', entry: 68.93, sl: 68.42513362246126, tp1: 69.43, tp2: 69.94, status: 'LOSS', r: -1.2184, bar_close: '2026-09-29T08:30:00+00:00', closed_at: '2026-09-29T08:45:00+00:00' }, ctx(0.16));
ok(r.t.rGross, -1, 'scv3 SL gross'); ok(r.t.rStd, -1 - 0.2 / 0.73243, 'scv3 SL std'); assert.ok(r.t.tOut > r.t.tSig);
assert.equal(normalize('scv3', { symbol: 'A', side: 'short', entry: 10, sl: 10.1, status: 'TP1', bar_close: '2026-09-29T08:30:00+00:00' }, ctx(0.16)).t.state, 'ACTIVE');
assert.equal(normalize('scv3', { symbol: 'A', side: 'short', entry: 10, sl: 10.1, status: 'BE', r: 0.3, bar_close: '2026-09-29T08:30:00+00:00' }, ctx(0.16)).t.outcome, 'PARTIAL');
// scv4: r sumber (bersih, biaya 0,16%) -> R kotor; semua status
r = normalize('scv4', { id: 'BTC-1', symbol: 'BTC', direction: 'long', trigger: 'T1', entry: 100, stop: 99, tp1: 101, tp2: 102, status: 'SL', r: -1.16, time: '2026-11-13T05:00:00+00:00', closed_at: '2026-11-13T05:20:00+00:00' }, ctx(0.16));
ok(r.t.rGross, -1, 'scv4 SL gross'); ok(r.t.rStd, -1.2, 'scv4 SL std'); assert.equal(r.t.sym, 'BTCUSDT'); assert.ok(r.t.tOut > r.t.tSig);
for (const [st, state, oc] of [['OPEN', 'ACTIVE'], ['TP1_OPEN', 'ACTIVE'], ['TP1_BE', 'CLOSED', 'PARTIAL'], ['TP1_SL', 'CLOSED', 'SL'], ['TP2', 'CLOSED', 'TP'], ['TIME', 'CLOSED', 'TIME'], ['TP1_TIME', 'CLOSED', 'TIME'], ['INVALID', 'CANCEL']]) {
  const x = normalize('scv4', { symbol: 'ETH', direction: 'short', entry: 10, stop: 10.1, r: 0.2, status: st, time: '2026-11-13T05:00:00+00:00' }, ctx(0.16)).t;
  assert.equal(x.state, state, st); if (oc) assert.equal(x.outcome, oc, st);
}
assert.ok(normalize('scv4', { status: 'ANEH' }, ctx(0.16)).err);
// statistik: R = +1, -1, -1, +2 -> rata2 .25, PF 1.5, maxDD 2
const T = [1, -1, -1, 2].map((x, i) => ({ state: 'CLOSED', rStd: x, tSig: i, tOut: i + 1 }));
const s = summarize([...T, { state: 'NOFILL' }]);
ok(s.avgR, 0.25, 'avg'); ok(s.pf, 1.5, 'pf'); ok(s.maxDD, 2, 'dd'); ok(s.winRate, 50, 'win'); ok(s.fillRate, 80, 'fill'); assert.equal(s.maxLossStreak, 2);
ok(tCrit(10), 2.228, 't10'); ok(tCrit(100), 1.984, 't100');
assert.equal(gates(s, 5, { minTrades: 200, minDays: 56, minPF: 1.2, minSQN: 2 }).verdict, 'DATA_KURANG');
const big = Array.from({ length: 300 }, (_, i) => ({ state: 'CLOSED', rStd: i % 2 ? 2 : -1, tSig: i, tOut: i + 1 }));
assert.equal(gates(summarize(big), 90, { minTrades: 200, minDays: 56, minPF: 1.2, minSQN: 2 }).verdict, 'LOLOS');

// ---------- scv5: jurnal berantai-hash ----------
const fx = n => fs.readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8');
// canon harus identik dengan scalp.config.canon (nilai patokan dari Python): float 1.0 / 1e-06 / -0.0 dipertahankan apa adanya
assert.equal(canon(parseRaw('{"b": 1.0, "a": [1e-06, "\\u00e9\\n", "\\"q\\"\\\\"], "c": null, "d": true, "e": -0.0}')), '{"a":[1e-06,"é\\n","\\"q\\"\\\\"],"b":1.0,"c":null,"d":true,"e":-0.0}', 'canon vs Python');
assert.ok(Number.isNaN(plain(parseRaw('{"x": NaN}')).x) && plain(parseRaw('[Infinity, -Infinity]'))[1] === -Infinity, 'NaN/Infinity ala Python');
assert.throws(() => parseRaw('{"a": 1} x'), /sisa teks/); assert.throws(() => parseRaw('{"a" 1}'), /butuh/);

// fixture dibuat oleh Journal ASLI scv5 (Python): ada float 4.123e-06, -1.0, unicode, escape, DATA_GAP
const J = loadChain(fx('scv5-journal.jsonl'));
assert.equal(J.chain.ok, true, J.chain.msg); assert.equal(J.chain.records, 23);
const EXP = JSON.parse(fx('scv5-expected.json'));            // hasil replay() Python pada fixture yang sama
assert.equal(J.rows.length, Object.keys(EXP).length);
for (const r of J.rows) for (const k of ['status', 'reason', 'r_gross', 'r_net', 'close_ts', 'fill_ts', 'tp1_ts']) assert.deepEqual(r[k], EXP[r.id][k], `replay ${r.id}.${k}`);
assert.equal(J.rows.some(r => r.id === 'TIDAK-ADA'), false, 'event untuk id asing diabaikan');
// jurnal asli produksi scv5 (2 catatan: SIGNAL lalu EXPIRE)
const REAL = loadChain(fx('scv5-real.jsonl')); assert.equal(REAL.chain.ok, true); assert.equal(REAL.rows[0].status, 'EXPIRED');
assert.equal(normalize('scv5', REAL.rows[0], ctx(0.1)).t.state, 'NOFILL');
// sabotase harus terdeteksi
const L = fx('scv5-journal.jsonl').trim().split('\n'), bad = ls => loadChain(ls.join('\n')).chain;
assert.match(bad(L.map((l, i) => i === 0 ? l.replace('"entry": 4.123e-06', '"entry": 4.2e-06') : l)).msg, /hash tidak valid di seq 0/);
assert.match(bad(L.filter((_, i) => i !== 3)).msg, /rantai putus di seq 3/);
assert.match(bad([L[1], L[0], ...L.slice(2)]).msg, /rantai putus di seq 0/);
assert.match(bad(L.map((l, i) => i === 22 ? l.replace('"ts": 1794', '"ts": 1795') : l)).msg, /seq 22/);
assert.equal(bad([...L.slice(0, 5), '{"data": {', ...L.slice(5)]).ok, false);
assert.equal(bad([]).ok, true);

// status antara (belum final) harus benar: SIGNAL -> PENDING, +FILL -> OPEN, +TP1 -> OPEN_TP1 (tetap aktif sampai CLOSE)
const mid = (...ev) => replay(ev.map(([type, data]) => ({ type, data }))).get('Z');
const sg0 = { id: 'Z', symbol: 'X', direction: 'LONG', entry: 10, stop: 9.9, created_ts: 5 };
assert.equal(mid(['SIGNAL', sg0]).status, 'PENDING');
assert.equal(mid(['SIGNAL', sg0], ['FILL', { id: 'Z', ts: 6 }]).status, 'OPEN'); assert.equal(mid(['SIGNAL', sg0], ['FILL', { id: 'Z', ts: 6 }]).fill_ts, 6);
const m1 = mid(['SIGNAL', sg0], ['FILL', { id: 'Z', ts: 6 }], ['TP1', { id: 'Z', ts: 7 }]);
assert.equal(m1.status, 'OPEN_TP1'); assert.equal(m1.tp1_ts, 7); assert.equal(normalize('scv5', m1, ctx(0.1)).t.state, 'ACTIVE');

// normalisasi seluruh fixture
const N = Object.fromEntries(J.rows.map(r => [r.id, normalize('scv5', r, ctx(0.1))]));
for (const x of Object.values(N)) assert.ok(x.t, JSON.stringify(x));
const pepe = N['PEPE-A'].t;
assert.equal(pepe.state, 'CLOSED'); assert.equal(pepe.outcome, 'SL'); assert.equal(pepe.sym, 'PEPEUSDT'); assert.equal(pepe.ai, 'TAKE'); assert.equal(pepe.epoch.slice(0, 8), '7da00c76');
ok(pepe.stopPct, 2.9833, 'scv5 stop%'); ok(pepe.rGross, -1, 'scv5 SL gross'); ok(pepe.rNative, -1.0335, 'scv5 SL net (jurnal)'); ok(pepe.rStd, -1 - 0.2 / 2.9833, 'scv5 SL std');
assert.equal(N['ETH-B'].t.outcome, 'TP'); ok(N['ETH-B'].t.rGross, 2.1488, 'scv5 TP2'); assert.equal(N['ETH-B'].t.ai, 'SKIP');
assert.equal(N['SOL-C'].t.outcome, 'PARTIAL'); ok(N['SOL-C'].t.rGross, 0.9, 'scv5 BE');
assert.equal(N['BTC-D'].t.outcome, 'TIME'); assert.equal(N['BTC-D'].t.side, 'SHORT');
assert.equal(N['INJ-E'].t.state, 'NOFILL'); assert.equal(N['LTC-F'].t.state, 'NOFILL', 'TARGET_FIRST = tidak terisi');
assert.equal(N['HBAR-G'].t.state, 'ACTIVE'); assert.equal(N['HBAR-G'].t.rStd, null); assert.equal(N['HBAR-G'].t.ai, 'N/A', 'tanpa review AI = N/A (pembanding "aturan saja")');
assert.equal(N['TRB-H'].t.state, 'CANCEL'); assert.equal(N['TRB-H'].t.outcome, 'DATA_GAP', 'celah data bukan trade');
for (const [st, rs, state] of [['PENDING', null, 'ACTIVE'], ['OPEN', null, 'ACTIVE'], ['OPEN_TP1', null, 'ACTIVE'], ['EXPIRED', 'NOT_FILLED', 'NOFILL'], ['EXPIRED', 'DATA_GAP', 'CANCEL'], ['CLOSED', 'DATA_GAP', 'CANCEL']])
  assert.equal(normalize('scv5', { symbol: 'X', direction: 'long', entry: 10, stop: 9.9, created_ts: 1, status: st, reason: rs }, ctx(0.1)).t.state, state, st + '/' + rs);
assert.ok(normalize('scv5', { symbol: 'X', direction: 'long', entry: 10, stop: 9.9, created_ts: 1, status: 'CLOSED', reason: 'ANEH' }, ctx(0.1)).err);
assert.ok(normalize('scv5', { symbol: 'X', direction: 'long', entry: 10, stop: 9.9, created_ts: 1, status: 'EXPIRED', reason: 'ANEH' }, ctx(0.1)).err);
assert.ok(normalize('scv5', { symbol: 'X', direction: 'long', entry: 10, stop: 9.9, created_ts: 1, status: 'CLOSED', reason: 'SL' }, ctx(0.1)).err, 'selesai tanpa R ditolak');
// statistik dari fixture: 4 trade selesai (SL, TP2, BE, TIMEOUT), 3 tidak dihitung (2 tidak terisi + 1 celah data)
const sv5 = summarize(Object.values(N).map(x => x.t));
assert.equal(sv5.n, 4); ok(sv5.fillRate, 4 / 7 * 100, 'scv5 fill rate'); assert.equal(sv5.win, 3);
// epoch: hash dari state.json menang; tanpa state pakai sinyal terbaru; epoch baru tanpa sinyal = nol trade
const ep = [{ tSig: 1, epoch: 'old' }, { tSig: 3, epoch: 'new' }, { tSig: 2, epoch: 'old' }];
assert.equal(pickEpoch(ep, 'abc'), 'abc'); assert.equal(pickEpoch(ep, null), 'new'); assert.equal(pickEpoch([], null), null); assert.equal(pickEpoch([{ tSig: 1 }], undefined), null);
assert.equal(ep.filter(t => t.epoch === pickEpoch(ep, 'belum-ada-sinyal')).length, 0);

// ---------- scv6: jurnal { activeSignals, closedSignals } ----------
const s6 = { id: 'SOL-SHORT-1795069397567', createdAt: '2026-11-19T06:23:17.567Z', symbol: 'SOL', pair: 'SOLUSDT', direction: 'SHORT', setupCode: 'DEVIATION_REJECTION_SHORT',
  entryLow: 74.91, entryHigh: 74.9756, initialStopLoss: 75.1726, stopLoss: 75.1726, tp1: 74.3848, tp2: 71.2832, rr: 13.81, stopDistancePct: 0.35 };
r = normalize('scv6', { ...s6, status: 'ACTIVE' }, ctx(0));
assert.equal(r.t.state, 'ACTIVE'); assert.equal(r.t.sym, 'SOLUSDT'); assert.equal(r.t.side, 'SHORT'); assert.equal(r.t.rStd, null); ok(r.t.stopPct, 0.35, 'scv6 stop%');
r = normalize('scv6', { ...s6, status: 'STOPPED_OUT', closedAt: '2026-11-19T07:00:00.000Z', realizedR: -1 }, ctx(0));
assert.equal(r.t.outcome, 'SL'); ok(r.t.rGross, -1, 'scv6 SL gross'); ok(r.t.rNative, -1, 'scv6 native'); ok(r.t.rStd, -1 - 0.2 / 0.35, 'scv6 SL std'); assert.ok(r.t.tOut > r.t.tSig);
for (const [st, state, oc] of [['TP2_FULL_WIN', 'CLOSED', 'TP'], ['TP1_BE_PROTECTED', 'CLOSED', 'PARTIAL'], ['TP1_EXPIRED_PROFIT', 'CLOSED', 'TIME'], ['EXPIRED_NO_FILL', 'NOFILL', null]]) {
  const x = normalize('scv6', { ...s6, status: st, closedAt: '2026-11-19T07:00:00.000Z', realizedR: 0.9 }, ctx(0)).t;
  assert.equal(x.state, state, st); if (oc) assert.equal(x.outcome, oc, st);
}
assert.ok(normalize('scv6', { ...s6, status: 'ANEH' }, ctx(0)).err);
assert.ok(normalize('scv6', { ...s6, status: 'STOPPED_OUT', realizedR: null }, ctx(0)).err, 'selesai tanpa R ditolak');
console.log('selftest OK');
