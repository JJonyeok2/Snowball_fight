import { RULES } from './rules.js';
import { launch, SPAWN_OFFSET } from './sim.js';

// react: 반응 지연(초), aimErr: 조준 오차(m), lead: 이동 예측 정도, dodge: 피할 확률, aggro: 공격 성향
export const LEVELS = {
  easy: { label: '쉬움', react: 0.5, aimErr: 1.8, lead: 0.3, dodge: 0.2, aggro: 0.45, hold: 0.35 },
  normal: { label: '보통', react: 0.3, aimErr: 1.0, lead: 0.7, dodge: 0.5, aggro: 0.65, hold: 0.2 },
  hard: { label: '어려움', react: 0.16, aimErr: 0.5, lead: 1.0, dodge: 0.85, aggro: 0.85, hold: 0.1 },
};

const rand = (a, b) => a + Math.random() * (b - a);

// 컴퓨터 플레이어. 사람과 똑같은 입력 { mx, mz, ax, az, pack, charge, dash } 을 만들어 낸다.
export class Bot {
  constructor(game, player, level = 'normal') {
    this.g = game;
    this.me = player;
    this.level = LEVELS[level] ? level : 'normal';
    this.I = { mx: 0, mz: 0, ax: 0, az: 0, pack: false, charge: false, dash: false };
    this.goal = { x: 0, z: 0 };
    this.err = { x: 0, z: 0 };
    this.track = new Map(); // 상대 id -> { x, z, vx, vz }
    this.judged = new Map(); // 공 id -> 피할지 말지 (공 하나당 한 번만 정한다)
    this.reset();
  }

  reset() {
    this.mode = 'decide';
    this.timer = rand(0.3, 0.8);
    this.thinkT = 0;
    this.packTarget = RULES.maxAmmo;
    const I = this.I;
    I.mx = I.mz = 0;
    I.pack = I.charge = I.dash = false;
  }

