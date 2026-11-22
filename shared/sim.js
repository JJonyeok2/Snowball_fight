import { RULES, MODES, DEFAULTS } from './rules.js';

// 렌더링과 무관한 게임 규칙. 연습 모드에서는 브라우저가, 온라인에서는 서버가 돌린다.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r3 = v => Math.round(v * 1000) / 1000;

export const SPAWN_OFFSET = 0.55;
export const WALL = { sx: 3, sz: 0.8 };
export const wallHeight = hp => (hp >= 2 ? 1.1 : hp === 1 ? 0.55 : 0);
export const hitHeight = p => (p.packing ? 1.4 : 2.05);
export const chargeFrac = (p, cfg) => Math.min(p.chargeT / cfg.chargeTime, 1);

// 차지 c(0~1)에 따라 사거리와 초기 속도를 정한다. 공은 정확히 사거리 지점 바닥에 떨어진다.
export function launch(cfg, c) {
  const range = cfg.minRange + (cfg.maxRange - cfg.minRange) * c;
  const vh = 12 + 10 * c, t = range / vh;
  return { range, vh, t, vy: (0.5 * RULES.gravity * t * t - RULES.throwHeight) / t };
}

export function makeWalls(mode) {
  const out = [];
  for (const [x, z] of MODES[mode].walls) out.push({ x, z, hp: RULES.wallHp }, { x, z: -z, hp: RULES.wallHp });
  return out.map((w, id) => ({ ...w, id }));
}

export function pushOut(p, walls, r) {
  for (const w of walls) {
    if (w.hp <= 0) continue;
    const hx = WALL.sx / 2 + r, hz = WALL.sz / 2 + r, dx = p.x - w.x, dz = p.z - w.z;
    if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
      if (hx - Math.abs(dx) < hz - Math.abs(dz)) p.x = w.x + Math.sign(dx || 1) * hx;
      else p.z = w.z + Math.sign(dz || 1) * hz;
    }
  }
}

export function spawnPoint(mode, team, slot) {
  const [x, z] = MODES[mode].spawns[slot];
  return team === 0 ? { x, z } : { x: -x, z: -z };
}

export function newPlayer(id, team, slot, name, isBot = false) {
  return {
    id, team, slot, name, isBot, side: team === 0 ? 1 : -1,
    x: 0, z: 0, dx: 0, dz: -1, hp: 0, ammo: 0, pack: 0, packSnd: 0, packing: false,
    charging: false, chargeT: 0, prevCharge: false, dashT: 0, dashCd: 0, ddx: 0, ddz: 0,
    throwT: 0, hitT: 0, kx: 0, kz: 0, speed: 0, mvx: 0, mvz: 0, down: false, respawnT: 0, invulnT: 0, stones: 0, throwCd: 0, queued: false,
  };
}

export function resetPlayer(p, mode) {
  const s = spawnPoint(mode, p.team, p.slot);
  Object.assign(p, {
    x: s.x, z: s.z, dx: 0, dz: -p.side, hp: RULES.hp, ammo: RULES.startAmmo, pack: 0, packSnd: 0,
    packing: false, charging: false, chargeT: 0, prevCharge: false, dashT: 0, dashCd: 0,
    throwT: 0, hitT: 0, kx: 0, kz: 0, speed: 0, down: false, respawnT: 0, invulnT: 0, stones: 0, throwCd: 0, queued: false,
  });
}

// 스냅샷과 예측 보정에 쓰는 직렬화 필드
const P_NUM = ['x', 'z', 'dx', 'dz', 'hp', 'ammo', 'pack', 'packSnd', 'chargeT', 'dashT', 'dashCd', 'ddx', 'ddz',
  'throwT', 'hitT', 'kx', 'kz', 'speed', 'mvx', 'mvz', 'respawnT', 'invulnT', 'stones', 'throwCd'];
const P_BOOL = ['packing', 'charging', 'prevCharge', 'down', 'queued'];

export function packPlayer(p) {
  const a = [p.id];
  for (const k of P_NUM) a.push(r3(p[k]));
  let f = 0;
  P_BOOL.forEach((k, i) => { if (p[k]) f |= 1 << i; });
  a.push(f);
  return a;
}

