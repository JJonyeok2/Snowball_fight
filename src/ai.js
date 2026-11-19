import * as THREE from 'three';
import { CFG, ARENA, RULES } from './config.js';
import { launch, SPAWN_OFFSET } from './snowballs.js';

// react: 반응 지연(초), aimErr: 조준 오차(m), lead: 이동 예측 정도, dodge: 피할 확률, aggro: 공격 성향
export const LEVELS = {
  easy: { label: '쉬움', react: 0.5, aimErr: 1.8, lead: 0.3, dodge: 0.2, aggro: 0.45, hold: 0.35 },
  normal: { label: '보통', react: 0.3, aimErr: 1.0, lead: 0.7, dodge: 0.5, aggro: 0.65, hold: 0.2 },
  hard: { label: '어려움', react: 0.16, aimErr: 0.5, lead: 1.0, dodge: 0.85, aggro: 0.85, hold: 0.1 },
};

const tmp = new THREE.Vector3();
const rand = (a, b) => a + Math.random() * (b - a);

// 연습 상대. Fighter가 받는 것과 같은 intent를 만들어 낸다.
export class Bot {
  constructor(me, foe) {
    this.me = me;
    this.foe = foe;
    this.level = 'normal';
    this.intent = { mx: 0, mz: 0, aim: new THREE.Vector3(), pack: false, charge: false, dash: false };
    this.goal = new THREE.Vector3();
    this.err = new THREE.Vector3();
    this.foePrev = new THREE.Vector3();
    this.foeVel = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.mode = 'decide';
    this.timer = rand(0.3, 0.8);
    this.thinkT = 0;
    this.packTarget = RULES.maxAmmo;
    this.foePrev.copy(this.foe.pos);
    this.foeVel.set(0, 0, 0);
    const I = this.intent;
    I.mx = I.mz = 0;
    I.pack = I.charge = I.dash = false;
  }

  update(dt, balls, walls) {
    if (dt <= 0) return;
    const L = LEVELS[this.level], me = this.me, I = this.intent;
    tmp.subVectors(this.foe.pos, this.foePrev).divideScalar(dt);
    this.foeVel.lerp(tmp, 0.15);
    this.foePrev.copy(this.foe.pos);
    I.dash = false;
    this.timer -= dt;
    this.thinkT -= dt;

    // 날아오는 공 피하기
    if (this.thinkT <= 0) {
      this.thinkT = L.react * 0.5;
      const th = this.threat(balls);
      if (th && Math.random() < L.dodge) {
        const rx = me.pos.x - th.p.x, rz = me.pos.z - th.p.z;
        const side = Math.sign(rx * th.v.z - rz * th.v.x) || 1;
        tmp.set(th.v.z, 0, -th.v.x).normalize().multiplyScalar(side);
        if (Math.abs(me.pos.x + tmp.x * 2) > ARENA.w / 2 - 1) tmp.x *= -1;
        I.pack = false;
        if (me.dashCd <= 0 && th.t < 0.4) {
          I.dash = true; I.mx = tmp.x; I.mz = tmp.z;
          this.mode = 'recover'; this.timer = 0.25;
          this.aim(L);
          return;
        }
        this.mode = 'evade';
        this.timer = 0.4;
        this.goal.copy(me.pos).addScaledVector(tmp, 2.5);
      }
    }

    switch (this.mode) {
      case 'decide':
        I.charge = false; I.pack = false;
        if (this.timer > 0) { this.stop(); break; }
        if (me.ammo === 0 || (me.ammo < RULES.maxAmmo && Math.random() > L.aggro)) {
          this.mode = 'cover';
          this.coverSpot(walls);
          this.packTarget = me.ammo === 0 ? (Math.random() < 0.5 ? 2 : 3) : RULES.maxAmmo;
          this.timer = 4;
        } else {
          this.mode = 'attack';
          this.goal.set(rand(-12, 12), 0, me.side * rand(3.5, 8.5));
          this.timer = rand(0.4, 1.4);
          this.err.set(rand(-1, 1), 0, rand(-1, 1)).multiplyScalar(L.aimErr);
        }
        break;
      case 'cover':
        this.moveTo(this.goal, 0.4);
        if (me.pos.distanceTo(this.goal) < 0.45 || this.timer <= 0) { this.mode = 'pack'; this.timer = 6; }
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
        this.moveTo(this.goal, 0.5);
        if (!me.charging) {
          // 누르는 순간을 만들기 위해 한 프레임씩 끊어서 누른다
          I.charge = this.timer <= 0 && me.ammo > 0 && !I.charge;
          if (me.ammo === 0) { this.mode = 'decide'; this.timer = 0; }
        } else if (me.chargeFrac >= this.neededCharge() - 0.02) {
          I.charge = false;
          this.mode = 'decide';
          this.timer = rand(0.15, 0.5) + L.hold;
        }
        break;
      case 'evade':
        this.moveTo(this.goal, 0.3);
        if (this.timer <= 0) { this.mode = me.charging ? 'attack' : 'decide'; this.timer = 0; }
        break;
      case 'recover':
        this.stop();
        if (this.timer <= 0) { this.mode = 'decide'; this.timer = 0; }
        break;
    }
    this.aim(L);
  }

