import * as THREE from 'three';
import './style.css';
import { DEFAULTS, RULES, MODES, TEAM_NAMES } from '../shared/rules.js';
import { LEVELS } from '../shared/ai.js';
import { Stage } from './view/stage.js';
import { initAudio, sfx, setMuted, isMuted } from './view/audio.js';
import { LocalInput } from './input.js';
import { LocalSession } from './session-local.js';
import { OnlineSession } from './session-online.js';
import { Net } from './net.js';
import { Hud } from './hud.js';

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* noop */ } },
};

// ---------- 연습 모드 수치 조절 ----------
const TUNE = [
  ['packTime', '눈 하나 뭉치는 시간', 0.3, 2, 0.05, '초'],
  ['chargeTime', '최대 차지까지 걸리는 시간', 0.3, 2, 0.05, '초'],
  ['minRange', '최소 사거리', 4, 14, 0.5, 'm'],
  ['maxRange', '최대 사거리', 10, 30, 0.5, 'm'],
  ['speed', '이동 속도', 3, 10, 0.25, 'm/s'],
  ['chargeSlow', '차지 중 이동 속도 배율', 0.2, 1, 0.05, '배'],
  ['dashCooldown', '대시 쿨타임', 0.5, 5, 0.25, '초'],
];
const CFG = { ...DEFAULTS };
try {
  const saved = JSON.parse(store.get('snow-cfg', '{}'));
  for (const k of Object.keys(DEFAULTS)) if (typeof saved[k] === 'number') CFG[k] = saved[k];
} catch { /* noop */ }

// ---------- 렌더러 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // 레티나에서 4배 픽셀을 그리지 않게
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

const input = new LocalInput(renderer.domElement);
const hud = new Hud();
let stage = null, session = null;
let kind = 'menu'; // menu | practice | online
let paused = false;
let watch = {};
const practice = { mode: store.get('snow-pmode', '1v1'), level: store.get('snow-level', 'normal') };
const online = { mode: store.get('snow-omode', '2v2') };
if (!MODES[practice.mode]) practice.mode = '1v1';
if (!LEVELS[practice.level]) practice.level = 'normal';
if (!MODES[online.mode]) online.mode = '2v2';

function mount(sess, opts) {
  stage?.dispose();
  session = sess;
  stage = new Stage(renderer, { mode: sess.mode, roster: sess.roster, meId: sess.meId, hud, ...opts });
  input.camera = stage.camera;
  input.flip = stage.flip;
  input.getMe = () => (session.meId >= 0 ? (session.me || session.game.get(session.meId)) : null);
  input.aimMode = 'mouse';
  document.body.classList.toggle('team1', stage.myTeam === 1);
  input.releaseAll();
  watch = {};
  paused = false;
}

function show(id) {
  for (const o of ['menu', 'invite', 'lobby', 'result', 'pause']) $(o).hidden = o !== id;
}

function startDemo() {
  kind = 'menu';
  document.body.classList.remove('online', 'playing');
  mount(new LocalSession({ mode: '2v2', cfg: DEFAULTS, demo: true }), { local: true, quiet: true });
  hud.hide();
}

function startPractice() {
  initAudio();
  kind = 'practice';
  document.body.classList.remove('online');
  document.body.classList.add('playing');
  mount(new LocalSession({ mode: practice.mode, level: practice.level, cfg: CFG }), { local: true });
  hud.setup(practice.mode, 0, session.roster, session.meId);
  show(null);
}

function startOnline(msg) {
  initAudio();
  kind = 'online';
  document.body.classList.add('online', 'playing');
  mount(new OnlineSession(net, msg), { local: false });
  hud.setup(msg.mode, stage.myTeam, msg.roster, msg.you);
  show(null);
}

// 카운트다운, 라운드 결과, 경기 결과 배너
function watchFlow(rs) {
  const my = stage.myTeam;
  if (rs.state !== watch.state || rs.round !== watch.round) {
    watch = { state: rs.state, round: rs.round, cd: -1, shown: false };
    if (rs.state === 'countdown') hud.banner(`${rs.round}라운드`, 'round', 800);
    if (rs.state === 'matchEnd') {
      const win = rs.score[my] > rs.score[1 - my];
      hud.showResult(win, [rs.score[my], rs.score[1 - my]], kind === 'online');
    }
  }
  if (rs.state === 'countdown') {
    const idx = [0.9, 1.5, 2.1].filter(t => rs.stateT >= t).length - 1;
    if (idx > watch.cd) { watch.cd = idx; hud.banner(String(3 - idx), 'num', 550); sfx.tick(); }
  }
  if (rs.state === 'roundEnd' && !watch.shown && rs.stateT > 0.9) {
    watch.shown = true;
    const won = rs.winner === my;
    hud.banner(won ? '라운드 승리!' : '라운드 패배', won ? 'win' : 'lose', 1600);
    (won ? sfx.win : sfx.lose)();
  }
}