export function unpackPlayer(a, p) {
  let i = 1;
  for (const k of P_NUM) p[k] = a[i++];
  const f = a[i];
  P_BOOL.forEach((k, j) => { p[k] = !!(f & (1 << j)); });
  return p;
}

/*
  플레이어 한 명을 입력 하나만큼 진행한다. 서버, 연습 모드, 내 캐릭터 예측이 모두 이 함수를 쓴다.
  I: { mx, mz, ax, az, pack, charge, dash, cancel } (없으면 null)
  ctx: { cfg, mode, walls, active, emit(type, p, extra), spawnBall(p, c), spawnStone(p) }
*/
export function stepPlayer(p, I, dt, ctx) {
  const cfg = ctx.cfg, M = MODES[ctx.mode];
  const can = ctx.active && !p.down;
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.throwT = Math.max(0, p.throwT - dt);
  p.hitT = Math.max(0, p.hitT - dt);
  p.invulnT = Math.max(0, p.invulnT - dt);
  p.throwCd = Math.max(0, p.throwCd - dt);

  if (can && I) {
    const ax = I.ax - p.x, az = I.az - p.z, l = Math.hypot(ax, az);
    if (l > 0.2) { p.dx = ax / l; p.dz = az / l; }
  }
  let mx = (I && I.mx) || 0, mz = (I && I.mz) || 0;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const chargeIn = !!(I && I.charge);
  const pressed = chargeIn && !p.prevCharge;
  p.prevCharge = chargeIn;

  // 대시
  if (can && I && I.dash && p.dashCd <= 0 && p.dashT <= 0 && p.hitT <= 0) {
    let ddx = ml > 0.1 ? mx : p.dx, ddz = ml > 0.1 ? mz : p.dz;
    const l = Math.hypot(ddx, ddz) || 1;
    p.ddx = ddx / l; p.ddz = ddz / l;
    p.dashT = RULES.dashTime;
    p.dashCd = cfg.dashCooldown;
    p.charging = false;
    p.pack = 0;
    ctx.emit('dash', p);
  }

  // 차지와 던지기 (누르는 순간 시작, 떼는 순간 던짐)
  // 던진 직후 쉬는 시간(throwCd) 동안 누른 건 기억해 뒀다가, 쉬는 시간이 끝났을 때 아직 누르고 있으면 그때 시작한다.
  if (pressed) p.queued = true;
  if (!chargeIn) p.queued = false;
  if (!can || p.hitT > 0 || p.dashT > 0) p.charging = false;
  else if (p.charging) {
    // 차지 중 취소: 던지지 않고 눈덩이도 그대로. 버튼을 뗐다가 다시 눌러야 새로 차지한다.
    if (I && I.cancel) { p.charging = false; p.chargeT = 0; p.queued = false; ctx.emit('cancel', p); }
    else if (chargeIn) p.chargeT += dt;
    else {
      const c = chargeFrac(p, cfg);
      p.charging = false;
      p.ammo--;
      p.throwT = 0.25;
      p.throwCd = RULES.throwCooldown;
      ctx.spawnBall(p, c);
    }
  } else if (p.queued && p.throwCd <= 0) {
    p.queued = false;
    // 얼음돌을 들고 있으면 누르는 순간 바로 직선으로 날린다
    if (p.stones > 0) { p.stones--; p.throwT = 0.25; p.throwCd = RULES.throwCooldown; ctx.spawnStone(p); }
    else if (p.ammo > 0) { p.charging = true; p.chargeT = 0; }
    else ctx.emit('empty', p);
  }

  // 눈 뭉치기 (멈춰 서서)
  p.packing = can && !!(I && I.pack) && !p.charging && p.dashT <= 0 && p.hitT <= 0 && p.ammo < RULES.maxAmmo;
  if (p.packing) {
    p.pack += dt / cfg.packTime;
    p.packSnd -= dt;
    if (p.packSnd <= 0) { p.packSnd = 0.28; ctx.emit('pack', p); }
    if (p.pack >= 1) { p.pack = 0; p.ammo++; ctx.emit('ready', p); }
  } else { p.pack = 0; p.packSnd = 0; }

  // 이동
  let speed = 0;
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.x += p.ddx * RULES.dashSpeed * dt;
    p.z += p.ddz * RULES.dashSpeed * dt;
    p.mvx = p.ddx; p.mvz = p.ddz;
    speed = RULES.dashSpeed;
  } else if (can && !p.packing && p.hitT <= 0.12 && ml > 0.1) {
    const s = cfg.speed * (p.charging ? cfg.chargeSlow : 1);
    const l = Math.hypot(mx, mz);
    p.x += mx * s * dt;
    p.z += mz * s * dt;
    p.mvx = mx / l; p.mvz = mz / l;
    speed = s * Math.min(1, ml);
  }
  p.x += p.kx * dt;
  p.z += p.kz * dt;
  const kd = Math.exp(-7 * dt);
  p.kx *= kd; p.kz *= kd;

  // 자기 진영 안에서만
  const hx = M.w / 2 - 0.5, hz = M.d / 2 - 0.5;
  p.x = clamp(p.x, -hx, hx);
  p.z = p.side > 0 ? clamp(p.z, 0.6, hz) : clamp(p.z, -hz, -0.6);
  pushOut(p, ctx.walls, 0.5);
  p.speed = speed;
}