  target() {
    const me = this.me;
    let best = null, bd = Infinity;
    for (const p of this.g.players) {
      if (p.team === me.team || p.down) continue;
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  watch(dt) {
    for (const p of this.g.players) {
      if (p.team === this.me.team) continue;
      const t = this.track.get(p.id);
      if (!t) { this.track.set(p.id, { x: p.x, z: p.z, vx: 0, vz: 0 }); continue; }
      t.vx += ((p.x - t.x) / dt - t.vx) * 0.15;
      t.vz += ((p.z - t.z) / dt - t.vz) * 0.15;
      t.x = p.x; t.z = p.z;
    }
  }

  update(dt) {
    const I = this.I, me = this.me, g = this.g, L = LEVELS[this.level];
    I.dash = false;
    if (dt <= 0) return I;
    this.watch(dt);
    if (me.down || g.state !== 'play') {
      I.mx = I.mz = 0;
      I.pack = I.charge = false;
      this.mode = 'decide';
      this.timer = rand(0.2, 0.7);
      return I;
    }
    const foe = this.target();
    this.timer -= dt;
    this.thinkT -= dt;

    // 날아오는 공 피하기
    if (this.thinkT <= 0) {
      this.thinkT = L.react * 0.5;
      const th = this.threat();
      if (th && !this.judged.has(th.b.id)) {
        this.judged.set(th.b.id, Math.random() < L.dodge);
        if (this.judged.size > 64) this.judged.delete(this.judged.keys().next().value);
      }
      if (th && this.judged.get(th.b.id) && this.mode !== 'evade' && this.mode !== 'recover') {
        const rx = me.x - th.b.x, rz = me.z - th.b.z;
        const side = Math.sign(rx * th.b.vz - rz * th.b.vx) || 1;
        const l = Math.hypot(th.b.vx, th.b.vz) || 1;
        let ex = (th.b.vz / l) * side, ez = (-th.b.vx / l) * side;
        if (Math.abs(me.x + ex * 2) > g.M.w / 2 - 1) ex = -ex;
        I.pack = false;
        if (me.dashCd <= 0 && th.t < 0.4) {
          I.dash = true; I.mx = ex; I.mz = ez;
          this.mode = 'recover'; this.timer = 0.25;
          this.aim(foe);
          return I;
        }
        this.mode = 'evade';
        this.timer = 0.4;
        this.goal.x = me.x + ex * 2.5;
        this.goal.z = me.z + ez * 2.5;
      }
    }

    switch (this.mode) {
      case 'decide':
        I.charge = false; I.pack = false;
        if (this.timer > 0) { this.stop(); break; }
        if (!foe || me.ammo === 0 || (me.ammo < RULES.maxAmmo && Math.random() > L.aggro)) {
          this.mode = 'cover';
          this.coverSpot();
          this.packTarget = me.ammo === 0 ? (Math.random() < 0.5 ? 2 : 3) : RULES.maxAmmo;
          this.timer = 4;
        } else {
          const hx = g.M.w / 2, hz = g.M.d / 2;
          this.mode = 'attack';
          this.goal.x = rand(-hx + 3, hx - 3);
          this.goal.z = me.side * rand(3.5, hz - 1.5);
          this.timer = rand(0.4, 1.4);
          this.err.x = rand(-1, 1) * L.aimErr;
          this.err.z = rand(-1, 1) * L.aimErr;
        }
        break;
      case 'cover':
        this.moveTo(0.4);
        if (Math.hypot(me.x - this.goal.x, me.z - this.goal.z) < 0.45 || this.timer <= 0) { this.mode = 'pack'; this.timer = 6; }
        break;
      case 'pack':
        this.stop();
        I.pack = true;
        if (me.ammo >= this.packTarget || this.timer <= 0) {
          I.pack = false;
          this.mode = 'decide';
          this.timer = rand(0.05, L.hold);
        }
        break;
      case 'attack':
        this.moveTo(0.5);
        if (!foe) { this.mode = 'decide'; this.timer = 0; I.charge = false; break; }
        if (!me.charging) {
          // 누르는 순간을 만들기 위해 한 번씩 끊어서 누른다
          I.charge = this.timer <= 0 && me.ammo > 0 && !I.charge;
          if (me.ammo === 0) { this.mode = 'decide'; this.timer = 0; }
        } else if (Math.min(me.chargeT / g.cfg.chargeTime, 1) >= this.neededCharge() - 0.02) {
          I.charge = false;
          this.mode = 'decide';
          this.timer = rand(0.15, 0.5) + L.hold;
        }
        break;
      case 'evade':
        this.moveTo(0.3);
        if (this.timer <= 0) { this.mode = me.charging ? 'attack' : 'decide'; this.timer = 0; }
        break;
      case 'recover':
        this.stop();
        if (this.timer <= 0) { this.mode = 'decide'; this.timer = 0; }
        break;
    }
    this.aim(foe);
    return I;
  }

  aim(foe) {
    const me = this.me, I = this.I, L = LEVELS[this.level];
    if (!foe) { I.ax = me.x; I.az = me.z - me.side * 5; return; }
    const d = Math.hypot(foe.x - me.x, foe.z - me.z);
    const P = launch(this.g.cfg, this.chargeFor(d));
    const t = P.t * Math.min(1, d / P.range);
    const tr = this.track.get(foe.id) || { vx: 0, vz: 0 };
    I.ax = foe.x + tr.vx * t * L.lead + this.err.x;
    I.az = foe.z + tr.vz * t * L.lead + this.err.z;
  }

  neededCharge() {
    const me = this.me;
    return this.chargeFor(Math.hypot(this.I.ax - me.x, this.I.az - me.z) - SPAWN_OFFSET + 0.3);
  }

  chargeFor(d) {
    const c = this.g.cfg;
    return Math.min(1, Math.max(0, (d - c.minRange) / (c.maxRange - c.minRange)));
  }

  moveTo(tol) {
    const dx = this.goal.x - this.me.x, dz = this.goal.z - this.me.z, len = Math.hypot(dx, dz);
    this.I.mx = len > tol ? dx / len : 0;
    this.I.mz = len > tol ? dz / len : 0;
  }

  stop() { this.I.mx = this.I.mz = 0; }

  coverSpot() {
    const me = this.me;
    const mine = this.g.walls.filter(w => Math.sign(w.z) === me.side && w.hp > 0);
    const solid = mine.filter(w => w.hp >= 2);
    const pool = solid.length ? solid : mine;
    if (!pool.length) {
      this.goal.x = rand(-10, 10);
      this.goal.z = me.side * (this.g.M.d / 2 - 1);
      return;
    }
    pool.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
    const w = pool[Math.random() < 0.75 ? 0 : Math.min(1, pool.length - 1)];
    this.goal.x = w.x + rand(-0.8, 0.8);
    this.goal.z = w.z + me.side * 1.15;
  }

  // 0.7초 안에 내 근처를 지나갈 상대 공
  threat() {
    const me = this.me, L = LEVELS[this.level];
    let best = null;
    for (const b of this.g.balls) {
      if (b.team === me.team) continue;
      const vv = b.vx * b.vx + b.vz * b.vz;
      if (vv < 1) continue;
      const rx = me.x - b.x, rz = me.z - b.z;
      const t = (rx * b.vx + rz * b.vz) / vv;
      if (t < 0 || t > 0.7 || b.age < L.react) continue; // 던진 걸 알아채는 데 시간이 걸린다
      const cx = rx - b.vx * t, cz = rz - b.vz * t;
      if (cx * cx + cz * cz < 1.1 && (!best || t < best.t)) best = { t, b };
    }
    return best;
  }
}
