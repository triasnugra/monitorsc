// Pembaca jurnal scv5: data/journal.jsonl = rantai event berhash SHA-256 (SIGNAL, FILL, TP1, CLOSE, EXPIRE).
// Monitor memverifikasi ulang rantai itu SECARA INDEPENDEN lalu menurunkan state sinyal lewat replay
// (logika sama dengan scalp/journal.py: replay), sehingga jurnal yang diubah/dihapus terdeteksi.
import crypto from 'node:crypto';

export const GENESIS = '0'.repeat(64);

// ---------- parser JSON yang mempertahankan teks asli angka ----------
// Hash scv5 dihitung dari json.dumps(sort_keys, separators=(",",":"), ensure_ascii=False) milik Python.
// Float Python dan JS beda format (Python: 4e-06, -1.0; JS: 0.000004, -1), jadi angka TIDAK boleh
// di-format ulang oleh JS. File ditulis Python, maka teks angka di file = repr Python = yang dipakai saat hash.
class Num { constructor(raw) { this.raw = raw; } }
const NUM_RE = /-?(?:Infinity|NaN|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/y;   // Python juga menulis NaN/Infinity

export function parseRaw(s) {
  let i = 0;
  const fail = m => { throw new Error(`JSON tidak valid pada posisi ${i}: ${m}`); };
  const ws = () => { while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n' || s[i] === '\r')) i++; };
  const str = () => {
    i++;                                                       // lewati "
    let out = '';
    for (;;) {
      if (i >= s.length) fail('string tidak ditutup');
      const c = s[i++];
      if (c === '"') return out;
      if (c !== '\\') { out += c; continue; }
      const x = s[i++];
      if (x === 'u') { const h = s.slice(i, i + 4); if (!/^[0-9a-fA-F]{4}$/.test(h)) fail('escape \\u salah'); out += String.fromCharCode(parseInt(h, 16)); i += 4; }
      else if (x in { '"': 1, '\\': 1, '/': 1 }) out += x;
      else if (x === 'b') out += '\b'; else if (x === 'f') out += '\f'; else if (x === 'n') out += '\n';
      else if (x === 'r') out += '\r'; else if (x === 't') out += '\t'; else fail('escape tidak dikenal');
    }
  };
  const val = () => {
    ws();
    const c = s[i];
    if (c === '{') {
      i++; const o = {}; ws();
      if (s[i] === '}') { i++; return o; }
      for (;;) {
        ws(); if (s[i] !== '"') fail('kunci objek harus string');
        const k = str(); ws(); if (s[i++] !== ':') fail("butuh ':'");
        o[k] = val(); ws();
        const d = s[i++]; if (d === '}') return o; if (d !== ',') fail("butuh ',' atau '}'");
      }
    }
    if (c === '[') {
      i++; const a = []; ws();
      if (s[i] === ']') { i++; return a; }
      for (;;) { a.push(val()); ws(); const d = s[i++]; if (d === ']') return a; if (d !== ',') fail("butuh ',' atau ']'"); }
    }
    if (c === '"') return str();
    if (s.startsWith('true', i)) { i += 4; return true; }
    if (s.startsWith('false', i)) { i += 5; return false; }
    if (s.startsWith('null', i)) { i += 4; return null; }
    NUM_RE.lastIndex = i; const m = NUM_RE.exec(s);
    if (!m) fail('token tidak dikenal');
    i += m[0].length; return new Num(m[0]);
  };
  const v = val(); ws();
  if (i !== s.length) fail('sisa teks setelah nilai');
  return v;
}

// pohon mentah -> nilai biasa (angka jadi Number)
export function plain(n) {
  if (n instanceof Num) return Number(n.raw);
  if (Array.isArray(n)) return n.map(plain);
  if (n && typeof n === 'object') { const o = {}; for (const k of Object.keys(n)) o[k] = plain(n[k]); return o; }
  return n;
}

// padanan scalp.config.canon: kunci terurut, tanpa spasi, non-ASCII apa adanya
export function canon(n) {
  if (n instanceof Num) return n.raw;
  if (n === null) return 'null';
  if (typeof n === 'boolean') return n ? 'true' : 'false';
  if (typeof n === 'string') return JSON.stringify(n);
  if (Array.isArray(n)) return '[' + n.map(canon).join(',') + ']';
  return '{' + Object.keys(n).sort().map(k => JSON.stringify(k) + ':' + canon(n[k])).join(',') + '}';
}

const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// padanan Journal.verify: rantai prev + hash tiap catatan
export function verifyChain(nodes) {
  let prev = GENESIS;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n || typeof n !== 'object' || Array.isArray(n)) return { ok: false, msg: `catatan ke-${i} bukan objek`, records: nodes.length, head: prev };
    if (plain(n.prev) !== prev) return { ok: false, msg: `rantai putus di seq ${i}: prev tidak cocok`, records: nodes.length, head: prev };
    const body = {}; for (const k of Object.keys(n)) if (k !== 'hash') body[k] = n[k];
    if (sha(canon(body)) !== n.hash) return { ok: false, msg: `hash tidak valid di seq ${i}: catatan diubah`, records: nodes.length, head: prev };
    prev = n.hash;
  }
  return { ok: true, msg: `OK (${nodes.length} catatan)`, records: nodes.length, head: prev };
}