  aim(L) {
    const me = this.me, foe = this.foe;
    const d = Math.hypot(foe.pos.x - me.pos.x, foe.pos.z - me.pos.z);
    const P = launch(this.chargeFor(d));
    const t = P.t * Math.min(1, d / P.range);
    this.intent.aim.copy(foe.pos).addScaledVector(this.foeVel, t * L.lead).add(this.err);
  }

  neededCharge() {
    const a = this.intent.aim, me = this.me;
    return this.chargeFor(Math.hypot(a.x - me.pos.x, a.z - me.pos.z) - SPAWN_OFFSET + 0.3);
  }

  chargeFor(d) {
    return Math.min(1, Math.max(0, (d - CFG.minRange) / (CFG.maxRange - CFG.minRange)));
  }

  moveTo(goal, tol) {
    const dx = goal.x - this.me.pos.x, dz = goal.z - this.me.pos.z, len = Math.hypot(dx, dz);
    this.intent.mx = len > tol ? dx / len : 0;
    this.intent.mz = len > tol ? dz / len : 0;
  }

  stop() { this.intent.mx = this.intent.mz = 0; }

  coverSpot(walls) {
    const me = this.me;
    const mine = walls.list.filter(w => Math.sign(w.z) === me.side);
    const pool = mine.filter(w => w.hp >= 2).length ? mine.filter(w => w.hp >= 2) : mine.filter(w => w.hp > 0);
    if (!pool.length) { this.goal.set(rand(-10, 10), 0, me.side * 9); return; }
    pool.sort((a, b) => Math.hypot(a.x - me.pos.x, a.z - me.pos.z) - Math.hypot(b.x - me.pos.x, b.z - me.pos.z));
    const w = pool[0];
    this.goal.set(w.x + rand(-0.8, 0.8), 0, w.z + me.side * 1.15);
  }

  // 0.7초 안에 내 근처를 지나갈 상대 공
  threat(balls) {
    const me = this.me;
    let best = null;
    for (const b of balls.list) {
      if (b.owner === me) continue;
      const vx = b.v.x, vz = b.v.z, vv = vx * vx + vz * vz;
      if (vv < 1) continue;
      const rx = me.pos.x - b.m.position.x, rz = me.pos.z - b.m.position.z;
      const t = (rx * vx + rz * vz) / vv;
      if (t < 0 || t > 0.7) continue;
      const cx = rx - vx * t, cz = rz - vz * t;
      if (cx * cx + cz * cz < 1.1 && (!best || t < best.t)) best = { t, v: b.v, p: b.m.position };
    }
    return best;
  }
}