export class Game {
  constructor(mode, cfg = DEFAULTS) {
    this.mode = mode;
    this.M = MODES[mode];
    this.cfg = { ...cfg };
    this.players = [];
    this.balls = [];
    this.walls = makeWalls(mode);
    this.state = 'lobby';
    this.stateT = 0;
    this.time = 0;
    this.round = 1;
    this.score = [0, 0];
    this.kills = [0, 0];
    this.winner = -1;
    this.events = [];
    this.ballId = 0;
    this.items = [];
    this.itemId = 0;
    this.itemT = RULES.itemFirst;
    this.itemSide = Math.random() < 0.5 ? 1 : -1;
    this.ctx = {
      cfg: this.cfg, mode, walls: this.walls, active: false,
      emit: (type, p, extra) => this.emit(type, { id: p.id, x: r3(p.x), z: r3(p.z), ...extra }),
      spawnBall: (p, c) => this.spawnBall(p, c),
      spawnStone: p => this.spawnStone(p),
    };
  }

  addPlayer(id, team, slot, name, isBot = false) {
    const p = newPlayer(id, team, slot, name, isBot);
    resetPlayer(p, this.mode);
    this.players.push(p);
    return p;
  }

  get(id) { return this.players.find(p => p.id === id); }

  emit(type, data = {}) { this.events.push({ type, t: r3(this.time), ...data }); }

  drain() { const e = this.events; this.events = []; return e; }

  startMatch() {
    this.score = [0, 0];
    this.round = 1;
    this.startRound();
  }

  startRound() {
    this.kills = [0, 0];
    for (const w of this.walls) w.hp = RULES.wallHp;
    this.balls = [];
    this.items = [];
    this.itemT = RULES.itemFirst;
    for (const p of this.players) resetPlayer(p, this.mode);
    this.state = 'countdown';
    this.stateT = 0;
    this.winner = -1;
    this.emit('round', { round: this.round });
  }

  // inputsFor(p): 이번 틱에 처리할 입력 배열 (보통 1개)
  step(dt, inputsFor) {
    this.ctx.active = this.state === 'play';
    for (const p of this.players) {
      for (const I of inputsFor(p)) stepPlayer(p, I, dt, this.ctx);
      if (p.down && this.M.respawn && this.state === 'play') {
        p.respawnT -= dt;
        if (p.respawnT <= 0) this.respawn(p);
      }
    }
    this.stepBalls(dt);
    if (this.state === 'play') this.stepItems(dt);
    this.time += dt;
    this.stateT += dt;
    if (this.state === 'countdown' && this.stateT >= RULES.countdown) {
      this.state = 'play';
      this.stateT = 0;
      this.emit('go');
    } else if (this.state === 'roundEnd' && this.stateT >= RULES.roundEndTime) {
      if (Math.max(...this.score) >= RULES.roundsToWin) {
        this.state = 'matchEnd';
        this.stateT = 0;
        this.emit('matchEnd', { winner: this.score[0] > this.score[1] ? 0 : 1 });
      } else {
        this.round++;
        this.startRound();
      }
    }
  }

