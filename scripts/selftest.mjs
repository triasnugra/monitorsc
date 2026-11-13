import assert from 'node:assert/strict';
import { normalize, summarize, gates, tCrit } from './lib.mjs';
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
console.log('selftest OK');
