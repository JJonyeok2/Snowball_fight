import { Game, stepPlayer, unpackPlayer, newPlayer } from '../shared/sim.js';
import { DEFAULTS, RULES } from '../shared/rules.js';

const STEP = 1 / RULES.tickRate;
const DELAY = 0.1; // 다른 사람은 100ms 뒤의 모습을 보간해서 그린다
const r2 = v => Math.round(v * 100) / 100;

/*
  온라인 한 판.
  - 내 캐릭터: 입력을 서버에 보내면서 같은 sim 코드로 미리 움직여 보고(예측),
    서버 스냅샷이 오면 그 상태에서 아직 처리 안 된 입력을 다시 적용해 맞춘다(보정).
  - 다른 사람과 눈덩이: 서버 시간 기준 100ms 전 모습을 스냅샷 두 개 사이에서 보간한다.
*/
export class OnlineSession {
  constructor(net, msg) {
    this.net = net;
    this.mode = msg.mode;
    this.roster = msg.roster;
    this.meId = msg.you;
    this.game = new Game(this.mode, DEFAULTS);
    for (const r of this.roster) this.game.addPlayer(r.id, r.team, r.slot, r.name, r.bot);
    this.me = this.game.get(this.meId);
    this.ctx = { cfg: DEFAULTS, mode: this.mode, walls: this.game.walls, active: false, emit() {}, spawnBall() {} };
    this.snaps = [];
    this.latest = null;
    this.offset = null;
    this.seq = 0;
    this.pending = [];
    this.acc = 0;
    this.prev = { x: this.me.x, z: this.me.z };
    this.err = { x: 0, z: 0 };
    this.queue = [];
    this.fired = [];
    this.ballRecs = new Map();
    this.views = new Map(this.roster.map(r => [r.id, { a: newPlayer(r.id, r.team, r.slot, r.name), b: newPlayer(r.id, r.team, r.slot, r.name), out: newPlayer(r.id, r.team, r.slot, r.name) }]));
    this.meView = { ...this.me };
  }

  onSnap(s) {
    const now = performance.now() / 1000;
    const sample = s.tm - now;
    this.offset = this.offset === null ? sample : this.offset + (sample - this.offset) * 0.05;
    this.snaps.push(s);
    if (this.snaps.length > 60) this.snaps.shift();
    this.latest = s;
    for (const e of s.ev) this.queue.push(e);
    s.w.forEach((hp, i) => { this.game.walls[i].hp = hp; });

    const mine = s.p.find(a => a[0] === this.meId);
    if (!mine || !this.me) return;
    const ox = this.me.x, oz = this.me.z;
    unpackPlayer(mine, this.me);
    this.pending = this.pending.filter(I => I.s > s.ack);
    this.ctx.active = s.st === 'play';
    for (const I of this.pending) stepPlayer(this.me, I, STEP, this.ctx);
    // 보정으로 생긴 차이는 화면에서 부드럽게 줄여 나간다
    const dx = this.me.x - ox, dz = this.me.z - oz;
    if (Math.hypot(dx, dz) > 3) { this.err.x = this.err.z = 0; this.prev.x = this.me.x; this.prev.z = this.me.z; return; }
    this.prev.x += dx; this.prev.z += dz;
    this.err.x -= dx; this.err.z -= dz;
  }

  tick(realDt, input) {
    if (!this.latest) return;
    this.acc += realDt;
    let n = 0;
    while (this.acc >= STEP && n < 4) {
      this.acc -= STEP;
      n++;
      const I = input.sample();
      I.s = ++this.seq;
      this.net.send({ t: 'in', s: I.s, mx: r2(I.mx), mz: r2(I.mz), ax: r2(I.ax), az: r2(I.az), p: I.pack ? 1 : 0, c: I.charge ? 1 : 0, d: I.dash ? 1 : 0 });
      this.pending.push(I);
      this.prev.x = this.me.x; this.prev.z = this.me.z;
      this.ctx.active = this.latest.st === 'play';
      stepPlayer(this.me, I, STEP, this.ctx);
    }
    if (this.acc > STEP * 4) this.acc = 0;
    const k = Math.exp(-12 * realDt);
    this.err.x *= k; this.err.z *= k;
  }

  takeEvents() { const e = this.fired; this.fired = []; return e; }

  renderState(now) {
    const L = this.latest;
    if (!L) return null;
    const rt = Math.min(now + this.offset - DELAY, L.tm);

    // 이벤트는 자기 시각이 되면 터뜨린다
    while (this.queue.length && this.queue[0].t <= rt) {
      const e = this.queue.shift();
      this.fired.push(e);
      if (e.type === 'ball') this.ballRecs.set(e.bid, e);
      else if (e.type === 'ballEnd') this.ballRecs.delete(e.bid);
      else if (e.type === 'round') this.ballRecs.clear();
    }

    let s0 = this.snaps[0], s1 = s0;
    for (let i = this.snaps.length - 1; i >= 0; i--) {
      if (this.snaps[i].tm <= rt) { s0 = this.snaps[i]; s1 = this.snaps[i + 1] || s0; break; }
    }
    const span = s1.tm - s0.tm;
    const al = span > 0 ? Math.min(1, Math.max(0, (rt - s0.tm) / span)) : 1;

    const players = [];
    for (const r of this.roster) {
      if (r.id === this.meId) { players.push(this.me); continue; }
      const v = this.views.get(r.id);
      const A = s0.p.find(a => a[0] === r.id), B = s1.p.find(a => a[0] === r.id);
      if (!A || !B) continue;
      unpackPlayer(A, v.a);
      unpackPlayer(B, v.b);
      Object.assign(v.out, al < 0.5 ? v.a : v.b);
      v.out.x = v.a.x + (v.b.x - v.a.x) * al;
      v.out.z = v.a.z + (v.b.z - v.a.z) * al;
      const dx = v.a.dx + (v.b.dx - v.a.dx) * al, dz = v.a.dz + (v.b.dz - v.a.dz) * al, dl = Math.hypot(dx, dz) || 1;
      v.out.dx = dx / dl; v.out.dz = dz / dl;
      players.push(v.out);
    }

    // 내 캐릭터는 예측 상태를 틱 사이로 보간하고, 보정 오차를 더해 그린다
    const a = Math.min(1, this.acc / STEP);
    Object.assign(this.meView, this.me);
    this.meView.x = this.prev.x + (this.me.x - this.prev.x) * a + this.err.x;
    this.meView.z = this.prev.z + (this.me.z - this.prev.z) * a + this.err.z;

    const G = RULES.gravity, balls = [];
    for (const b of this.ballRecs.values()) {
      const age = rt - b.t;
      if (age < 0) continue;
      const stone = b.kind === 'stone';
      balls.push({
        id: b.bid, kind: b.kind, vx: b.vx, vz: b.vz,
        x: b.x0 + b.vx * age, z: b.z0 + b.vz * age,
        y: stone ? b.y0 : b.y0 + b.vy * age - 0.5 * G * age * age,
      });
    }

    const items = (s0.it || []).map(([id, x, z, f]) => ({ id, x, z, fallT: Math.max(0, f - (rt - s0.tm)) }));

    return {
      items,
      time: rt, state: s1.st, stateT: s1.sT + Math.max(0, rt - s1.tm), round: s1.rd, score: s1.sc, kills: s1.k,
      winner: s1.wn, walls: s1.w, players, balls, cfg: DEFAULTS, me: this.meView,
    };
  }
}