  spawnBall(p, c) {
    const L = launch(this.cfg, c);
    const b = {
      id: ++this.ballId, owner: p.id, team: p.team,
      x0: p.x + p.dx * SPAWN_OFFSET, y0: RULES.throwHeight, z0: p.z + p.dz * SPAWN_OFFSET,
      vx: p.dx * L.vh, vy: L.vy, vz: p.dz * L.vh, age: 0,
    };
    b.x = b.x0; b.y = b.y0; b.z = b.z0;
    this.balls.push(b);
    this.emit('ball', { bid: b.id, owner: p.id, team: p.team, x0: r3(b.x0), y0: b.y0, z0: r3(b.z0), vx: r3(b.vx), vy: r3(b.vy), vz: r3(b.vz), c: r3(c) });
  }

  // 얼음돌: 중력 없이 일정한 높이로 곧게 날아가다 사거리 끝에서 떨어진다
  spawnStone(p) {
    const v = RULES.stoneSpeed;
    const b = {
      id: ++this.ballId, owner: p.id, team: p.team, kind: 'stone',
      x0: p.x + p.dx * SPAWN_OFFSET, y0: RULES.stoneHeight, z0: p.z + p.dz * SPAWN_OFFSET,
      vx: p.dx * v, vy: 0, vz: p.dz * v, age: 0, maxAge: RULES.stoneRange / v,
    };
    b.x = b.x0; b.y = b.y0; b.z = b.z0;
    this.balls.push(b);
    this.emit('ball', { bid: b.id, owner: p.id, team: p.team, kind: 'stone', x0: r3(b.x0), y0: b.y0, z0: r3(b.z0), vx: r3(b.vx), vy: 0, vz: r3(b.vz), c: 1 });
  }

