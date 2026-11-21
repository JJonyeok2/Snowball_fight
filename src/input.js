import * as THREE from 'three';

/*
  키보드와 마우스를 sim 입력 { mx, mz, ax, az, pack, charge, dash, cancel } 으로 바꾼다.
  - WASD 이동, Shift 대시
  - 조준: 마우스, 또는 ←→ 로 돌리기 (방향키를 누르면 방향키 조준으로, 마우스를 움직이면 다시 마우스로)
  - 던지기: 좌클릭 또는 ↑ 를 누르고 있다가 떼기
  - 뭉치기: Space, 우클릭, ↓ 꾹
  - 차지 취소: 차지 중에 우클릭, Space, ↓, Q
*/
export class LocalInput {
  constructor(canvas) {
    this.camera = null;
    this.getMe = null; // 방향키 조준할 때 내 위치가 필요하다
    this.flip = 1; // 파랑팀은 화면이 뒤집혀 있으니 이동 방향도 뒤집는다
    this.keys = new Set();
    this.l = false;
    this.lLatch = false; // 아주 짧은 클릭도 놓치지 않게
    this.r = false;
    this.rLatch = false;
    this.upLatch = false;
    this.dashQueued = false;
    this.prevCancel = false;
    this.aimMode = 'mouse';
    this.yaw = Math.PI;
    this.lastT = performance.now();
    this.mouse = { x: 0, y: 0 };
    this.ndc = new THREE.Vector2();
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hit = new THREE.Vector3();

    addEventListener('keydown', e => {
      if (e.target.closest && e.target.closest('input, textarea')) return;
      if (e.code === 'Space' || e.code.startsWith('Shift') || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat && e.code.startsWith('Shift')) this.dashQueued = true;
      if (!e.repeat && e.code === 'ArrowUp') this.upLatch = true;
      this.keys.add(e.code);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.releaseAll());
    addEventListener('pointermove', e => {
      if (Math.hypot(e.clientX - this.mouse.x, e.clientY - this.mouse.y) > 4) this.aimMode = 'mouse';
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      const r = canvas.getBoundingClientRect();
      this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    });
    canvas.addEventListener('pointerdown', e => {
      if (e.button === 0) { this.l = true; this.lLatch = true; }
      if (e.button === 2) { this.r = true; this.rLatch = true; }
    });
    addEventListener('pointerup', e => {
      if (e.button === 0) this.l = false;
      if (e.button === 2) this.r = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  releaseAll() {
    this.keys.clear();
    this.l = this.r = this.lLatch = this.rLatch = this.upLatch = false;
    this.dashQueued = false;
  }

  sample() {
    const now = performance.now(), dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    const k = this.keys, f = this.flip;
    const mx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const mz = (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0);

    // 조준
    const me = this.getMe ? this.getMe() : null;
    const rotL = k.has('ArrowLeft'), rotR = k.has('ArrowRight');
    if ((rotL || rotR) && this.aimMode !== 'keys' && me) {
      this.aimMode = 'keys';
      this.yaw = Math.atan2(me.dx, me.dz);
    }
    let ax, az;
    if (this.aimMode === 'keys' && me) {
      // 화면 기준 ← 는 왼쪽으로 돈다 (파랑팀 화면도 같은 방향)
      this.yaw += ((rotL ? 1 : 0) - (rotR ? 1 : 0)) * 2.6 * dt;
      ax = me.x + Math.sin(this.yaw) * 10;
      az = me.z + Math.cos(this.yaw) * 10;
    } else {
      if (this.camera) {
        this.ray.setFromCamera(this.ndc, this.camera);
        this.ray.ray.intersectPlane(this.plane, this.hit);
      }
      ax = this.hit.x; az = this.hit.z;
    }

    const packKey = k.has('Space') || k.has('ArrowDown');
    const cancelNow = this.r || this.rLatch || packKey || k.has('KeyQ');
    const I = {
      mx: mx * f, mz: mz * f, ax, az,
      pack: packKey || this.r,
      charge: this.l || this.lLatch || k.has('ArrowUp') || this.upLatch,
      dash: this.dashQueued,
      cancel: cancelNow && !this.prevCancel,
    };
    this.prevCancel = cancelNow;
    this.lLatch = this.rLatch = this.upLatch = false;
    this.dashQueued = false;
    return I;
  }
}
