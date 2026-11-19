import * as THREE from 'three';
import { CFG, RULES, ARENA } from './config.js';
import { buildCharacter, animate } from './character.js';

const tmp = new THREE.Vector3(), mv = new THREE.Vector3();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/*
  플레이어 한 명의 상태와 행동. 조작 주체(키보드, AI, 나중엔 네트워크)는
  매 프레임 intent 하나만 넘겨준다:
  { mx, mz, aim: Vector3, pack: bool, charge: bool, dash: bool }
*/
export class Fighter {
  constructor(scene, opts) {
    Object.assign(this, opts); // color, accent, side(+1 아래 / -1 위), name, isBot
    this.model = buildCharacter(opts.color, opts.accent);
    scene.add(this.model.root);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.7, 28),
      new THREE.MeshBasicMaterial({ color: opts.color, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    this.model.root.add(ring);

    this.pos = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.dashDir = new THREE.Vector3();
    this.moveDir = new THREE.Vector3();
    this.anim = { walk: 0 };
    this.reset();
  }

  reset() {
    this.pos.set(0, 0, 7 * this.side);
    this.dir.set(0, 0, -this.side);
    this.knock.set(0, 0, 0);
    this.hp = RULES.hp;
    this.ammo = RULES.startAmmo;
    this.pack = 0;
    this.packSnd = 0;
    this.packing = false;
    this.charging = false;
    this.chargeT = 0;
    this.prevCharge = false;
    this.dashT = 0;
    this.dashCd = 0;
    this.throwT = 0;
    this.hitT = 0;
    this.flash = 0;
    this.down = false;
    this.win = false;
    this.speedNow = 0;
    this.step = 0;
    this.foot = 1;
    const r = this.model.root;
    r.position.copy(this.pos);
    r.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    this.model.patches.forEach(p => { p.visible = false; });
  }

  get chargeFrac() { return Math.min(this.chargeT / CFG.chargeTime, 1); }
  get hitHeight() { return this.packing ? 1.4 : 2.05; }

  update(dt, I, ctx) {
    const can = ctx.active && !this.down;
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.throwT = Math.max(0, this.throwT - dt);
    this.hitT = Math.max(0, this.hitT - dt);
    this.flash = Math.max(0, this.flash - dt);

    if (can && I.aim) {
      tmp.set(I.aim.x - this.pos.x, 0, I.aim.z - this.pos.z);
      if (tmp.lengthSq() > 0.04) this.dir.copy(tmp.normalize());
    }
    mv.set(I.mx || 0, 0, I.mz || 0);
    if (mv.lengthSq() > 1) mv.normalize();
    const pressed = !!I.charge && !this.prevCharge;
    this.prevCharge = !!I.charge;

    // 대시
    if (can && I.dash && this.dashCd <= 0 && this.dashT <= 0 && this.hitT <= 0) {
      this.dashDir.copy(mv.lengthSq() > 0.01 ? mv : this.dir).normalize();
      this.dashT = RULES.dashTime;
      this.dashCd = CFG.dashCooldown;
      this.charging = false;
      this.pack = 0;
      ctx.onDash?.(this);
    }

    // 차지와 던지기 (누르는 순간 시작, 떼는 순간 던짐)
    if (!can || this.hitT > 0 || this.dashT > 0) this.charging = false;
    else if (this.charging) {
      if (I.charge) this.chargeT += dt;
      else this.release(ctx);
    } else if (pressed) {
      if (this.ammo > 0) { this.charging = true; this.chargeT = 0; }
      else ctx.onEmpty?.(this);
    }

    // 눈 뭉치기 (멈춰 서서)
    this.packing = can && !!I.pack && !this.charging && this.dashT <= 0 && this.hitT <= 0 && this.ammo < RULES.maxAmmo;
    if (this.packing) {
      this.pack += dt / CFG.packTime;
      this.packSnd -= dt;
      if (this.packSnd <= 0) { this.packSnd = 0.28; ctx.onPackTick?.(this); }
      if (this.pack >= 1) { this.pack = 0; this.ammo++; ctx.onBallReady?.(this); }
    } else { this.pack = 0; this.packSnd = 0; }

    // 이동
    let speed = 0;
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.pos.addScaledVector(this.dashDir, RULES.dashSpeed * dt);
      this.moveDir.copy(this.dashDir);
      speed = RULES.dashSpeed;
    } else if (can && !this.packing && this.hitT <= 0.12 && mv.lengthSq() > 0.01) {
      const s = CFG.speed * (this.charging ? CFG.chargeSlow : 1);
      this.pos.addScaledVector(mv, s * dt);
      this.moveDir.copy(mv).normalize();
      speed = s * Math.min(1, mv.length());
    }
    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-7 * dt));

    // 자기 진영 안에서만
    const hx = ARENA.w / 2 - 0.5, hz = ARENA.d / 2 - 0.5;
    this.pos.x = clamp(this.pos.x, -hx, hx);
    this.pos.z = this.side > 0 ? clamp(this.pos.z, 0.6, hz) : clamp(this.pos.z, -hz, -0.6);
    ctx.walls.pushOut(this.pos, 0.5);
    this.speedNow += (speed - this.speedNow) * (1 - Math.exp(-14 * dt));

    // 발자국
    if (speed > 0.5) {
      this.step += speed * dt;
      if (this.step > 0.6) {
        this.step = 0;
        this.foot *= -1;
        const a = Math.atan2(this.moveDir.x, this.moveDir.z);
        ctx.effects.footprint(this.pos.x + Math.cos(a) * 0.16 * this.foot, this.pos.z - Math.sin(a) * 0.16 * this.foot, a);
      }
    }

    // 모델
    const r = this.model.root;
    r.position.copy(this.pos);
    if (!this.down) {
      let d = Math.atan2(this.dir.x, this.dir.z) - r.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      r.rotation.y += d * (1 - Math.exp(-(this.isBot ? 12 : 30) * dt));
    }
    animate(this.model, this, dt, ctx.time);
  }

  release(ctx) {
    const c = this.chargeFrac;
    this.charging = false;
    this.ammo--;
    this.throwT = 0.25;
    ctx.onThrow(this, c);
  }

  takeHit(v) {
    this.hp--;
    this.hitT = 0.3;
    this.flash = 0.18;
    this.knock.set(v.x, 0, v.z).normalize().multiplyScalar(5);
    this.charging = false;
    this.pack = 0;
    const show = (RULES.hp - this.hp) * 2;
    this.model.patches.forEach((p, i) => { p.visible = i < show; });
  }
}