// ---------- 루프 ----------
let last = performance.now();
let fps = 60, ping = null, infoT = 0;
function frame(now) {
  const rawDt = (now - last) / 1000;
  const realDt = Math.min(rawDt, 0.05);
  last = now;
  if (rawDt > 0) fps += (1 / rawDt - fps) * 0.05;
  infoT -= rawDt;
  if (infoT <= 0) {
    infoT = 0.5;
    $('netInfo').textContent = `${Math.round(fps)}fps${kind === 'online' && ping !== null ? ` · 핑 ${ping}ms` : ''}`;
  }
  if (session && !paused) {
    let dt = realDt;
    if (session instanceof LocalSession) {
      session.tick(realDt, kind === 'practice' ? input : null, stage.fx);
      dt = session.dt;
      if (kind === 'menu' && session.game.state === 'matchEnd' && session.game.stateT > 3) session.restart();
    } else {
      session.tick(realDt, input);
    }
    const rs = session.renderState(now / 1000);
    if (rs) {
      for (const e of session.takeEvents()) stage.present(e);
      if (kind !== 'menu') watchFlow(rs);
      stage.update(rs, dt, realDt);
      if (kind !== 'menu') hud.update(rs, rs.me, rs.cfg);
    }
  }
  stage?.render();
  requestAnimationFrame(frame);
}

function setPause(on) {
  if (kind !== 'practice') return;
  const st = session?.game.state;
  if (on && st !== 'play' && st !== 'countdown') return;
  paused = on;
  $('pause').hidden = !on;
  input.releaseAll();
  last = performance.now();
}
addEventListener('blur', () => setPause(true));
addEventListener('keydown', e => { if (e.code === 'Escape') setPause(!paused); });
$('pause').addEventListener('click', () => setPause(false));
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  stage?.resize();
});

// ---------- 온라인 ----------
let net = null;
let lobbyMsg = null;

function onNet(m) {
  if (m.t === 'lobby') {
    lobbyMsg = m;
    if (kind === 'online') startDemo();
    renderLobby(m);
    show('lobby');
  } else if (m.t === 'start') {
    startOnline(m);
  } else if (m.t === 'snap') {
    if (session instanceof OnlineSession) session.onSnap(m);
  } else if (m.t === 'error') {
    if (!$('lobby').hidden) $('lobbyMsg').textContent = m.msg;
    else menuMsg(m.msg);
    if (!$('invite').hidden) $('inviteForm').querySelector('button').disabled = false;
  } else if (m.t === 'left') {
    toMenu();
  } else if (m.t === 'pong') {
    ping = Math.round(performance.now() - m.c);
  }
}

function onNetClose() {
  net = null;
  const was = kind === 'online' || !$('lobby').hidden;
  if (was) { toMenu(); menuMsg('서버와 연결이 끊겼어요'); }
}

setInterval(() => { if (net && net.open) net.send({ t: 'ping', c: performance.now() }); }, 2000);

async function ensureNet() {
  if (net && net.open) return net;
  menuMsg('서버에 연결하는 중이에요. 서버가 자고 있었다면 1분 정도 걸릴 수 있어요');
  net = new Net(onNet, onNetClose);
  try {
    await net.connect();
    menuMsg('');
    return net;
  } catch (e) {
    net = null;
    menuMsg(e.message === 'no-server'
      ? '이 페이지에서는 온라인을 쓸 수 없어요. 배포된 서버 주소에서 열어 주세요'
      : '서버에 연결할 수 없어요. 잠시 후 다시 해 주세요');
    throw e;
  }
}

function nick(id = 'nick') {
  const n = $(id).value.trim().slice(0, 10) || '플레이어';
  store.set('snow-nick', n);
  return n;
}

// 지금 보이는 화면(메뉴 또는 초대 화면)에 안내 문구를 띄운다
function menuMsg(t) {
  $('menuMsg').textContent = t;
  $('inviteMsg').textContent = t;
}

function toMenu() {
  if (kind !== 'menu') startDemo();
  hud.hideResult();
  show('menu');
}

function renderLobby(m) {
  $('inviteForm').querySelector('button').disabled = false;
  $('roomCode').textContent = m.code;
  $('lobbyMode').textContent = MODES[m.mode].label;
  $('lobbyMsg').textContent = '';
  const box = $('teams');
  box.innerHTML = '';
  m.slots.forEach((team, t) => {
    const col = document.createElement('div');
    col.className = `team t${t}`;
    const h = document.createElement('h3');
    h.textContent = TEAM_NAMES[t];
    col.appendChild(h);
    const meHere = team.some(s => s && s.you);
    team.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = `seat${s ? '' : ' empty'}${s && s.you ? ' you' : ''}`;
      const label = document.createElement('span');
      label.textContent = s ? `${s.name}${s.bot ? ' (AI)' : ''}${s.host ? ', 방장' : ''}${s.you ? ' (나)' : ''}` : '빈자리';
      row.appendChild(label);
      if (!s && m.host) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'mini'; b.textContent = 'AI 넣기';
        b.onclick = () => net?.send({ t: 'bot', team: t });
        row.appendChild(b);
      }
      if (s && s.bot && m.host) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'mini ghost'; b.textContent = '빼기';
        b.onclick = () => net?.send({ t: 'kick', team: t, slot: i });
        row.appendChild(b);
      }
      col.appendChild(row);
    });
    if (!meHere && team.some(s => !s)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ghost move'; b.textContent = '이 팀으로 옮기기';
      b.onclick = () => net?.send({ t: 'team', team: t });
      col.appendChild(b);
    }
    box.appendChild(col);
  });
  const full = m.slots.flat().every(Boolean);
  $('startOnline').hidden = !m.host;
  $('startOnline').disabled = !full;
  $('lobbyHint').textContent = m.host
    ? (full ? '모두 모였어요. 시작하세요!' : '친구에게 초대 링크를 보내거나 빈자리에 AI를 넣으세요')
    : '방장이 시작하기를 기다리는 중이에요';
}

