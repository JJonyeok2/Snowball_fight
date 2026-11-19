import * as THREE from 'three';
import { terrainHeight } from './world.js';

const tmp = new THREE.Vector3(), look = new THREE.Vector3();

// 파편, 바닥 자국, 발자국, 화면 흔들림, 히트 스톱, 슬로모션, 카메라
export class Effects {
  constructor(scene, camera) {
    this.camera = camera;
    this.base = new THREE.Vector3(0, 24, 21);
    this.target = new THREE.Vector3(0, 0, 0.6);
    this.focus = new THREE.Vector3();
    this.zoom = 0;
    this.shake = 0;
    this.stop = 0;
    this.slow = 0;

    const chunk = new THREE.IcosahedronGeometry(0.08, 0);
    const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, flatShading: true });
    this.parts = Array.from({ length: 320 }, () => {
      const m = new THREE.Mesh(chunk, white);
      m.visible = false;
      scene.add(m);
      return { m, v: new THREE.Vector3(), life: 0, max: 1, size: 1 };
    });
    this.pi = 0;

    const flat = (geo, color, count) => Array.from({ length: count }, () => {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color, roughness: 1, transparent: true, opacity: 0, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2,
      }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.receiveShadow = true;
      scene.add(m);
      return { m, life: 0, max: 1, peak: 1 };
    });
    this.marks = flat(new THREE.CircleGeometry(0.36, 14), '#d5e1f1', 40);
    this.feet = flat(new THREE.CircleGeometry(0.1, 8), '#c9d8ec', 180);
    this.mi = 0;
    this.fi = 0;
  }

  burst(p, n = 14, speed = 4, size = 1, dir = null) {
    for (let i = 0; i < n; i++) {
      this.pi = (this.pi + 1) % this.parts.length;
      const q = this.parts[this.pi];
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
      q.m.visible = true;
      q.m.position.copy(p);
      q.v.set(Math.cos(a) * s, 1.5 + Math.random() * 4, Math.sin(a) * s);
      if (dir) q.v.addScaledVector(dir, 0.25 * Math.random());
      q.life = q.max = 0.45 + Math.random() * 0.4;
      q.size = size * (0.6 + Math.random() * 0.9);
      q.m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    }
  }

  puff(p) {
    this.pi = (this.pi + 1) % this.parts.length;
    const q = this.parts[this.pi];
    q.m.visible = true;
    q.m.position.copy(p);
    q.v.set((Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4);
    q.life = q.max = 0.22;
    q.size = 0.55;
  }

  mark(x, z, s = 1) {
    this.mi = (this.mi + 1) % this.marks.length;
    const k = this.marks[this.mi];
    k.m.visible = true;
    k.m.position.set(x, terrainHeight(x, z) + 0.02, z);
    k.m.scale.setScalar(s * (0.8 + Math.random() * 0.4));
    k.m.rotation.z = Math.random() * 6;
    k.life = k.max = 6;
    k.peak = 0.9;
  }

  footprint(x, z, ang) {
    this.fi = (this.fi + 1) % this.feet.length;
    const k = this.feet[this.fi];
    k.m.visible = true;
    k.m.position.set(x, terrainHeight(x, z) + 0.02, z);
    k.m.scale.set(1, 1.55, 1);
    k.m.rotation.z = ang;
    k.life = k.max = 7;
    k.peak = 0.75;
  }

  addShake(a) { this.shake = Math.min(1, this.shake + a); }
  hitStop(t) { this.stop = Math.max(this.stop, t); }
  slowMo(t, p) { this.slow = t; this.focus.copy(p); }

  // 실제 경과 시간을 게임 시간으로 바꾼다 (히트 스톱 0배, 슬로모션 0.25배)
  scale(realDt) {
    if (this.stop > 0) { this.stop -= realDt; return 0; }
    if (this.slow > 0) { this.slow -= realDt; return realDt * 0.25; }
    return realDt;
  }

  clear() {
    for (const q of this.parts) { q.life = 0; q.m.visible = false; }
    for (const k of [...this.marks, ...this.feet]) { k.life = 0; k.m.visible = false; }
    this.slow = this.stop = this.shake = 0;
  }

  update(dt, realDt) {
    for (const q of this.parts) {
      if (q.life <= 0) continue;
      q.life -= dt;
      q.v.y -= 18 * dt;
      q.m.position.addScaledVector(q.v, dt);
      const gy = terrainHeight(q.m.position.x, q.m.position.z) + 0.03;
      if (q.m.position.y < gy) { q.m.position.y = gy; q.v.multiplyScalar(0.3); }
      q.m.scale.setScalar(Math.max(0.001, q.size * Math.min(1, (q.life / q.max) * 2)));
      if (q.life <= 0) q.m.visible = false;
    }
    for (const k of this.marks.concat(this.feet)) {
      if (k.life <= 0) continue;
      k.life -= realDt;
      k.m.material.opacity = Math.max(0, Math.min(k.peak, k.life / 2));
      if (k.life <= 0) k.m.visible = false;
    }

    // 카메라: 슬로모션 중엔 결정타 지점으로 살짝 다가간다
    this.zoom += ((this.slow > 0 ? 1 : 0) - this.zoom) * (1 - Math.exp(-5 * realDt));
    this.shake = Math.max(0, this.shake - realDt * 2.4);
    tmp.copy(this.focus).add({ x: 0, y: 12, z: 10.5 });
    this.camera.position.copy(this.base).lerp(tmp, this.zoom * 0.45);
    const s = this.shake * this.shake * 0.7;
    this.camera.position.x += (Math.random() - 0.5) * s;
    this.camera.position.y += (Math.random() - 0.5) * s;
    look.copy(this.target).lerp(this.focus, this.zoom * 0.45);
    this.camera.lookAt(look);
  }
}