// padanan scalp.journal.replay: state sinyal diturunkan dari event
export function replay(recs) {
  const sigs = new Map();
  for (const r of recs) {
    const d = r.data, t = r.type;
    if (!d || typeof d !== 'object') continue;
    if (t === 'SIGNAL') { sigs.set(d.id, { ...d, status: 'PENDING', fill_ts: null, tp1_ts: null, close_ts: null, reason: null, r_net: null, r_gross: null }); continue; }
    const s = sigs.get(d.id);
    if (!s) continue;
    if (t === 'FILL') Object.assign(s, { status: 'OPEN', fill_ts: d.ts });
    else if (t === 'TP1') Object.assign(s, { status: 'OPEN_TP1', tp1_ts: d.ts });
    else if (t === 'CLOSE') Object.assign(s, { status: 'CLOSED', close_ts: d.ts, reason: d.reason, r_net: d.r_net, r_gross: d.r_gross });
    else if (t === 'EXPIRE') Object.assign(s, { status: 'EXPIRED', close_ts: d.ts, reason: d.reason });
  }
  return sigs;
}

// teks jurnal -> { rows: state sinyal, chain: hasil verifikasi }
// Baris yang tidak bisa di-parse menghentikan pembacaan; rantai ditandai rusak (bukan error jaringan).
export function loadChain(text) {
  const lines = String(text).split('\n').map(l => l.trim()).filter(Boolean);
  const nodes = []; let broken = null;
  for (let k = 0; k < lines.length; k++) {
    try { nodes.push(parseRaw(lines[k])); }
    catch (e) { broken = `baris ${k + 1} rusak: ${e.message}`; break; }
  }
  const chain = verifyChain(nodes);
  if (broken && chain.ok) Object.assign(chain, { ok: false, msg: broken });
  else if (broken) chain.msg += `; ${broken}`;
  const rows = [...replay(nodes.map(plain)).values()];
  return { rows, chain };
}

// Forward-test scv5 hanya menghitung hash strategi terkini (epoch). Ubah parameter = epoch baru, statistik mulai dari nol.
// Pakai hash dari state.json mesin bila ada (otoritatif, benar juga saat epoch baru belum punya sinyal); jika tidak, hash sinyal terbaru.
export function pickEpoch(trades, stateHash) {
  if (stateHash) return stateHash;
  let best = null;
  for (const t of trades) if (t.epoch && (!best || t.tSig >= best.tSig)) best = t;
  return best ? best.epoch : null;
}
