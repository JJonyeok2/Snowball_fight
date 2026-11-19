import * as THREE from 'three';
import './style.css';
import { CFG, RULES, TUNE, saveCfg, resetCfg } from './config.js';
import { createWorld } from './world.js';
import { Effects } from './effects.js';
import { Walls } from './walls.js';
import { Snowballs, launch, SPAWN_OFFSET } from './snowballs.js';
import { Fighter } from './fighter.js';
import { Bot, LEVELS } from './ai.js';
import { LocalInput } from './input.js';
import { initAudio, sfx, setMuted, isMuted } from './audio.js';
import { Hud } from './hud.js';

const $ = id => document.getElementById(id);

// ---------- 렌더러 / 씬 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 24, 21);
camera.lookAt(0, 0, 0.6);

const world = createWorld(scene);
const fx = new Effects(scene, camera);
const walls = new Walls(scene);
const balls = new Snowballs(scene, fx);
const me = new Fighter(scene, { color: '#e0483e', accent: '#ffcf5a', side: 1, name: '나' });
const foe = new Fighter(scene, { color: '#3a6fd8', accent: '#8fe3d2', side: -1, name: '상대', isBot: true });
const bot = new Bot(foe, me);
const input = new LocalInput(renderer.domElement, camera);
const hud = new Hud();

// 조준 곡선 미리보기
const TN = 36;
const trajGeo = new THREE.BufferGeometry();
trajGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TN * 3), 3));
const traj = new THREE.Line(trajGeo, new THREE.LineDashedMaterial({ color: '#e0483e', dashSize: 0.32, gapSize: 0.2 }));
const landRing = new THREE.Mesh(
  new THREE.RingGeometry(0.35, 0.52, 32),
  new THREE.MeshBasicMaterial({ color: '#e0483e', transparent: true, opacity: 0.8, depthWrite: false }),
);
landRing.rotation.x = -Math.PI / 2;
traj.visible = landRing.visible = false;
scene.add(traj, landRing);

function updatePreview() {
  traj.visible = landRing.visible = me.charging;
  if (!me.charging) return;
  const L = launch(me.chargeFrac), a = trajGeo.attributes.position.array;
  const sx = me.pos.x + me.dir.x * SPAWN_OFFSET, sz = me.pos.z + me.dir.z * SPAWN_OFFSET;
  for (let i = 0; i < TN; i++) {
    const t = (L.t * i) / (TN - 1);
    a[i * 3] = sx + me.dir.x * L.vh * t;
    a[i * 3 + 1] = Math.max(0.05, RULES.throwHeight + L.vy * t - 0.5 * RULES.gravity * t * t);
    a[i * 3 + 2] = sz + me.dir.z * L.vh * t;
  }
  trajGeo.attributes.position.needsUpdate = true;
  traj.computeLineDistances();
  landRing.position.set(sx + me.dir.x * L.range, 0.06, sz + me.dir.z * L.range);
  hud.setRange(L.range);
}

// ---------- 게임 흐름 ----------
const G = { state: 'title', t: 0, time: 0, round: 1, score: { me: 0, foe: 0 }, paused: false, step: -1 };

const ctx = {
  active: false, walls, effects: fx, time: 0,
  onThrow: (f, c) => { balls.spawn(f, c); sfx.throw(c); },
  onDash: f => { sfx.dash(); fx.burst(f.pos.clone().setY(0.2), 8, 2, 0.8); },
  onEmpty: f => { if (f === me) { hud.toast('눈이 없어요. Space를 꾹 눌러 뭉치세요'); sfx.empty(); } },
  onPackTick: f => sfx.pack(f === me ? 1 : 0.45),
  onBallReady: f => { if (f === me) sfx.ready(); },
};

const hits = {
  fighter(f, b) {
    const p = b.m.position.clone();
    f.takeHit(b.v);
    fx.burst(p, 26, 5, 1.2, b.v);
    fx.hitStop(0.07);
    fx.addShake(f === me ? 0.6 : 0.32);
    sfx.hit();
    if (f.hp <= 0 && G.state === 'play') endRound(f === me ? foe : me, f, p);
  },
  wall(w, b) {
    const broke = walls.hit(w, b.v);
    fx.burst(b.m.position.clone(), 12, 3);
    if (broke) {
      fx.burst(new THREE.Vector3(w.x, 0.5, w.z), 30, 4.5, 1.3);
      fx.addShake(0.2);
      sfx.wallBreak();
    } else sfx.wall();
  },
  ground(b) {
    const p = b.m.position;
    fx.burst(p.clone().setY(0.15), 8, 2, 0.8);
    fx.mark(p.x, p.z);
    sfx.ground();
  },
};

function startMatch() {
  G.score.me = G.score.foe = 0;
  G.round = 1;
  hud.hideResult();
  $('start').hidden = true;
  startRound();
}

function startRound() {
  me.reset();
  foe.reset();
  walls.reset();
  balls.clear();
  fx.clear();
  bot.reset();
  G.state = 'countdown';
  G.t = 0;
  G.step = -1;
}