function roomLink(code) {
  const u = new URL(location.href);
  const srv = new URLSearchParams(location.search).get('server');
  u.search = '';
  u.hash = '';
  u.searchParams.set('room', code);
  if (srv) u.searchParams.set('server', srv);
  return u.toString();
}

// ---------- 메뉴 버튼 ----------
function bindChoice(boxId, items, get, setFn) {
  const box = $(boxId);
  box.innerHTML = items.map(([k, label]) => `<button type="button" data-k="${k}">${label}</button>`).join('');
  const sync = () => box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === get())));
  box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { setFn(b.dataset.k); sync(); }));
  sync();
}
const modeItems = Object.entries(MODES).map(([k, v]) => [k, v.label]);
bindChoice('pMode', modeItems, () => practice.mode, k => { practice.mode = k; store.set('snow-pmode', k); });
bindChoice('pLevel', Object.entries(LEVELS).map(([k, v]) => [k, v.label]), () => practice.level, k => { practice.level = k; store.set('snow-level', k); });
bindChoice('oMode', modeItems, () => online.mode, k => { online.mode = k; store.set('snow-omode', k); });

$('nick').value = store.get('snow-nick', '');
$('goPractice').addEventListener('click', startPractice);
$('createRoom').addEventListener('click', async () => {
  initAudio();
  try { await ensureNet(); } catch { return; }
  net.send({ t: 'create', mode: online.mode, name: nick() });
});
$('joinForm').addEventListener('submit', async e => {
  e.preventDefault();
  initAudio();
  const code = $('joinCode').value.trim().toUpperCase();
  if (code.length !== 4) { menuMsg('방 코드 4자리를 넣어 주세요'); return; }
  try { await ensureNet(); } catch { return; }
  net.send({ t: 'join', code, name: nick() });
});
$('leaveRoom').addEventListener('click', () => { net?.send({ t: 'leave' }); toMenu(); });
$('startOnline').addEventListener('click', () => net?.send({ t: 'start' }));
$('copyLink').addEventListener('click', async () => {
  const link = roomLink(lobbyMsg?.code || '');
  try {
    await navigator.clipboard.writeText(link);
    $('copyLink').textContent = '복사했어요';
  } catch {
    $('lobbyMsg').textContent = link;
  }
  setTimeout(() => { $('copyLink').textContent = '초대 링크 복사'; }, 1500);
});
$('again').addEventListener('click', () => { hud.hideResult(); startPractice(); });
$('toTitle').addEventListener('click', toMenu);
$('quit').addEventListener('click', () => {
  if (kind === 'online') net?.send({ t: 'leave' });
  toMenu();
});

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
    store.set('snow-cfg', JSON.stringify(CFG));
    if (kind === 'practice') Object.assign(session.game.cfg, CFG);
  });
}
$('resetCfg').addEventListener('click', () => {
  Object.assign(CFG, DEFAULTS);
  syncTune();
  store.set('snow-cfg', '{}');
  if (kind === 'practice') Object.assign(session.game.cfg, CFG);
});
syncTune();

// 초대 링크로 들어온 경우: 이름만 적고 바로 입장하는 화면
const invite = (new URLSearchParams(location.search).get('room') || '').toUpperCase().slice(0, 4);
$('inviteNick').value = store.get('snow-nick', '');
$('inviteForm').addEventListener('submit', async e => {
  e.preventDefault();
  initAudio();
  const btn = $('inviteForm').querySelector('button');
  btn.disabled = true;
  try { await ensureNet(); } catch { btn.disabled = false; return; }
  $('nick').value = $('inviteNick').value;
  net.send({ t: 'join', code: invite, name: nick('inviteNick') });
});
$('inviteSkip').addEventListener('click', () => {
  history.replaceState(null, '', location.pathname + location.search.replace(/([?&])room=[^&]*&?/, '$1').replace(/[?&]$/, ''));
  menuMsg('');
  show('menu');
});

startDemo();
if (invite.length === 4) {
  $('inviteCode').textContent = invite;
  $('joinCode').value = invite;
  show('invite');
  setTimeout(() => $('inviteNick').focus(), 50);
} else show('menu');
if (location.search.includes('debug')) window.__snow = { get session() { return session; }, get stage() { return stage; }, RULES };
requestAnimationFrame(frame);
