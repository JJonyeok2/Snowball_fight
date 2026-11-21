import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game } from '../shared/sim.js';
import { Bot } from '../shared/ai.js';
import { MODES, RULES, DEFAULTS } from '../shared/rules.js';

const PORT = Number(process.env.PORT) || 8080;
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const TICK = 1 / RULES.tickRate;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};

// ---------- 정적 파일 (빌드된 클라이언트) ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.end('ok'); return; }
  let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch { file = join(DIST, 'index.html'); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('클라이언트 빌드가 없어요. npm run build 를 먼저 실행하세요.');
  }
});

// ---------- 방 ----------
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => {
  let c;
  do c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  while (rooms.has(c));
  return c;
};
const BOT_NAMES = ['눈사람', '고드름', '눈송이', '털장갑'];
let clientSeq = 0;

class Room {
  constructor(mode) {
    this.code = newCode();
    this.mode = mode;
    this.M = MODES[mode];
    this.clients = new Map(); // cid -> client
    this.host = null;
    // slots[team][slot] = null | { kind: 'human', cid } | { kind: 'bot', name }
    this.slots = [0, 1].map(() => Array(this.M.teamSize).fill(null));
    this.game = null;
    rooms.set(this.code, this);
  }

  humans() { return [...this.clients.values()]; }

  freeSlot(prefer) {
    for (const team of [prefer, 1 - prefer]) {
      const slot = this.slots[team].indexOf(null);
      if (slot >= 0) return { team, slot };
    }
    return null;
  }

  join(c) {
    const red = this.slots[0].filter(Boolean).length, blue = this.slots[1].filter(Boolean).length;
    const spot = this.freeSlot(red <= blue ? 0 : 1);
    if (!spot) return '방이 꽉 찼어요';
    if (this.game) return '이미 게임이 진행 중이에요';
    this.slots[spot.team][spot.slot] = { kind: 'human', cid: c.id };
    this.clients.set(c.id, c);
    c.room = this;
    if (!this.host) this.host = c.id;
    this.sendLobby();
    return null;
  }

  leave(c) {
    this.clients.delete(c.id);
    c.room = null;
    for (const team of this.slots) {
      const i = team.findIndex(s => s && s.kind === 'human' && s.cid === c.id);
      if (i >= 0) team[i] = this.game ? { kind: 'bot', name: c.name, takeover: true } : null;
    }
    if (this.game) {
      // 게임 중에 나가면 컴퓨터가 이어받는다
      const pid = c.pid;
      const p = this.game.get(pid);
      if (p) {
        p.isBot = true;
        this.bots.set(pid, new Bot(this.game, p, 'normal'));
        this.inputs.delete(pid);
        this.game.emit('left', { id: pid, name: c.name });
      }
    }
    if (this.host === c.id) this.host = this.humans()[0]?.id ?? null;
    if (!this.clients.size) { this.stop(); rooms.delete(this.code); return; }
    if (!this.game) this.sendLobby();
  }

  lobbyView(forCid) {
    return {
      t: 'lobby', code: this.code, mode: this.mode, host: this.host === forCid,
      slots: this.slots.map(team => team.map(s => {
        if (!s) return null;
        if (s.kind === 'bot') return { name: s.name, bot: true };
        const c = this.clients.get(s.cid);
        return { name: c ? c.name : '?', you: s.cid === forCid, host: s.cid === this.host };
      })),
    };
  }

  sendLobby() { for (const c of this.clients.values()) send(c, this.lobbyView(c.id)); }

  handle(c, m) {
    const isHost = this.host === c.id;
    if (m.t === 'in') {
      if (!this.game || c.pid == null) return;
      const q = this.inputs.get(c.pid);
      if (q && q.length < 30) q.push({ s: m.s | 0, mx: +m.mx || 0, mz: +m.mz || 0, ax: +m.ax || 0, az: +m.az || 0, pack: !!m.p, charge: !!m.c, dash: !!m.d, cancel: !!m.x });
      return;
    }
    if (this.game) return;
    if (m.t === 'team') {
      const team = m.team === 1 ? 1 : 0;
      const slot = this.slots[team].indexOf(null);
      if (slot < 0) return;
      for (const tm of this.slots) {
        const i = tm.findIndex(s => s && s.kind === 'human' && s.cid === c.id);
        if (i >= 0) tm[i] = null;
      }
      this.slots[team][slot] = { kind: 'human', cid: c.id };
      this.sendLobby();
    } else if (m.t === 'bot' && isHost) {
      const team = m.team === 1 ? 1 : 0;
      const slot = this.slots[team].indexOf(null);
      if (slot < 0) return;
      const used = this.slots.flat().filter(s => s && s.kind === 'bot').map(s => s.name);
      this.slots[team][slot] = { kind: 'bot', name: BOT_NAMES.find(n => !used.includes(n)) || '컴퓨터' };
      this.sendLobby();
    } else if (m.t === 'kick' && isHost) {
      const s = this.slots[m.team]?.[m.slot];
      if (s && s.kind === 'bot') { this.slots[m.team][m.slot] = null; this.sendLobby(); }
    } else if (m.t === 'start' && isHost) {
      if (this.slots.flat().some(s => !s)) { send(c, { t: 'error', msg: '빈자리를 사람이나 AI로 채워 주세요' }); return; }
      this.start();
    }
  }