function endRound(winner, loser, p) {
  G.state = 'roundEnd';
  G.t = 0;
  G.step = 0;
  loser.down = true;
  winner.win = true;
  G.score[winner === me ? 'me' : 'foe']++;
  fx.slowMo(1.1, p);
}

const COUNT = [[0, () => hud.banner(`${G.round}라운드`, 'round', 800)],
  [0.9, () => { hud.banner('3', 'num', 550); sfx.tick(); }],
  [1.5, () => { hud.banner('2', 'num', 550); sfx.tick(); }],
  [2.1, () => { hud.banner('1', 'num', 550); sfx.tick(); }],
  [2.7, () => { hud.banner('던져!', 'go', 700); sfx.go(); G.state = 'play'; }]];

function flow() {
  if (G.state === 'countdown') {
    while (G.step + 1 < COUNT.length && G.t >= COUNT[G.step + 1][0]) COUNT[++G.step][1]();
  } else if (G.state === 'roundEnd') {
    const meWon = me.win;
    if (G.step === 0 && G.t > 0.9) {
      G.step = 1;
      hud.banner(meWon ? '라운드 승리!' : '라운드 패배', meWon ? 'win' : 'lose', 1600);
      (meWon ? sfx.win : sfx.lose)();
    }
    if (G.t > 3.0) {
      if (G.score.me >= RULES.roundsToWin || G.score.foe >= RULES.roundsToWin) {
        G.state = 'matchEnd';
        hud.showResult(G.score.me > G.score.foe, G.score);
      } else {
        G.round++;
        startRound();
      }
    }
  }
}

// ---------- 루프 ----------
let last = performance.now();
function frame(now) {
  const realDt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!G.paused) step(realDt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function step(realDt) {
  const dt = fx.scale(realDt);
  G.t += realDt;
  G.time += dt;
  ctx.time = G.time;
  flow();
  ctx.active = G.state === 'play';
  input.update();
  if (ctx.active) bot.update(dt, balls, walls);
  me.update(dt, input.intent, ctx);
  foe.update(dt, bot.intent, ctx);
  balls.update(dt, [me, foe], walls, hits);
  walls.update(dt);
  fx.update(dt, realDt);
  world.update(dt, G.time);
  updatePreview();
  hud.update(me, foe, G);
}

function pause(on) {
  if (on && !['play', 'countdown'].includes(G.state)) return;
  G.paused = on;
  $('pause').hidden = !on;
  input.releaseAll();
  last = performance.now();
}

addEventListener('blur', () => pause(true));
addEventListener('keydown', e => { if (e.code === 'Escape') pause(!G.paused); });
$('pause').addEventListener('click', () => pause(false));
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- 화면 버튼 ----------
let level = 'normal';
try { level = localStorage.getItem('snow-level') || 'normal'; } catch { /* noop */ }
if (!LEVELS[level]) level = 'normal';
function setLevel(l) {
  level = l;
  bot.level = l;
  document.querySelectorAll('[data-lvl]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lvl === l)));
  try { localStorage.setItem('snow-level', l); } catch { /* noop */ }
}
document.querySelectorAll('.levels').forEach(box => {
  box.innerHTML = Object.entries(LEVELS).map(([k, v]) => `<button type="button" data-lvl="${k}">${v.label}</button>`).join('');
});
document.querySelectorAll('[data-lvl]').forEach(b => b.addEventListener('click', () => setLevel(b.dataset.lvl)));
setLevel(level);

$('go').addEventListener('click', () => { initAudio(); startMatch(); });
$('again').addEventListener('click', () => { initAudio(); startMatch(); });
$('toTitle').addEventListener('click', () => { hud.hideResult(); $('start').hidden = false; G.state = 'title'; });

$('mute').checked = isMuted();
$('mute').addEventListener('change', e => setMuted(e.target.checked));

$('tuneRows').innerHTML = TUNE.map(([k, l, mn, mx, st]) =>
  `<label class="row"><span>${l}</span><output id="o-${k}"></output><input type="range" id="t-${k}" min="${mn}" max="${mx}" step="${st}"></label>`).join('');
function syncTune() {
  for (const [k, , , , , u] of TUNE) {
    $(`t-${k}`).value = CFG[k];
    $(`o-${k}`).textContent = `${+(+CFG[k]).toFixed(2)}${u}`;
  }
}
for (const [k] of TUNE) {
  $(`t-${k}`).addEventListener('input', e => {
    CFG[k] = +e.target.value;
    if (CFG.minRange > CFG.maxRange) CFG[k === 'minRange' ? 'maxRange' : 'minRange'] = CFG[k];
    syncTune();
    saveCfg();
  });
}
$('resetCfg').addEventListener('click', () => { resetCfg(); syncTune(); });
syncTune();

if (location.search.includes('debug')) window.__snow = { G, me, foe, bot, balls, walls };
requestAnimationFrame(frame);
