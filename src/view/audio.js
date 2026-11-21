// 효과음은 파일 없이 Web Audio로 합성한다.
let ctx = null, master = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('snow-mute') === '1'; } catch { /* noop */ }
const VOL = 0.55;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOL;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
}

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : VOL;
  try { localStorage.setItem('snow-mute', m ? '1' : '0'); } catch { /* noop */ }
}

function env(g, t0, vol, attack, dur) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function noise(dur, o = {}) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + (o.delay || 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = o.type || 'bandpass';
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.f0 || 1000, t0);
  f.frequency.exponentialRampToValueAtTime(o.f1 || o.f0 || 1000, t0 + dur);
  const g = ctx.createGain();
  env(g, t0, o.vol ?? 0.3, o.attack ?? 0.005, dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.05);
}

function tone(f0, f1, dur, o = {}) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + (o.delay || 0);
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = ctx.createGain();
  env(g, t0, o.vol ?? 0.3, o.attack ?? 0.005, dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  pack: (v = 1) => noise(0.08, { f0: 1900, f1: 900, q: 2.5, vol: 0.22 * v }),
  ready: () => tone(660, 990, 0.09, { type: 'triangle', vol: 0.14 }),
  throw: c => noise(0.22, { f0: 500, f1: 2200 + c * 1600, q: 1.3, vol: 0.32 }),
  hit: () => {
    tone(160, 55, 0.2, { vol: 0.65 });
    noise(0.14, { type: 'lowpass', f0: 1400, f1: 300, vol: 0.55 });
  },
  wall: () => noise(0.13, { type: 'lowpass', f0: 2200, f1: 500, vol: 0.35 }),
  wallBreak: () => {
    noise(0.5, { type: 'lowpass', f0: 2600, f1: 180, vol: 0.55 });
    tone(95, 40, 0.35, { vol: 0.3 });
  },
  ground: () => noise(0.07, { type: 'lowpass', f0: 900, f1: 350, vol: 0.13 }),
  dash: () => noise(0.16, { f0: 1400, f1: 3600, q: 2, vol: 0.2 }),
  stone: () => {
    noise(0.12, { f0: 2500, f1: 5000, q: 3, vol: 0.28 });
    tone(1400, 900, 0.07, { type: 'triangle', vol: 0.1 });
  },
  clink: () => [1800, 2600].forEach((f, i) => tone(f, f * 0.9, 0.12, { type: 'triangle', vol: 0.12, delay: i * 0.03 })),
  drop: () => tone(1500, 500, 1.0, { type: 'sine', vol: 0.06 }),
  land: () => { noise(0.18, { type: 'lowpass', f0: 1200, f1: 300, vol: 0.3 }); tone(220, 90, 0.2, { vol: 0.25 }); },
  pickup: () => [880, 1175, 1568].forEach((f, i) => tone(f, f, 0.12, { type: 'triangle', vol: 0.14, delay: i * 0.06 })),
  cancel: () => tone(520, 260, 0.12, { type: 'sine', vol: 0.12 }),
  empty: () => tone(220, 180, 0.08, { type: 'square', vol: 0.05 }),
  tick: () => tone(520, 520, 0.09, { type: 'square', vol: 0.07 }),
  go: () => tone(784, 784, 0.22, { type: 'square', vol: 0.09 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.18, { type: 'triangle', vol: 0.18, delay: i * 0.09 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, f * 0.97, 0.24, { type: 'triangle', vol: 0.16, delay: i * 0.14 })),
};