  start() {
    const g = new Game(this.mode, DEFAULTS);
    this.game = g;
    this.bots = new Map();
    this.inputs = new Map();
    this.lastIn = new Map();
    this.acks = new Map();
    const roster = [];
    this.slots.forEach((team, t) => team.forEach((s, i) => {
      const id = t * this.M.teamSize + i;
      const c = s.kind === 'human' ? this.clients.get(s.cid) : null;
      const name = c ? c.name : s.name;
      const p = g.addPlayer(id, t, i, name, !c);
      if (c) { c.pid = id; this.inputs.set(id, []); } else this.bots.set(id, new Bot(g, p, 'normal'));
      roster.push({ id, team: t, slot: i, name, bot: !c });
    }));
    for (const c of this.clients.values()) send(c, { t: 'start', mode: this.mode, roster, you: c.pid });
    g.startMatch();
    this.endAt = 0;
    this.next = performance.now();
    this.loop();
  }

  // setInterval은 느린 서버에서 밀리기 쉬워서, 늦어진 만큼 틱을 몰아서 따라잡는다
  loop() {
    const now = performance.now();
    let n = 0;
    while (this.game && now >= this.next && n < 4) { this.tick(); this.next += TICK * 1000; n++; }
    if (now - this.next > 250) this.next = now;
    if (this.game) this.timer = setTimeout(() => this.loop(), Math.max(1, this.next - performance.now()));
  }

  tick() {
    const g = this.game;
    if (!g) return;
    g.step(TICK, p => {
      const bot = this.bots.get(p.id);
      if (bot) return [bot.update(TICK)];
      const q = this.inputs.get(p.id) || [];
      // 밀린 입력이 많으면 한 번에 여러 개 처리해서 따라잡는다
      const batch = q.splice(0, q.length > 3 ? q.length - 1 : 1);
      if (!batch.length) {
        const last = this.lastIn.get(p.id);
        return [last ? { ...last, dash: false, cancel: false } : null];
      }
      this.lastIn.set(p.id, batch[batch.length - 1]);
      this.acks.set(p.id, batch[batch.length - 1].s);
      return batch;
    });
    const snap = g.snapshot();
    snap.ev = g.drain();
    const body = JSON.stringify(snap).slice(1); // 한 번만 직렬화하고 사람마다 ack만 붙인다
    for (const c of this.clients.values()) {
      if (c.ws.readyState === 1) c.ws.send(`{"t":"snap","ack":${this.acks.get(c.pid) ?? 0},${body}`);
    }
    if (g.state === 'matchEnd') {
      this.endAt += TICK;
      if (this.endAt > 6) this.finish();
    }
  }

  finish() {
    this.stop();
    // 나간 사람 자리에 들어간 컴퓨터는 로비에서 빈자리로 돌린다
    for (const team of this.slots) team.forEach((s, i) => { if (s && s.takeover) team[i] = null; });
    this.sendLobby();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    this.game = null;
    for (const c of this.clients.values()) c.pid = null;
  }
}

function send(c, msg) {
  if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg));
}

const cleanName = n => String(n || '').replace(/[<>]/g, '').trim().slice(0, 10) || '플레이어';

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', ws => {
  const c = { id: ++clientSeq, ws, name: '플레이어', room: null, pid: null, alive: true };
  ws.client = c;
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'ping') { send(c, { t: 'pong', c: m.c }); return; }
    if (c.room) {
      if (m.t === 'leave') { c.room.leave(c); send(c, { t: 'left' }); return; }
      c.room.handle(c, m);
      return;
    }
    if (m.t === 'create') {
      c.name = cleanName(m.name);
      const room = new Room(MODES[m.mode] ? m.mode : '1v1');
      room.join(c);
    } else if (m.t === 'join') {
      c.name = cleanName(m.name);
      const room = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!room) { send(c, { t: 'error', msg: '그런 방이 없어요. 코드를 다시 확인해 주세요' }); return; }
      const err = room.join(c);
      if (err) send(c, { t: 'error', msg: err });
    }
  });
  ws.on('close', () => { if (c.room) c.room.leave(c); });
});

// 끊긴 연결 정리
setInterval(() => {
  for (const ws of wss.clients) {
    const c = ws.client;
    if (!c.alive) { ws.terminate(); continue; }
    c.alive = false;
    ws.ping();
  }
}, 20000);

server.listen(PORT, () => console.log(`눈싸움 서버: http://localhost:${PORT}`));