  stepItems(dt) {
    this.itemT -= dt;
    if (this.itemT <= 0) {
      if (this.items.length < RULES.itemMax) { this.dropItem(); this.itemT = RULES.itemEvery; }
      else this.itemT = 2;
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.fallT > 0) {
        it.fallT -= dt;
        if (it.fallT <= 0) this.emit('itemLand', { iid: it.id, x: it.x, z: it.z });
        continue;
      }
      it.life -= dt;
      if (it.life <= 0) { this.items.splice(i, 1); this.emit('itemGone', { iid: it.id, x: it.x, z: it.z }); continue; }
      const p = this.players.find(q => !q.down && Math.hypot(q.x - it.x, q.z - it.z) < 0.9);
      if (p) {
        p.stones = RULES.stonesPerPick;
        this.items.splice(i, 1);
        this.emit('itemPick', { iid: it.id, id: p.id, x: it.x, z: it.z });
      }
    }
  }

  // 중앙선을 못 넘으니 양 진영에 번갈아 떨어뜨린다
  dropItem() {
    const side = this.itemSide;
    this.itemSide = -side;
    const hx = this.M.w / 2 - 2, hz = this.M.d / 2 - 1.5;
    let x = 0, z = side * 5;
    for (let tries = 0; tries < 30; tries++) {
      x = (Math.random() * 2 - 1) * hx;
      z = side * (1.5 + Math.random() * (hz - 1.5));
      if (!this.walls.some(w => Math.abs(x - w.x) < 2.3 && Math.abs(z - w.z) < 1.4)) break;
    }
    const it = { id: ++this.itemId, x: r3(x), z: r3(z), fallT: RULES.itemFall, life: RULES.itemLife };
    this.items.push(it);
    this.emit('itemDrop', { iid: it.id, x: it.x, z: it.z });
  }

  // 궤적은 해석적으로 계산해서 클라이언트가 같은 곡선을 그릴 수 있게 한다.
  stepBalls(dt) {
    const steps = Math.max(1, Math.ceil(dt / 0.017)), h = dt / steps, G = RULES.gravity;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      let done = false;
      for (let s = 0; s < steps && !done; s++) {
        b.age += h;
        b.x = b.x0 + b.vx * b.age;
        b.z = b.z0 + b.vz * b.age;
        b.y = b.kind === 'stone' ? b.y0 : b.y0 + b.vy * b.age - 0.5 * G * b.age * b.age;
        if (b.kind === 'stone' && b.age >= b.maxAge) {
          this.emit('ballEnd', { bid: b.id, k: 'stone', x: r3(b.x), y: r3(b.y), z: r3(b.z), vx: r3(b.vx), vz: r3(b.vz), kind: 'fizzle' });
          done = true;
          break;
        }
        done = this.collide(b);
      }
      if (done) this.balls.splice(i, 1);
    }
  }

  collide(b) {
    const base = { bid: b.id, k: b.kind || 'snow', x: r3(b.x), y: r3(b.y), z: r3(b.z), vx: r3(b.vx), vz: r3(b.vz) };
    for (const p of this.players) {
      if (p.team === b.team || p.down) continue; // 같은 팀 눈은 통과
      if (Math.hypot(b.x - p.x, b.z - p.z) < 0.6 && b.y < hitHeight(p) && b.y > -0.1) {
        this.hitPlayer(p, b, base);
        return true;
      }
    }
    for (const w of this.walls) {
      if (w.hp > 0 && Math.abs(b.x - w.x) < WALL.sx / 2 + 0.15 && Math.abs(b.z - w.z) < WALL.sz / 2 + 0.15 && b.y < wallHeight(w.hp)) {
        w.hp--;
        this.emit('ballEnd', { ...base, kind: 'wall', wid: w.id, hp: w.hp });
        return true;
      }
    }
    if (b.y <= 0.08) { this.emit('ballEnd', { ...base, kind: 'ground' }); return true; }
    if (Math.abs(b.x) > 45 || Math.abs(b.z) > 35) { this.emit('ballEnd', { ...base, kind: 'out' }); return true; }
    return false;
  }

  hitPlayer(p, b, base) {
    if (p.invulnT > 0 || this.state !== 'play') {
      this.emit('ballEnd', { ...base, kind: 'shield', id: p.id });
      return;
    }
    p.hp--;
    p.hitT = 0.3;
    const l = Math.hypot(b.vx, b.vz) || 1;
    p.kx = (b.vx / l) * 5;
    p.kz = (b.vz / l) * 5;
    p.charging = false;
    p.pack = 0;
    this.emit('ballEnd', { ...base, kind: 'hit', id: p.id, by: b.owner, hp: p.hp });
    if (p.hp > 0) return;
    p.down = true;
    p.packing = false;
    p.respawnT = RULES.respawnTime;
    this.kills[b.team]++;
    this.emit('kill', { id: p.id, by: b.owner, team: b.team });
    if (this.state === 'play' && this.kills[b.team] >= this.M.killsToWin) {
      this.score[b.team]++;
      this.winner = b.team;
      this.state = 'roundEnd';
      this.stateT = 0;
      this.emit('roundEnd', { winner: b.team, x: base.x, y: base.y, z: base.z });
    }
  }

  respawn(p) {
    const s = spawnPoint(this.mode, p.team, p.slot);
    Object.assign(p, {
      x: s.x, z: s.z, dx: 0, dz: -p.side, hp: RULES.hp, down: false, respawnT: 0,
      invulnT: RULES.invulnTime, hitT: 0, kx: 0, kz: 0, charging: false, pack: 0,
      ammo: Math.max(p.ammo, 1),
    });
    this.emit('respawn', { id: p.id, x: r3(p.x), z: r3(p.z) });
  }

  snapshot() {
    return {
      tm: r3(this.time), st: this.state, sT: r3(this.stateT), rd: this.round, sc: this.score, k: this.kills,
      wn: this.winner, w: this.walls.map(w => w.hp), p: this.players.map(packPlayer),
      it: this.items.map(i => [i.id, i.x, i.z, r3(Math.max(0, i.fallT))]),
    };
  }
}
