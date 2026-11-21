import * as THREE from 'three';
import { terrainHeight } from './world.js';

const tmp = new THREE.Vector3(), look = new THREE.Vector3();
const dummy = new THREE.Object3D();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const GROUND = new THREE.Color('#f6f8fc');
const col = new THREE.Color();

// 같은 모양을 한 번에 그리는 묶음 (그리기 호출 1번)
function instanced(scene, geo, mat, n) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false;
  for (let i = 0; i < n; i++) m.setMatrixAt(i, ZERO);
  scene.add(m);
  return m;
}

// 파편, 바닥 자국, 발자국, 화면 흔들림, 히트 스톱, 슬로모션, 카메라
export class Effects {
  // base: 카메라 기본 위치, flip: 파랑팀이면 -1 (경기장을 뒤집어서 내 진영이 아래로 오게)
  constructor(scene, camera, base, flip = 1) {
    this.camera = camera;
    this.flip = flip;
    this.local = true; // 연습 모드만 히트 스톱과 슬로모션으로 게임 시간을 늦춘다
    this.base = base.clone();
    this.target = new THREE.Vector3(0, 0, 0.6 * flip);
    this.zoomT = 0;
    this.focus = new THREE.Vector3();
    this.zoom = 0;
    this.shake = 0;
    this.stop = 0;
    this.slow = 0;

    const P = 320;
    this.pMesh = instanced(scene, new THREE.IcosahedronGeometry(0.08, 0),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, flatShading: true }), P);
    this.parts = Array.from({ length: P }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), rx: 0, ry: 0, life: 0, max: 1, size: 1, on: false }));
    this.pi = 0;

    // 바닥 자국: 색을 바닥색으로 서서히 되돌려서 사라지게 한다
    const flat = (geo, color, n) => {
      const mesh = instanced(scene, geo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }), n);
      mesh.receiveShadow = true;
      for (let i = 0; i < n; i++) mesh.setColorAt(i, GROUND);
      return { mesh, color: new THREE.Color(color), list: Array.from({ length: n }, () => ({ life: 0, max: 1, on: false })), i: 0 };
    };
    this.marks = flat(new THREE.CircleGeometry(0.36, 14), '#d2dff0', 40);
    this.feet = flat(new THREE.CircleGeometry(0.1, 8), '#c9d8ec', 180);
  }

  burst(p, n = 14, speed = 4, size = 1, dir = null) {
    for (let i = 0; i < n; i++) {
      this.pi = (this.pi + 1) % this.parts.length;
      const q = this.parts[this.pi];
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
      q.p.copy(p);
      q.v.set(Math.cos(a) * s, 1.5 + Math.random() * 4, Math.sin(a) * s);
      if (dir) q.v.addScaledVector(dir, 0.25 * Math.random());
      q.life = q.max = 0.45 + Math.random() * 0.4;
      q.size = size * (0.6 + Math.random() * 0.9);
      q.rx = Math.random() * 3; q.ry = Math.random() * 3;
      q.on = true;
    }
  }

  puff(p) {
    this.pi = (this.pi + 1) % this.parts.length;
    const q = this.parts[this.pi];
    q.p.copy(p);
    q.v.set((Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4);
    q.life = q.max = 0.22;
    q.size = 0.55;
    q.on = true;
  }

  stamp(set, x, z, rz, sx, sz, life) {
    set.i = (set.i + 1) % set.list.length;
    const k = set.list[set.i];
    dummy.position.set(x, terrainHeight(x, z) + 0.02, z);
    dummy.rotation.set(-Math.PI / 2, 0, rz);
    dummy.scale.set(sx, sz, 1);
    dummy.updateMatrix();
    set.mesh.setMatrixAt(set.i, dummy.matrix);
    set.mesh.instanceMatrix.needsUpdate = true;
    k.life = k.max = life;
    k.on = true;
  }

  mark(x, z, s = 1) {
    const r = s * (0.8 + Math.random() * 0.4);
    this.stamp(this.marks, x, z, Math.random() * 6, r, r, 6);
  }

  footprint(x, z, ang) { this.stamp(this.feet, x, z, ang, 1, 1.55, 7); }

  addShake(a) { this.shake = Math.min(1, this.shake + a); }
  hitStop(t) { this.stop = Math.max(this.stop, t); }
  slowMo(t, p) { if (this.local) this.slow = t; this.zoomT = t; this.focus.copy(p); }

  // 실제 경과 시간을 게임 시간으로 바꾼다 (히트 스톱 0배, 슬로모션 0.25배)
  scale(realDt) {
    if (!this.local) return realDt;
    if (this.stop > 0) { this.stop -= realDt; return 0; }
    if (this.slow > 0) { this.slow -= realDt; return realDt * 0.25; }
    return realDt;
  }

  clear() {
    for (const q of this.parts) q.life = 0;
    for (const set of [this.marks, this.feet]) for (const k of set.list) k.life = 0;
    this.slow = this.stop = this.shake = this.zoomT = 0;
  }

  update(dt, realDt) {
    let dirty = false;
    this.parts.forEach((q, i) => {
      if (!q.on) return;
      dirty = true;
      if (q.life <= 0) { q.on = false; this.pMesh.setMatrixAt(i, ZERO); return; }
      q.life -= dt;
      q.v.y -= 18 * dt;
      q.p.addScaledVector(q.v, dt);
      const gy = terrainHeight(q.p.x, q.p.z) + 0.03;
      if (q.p.y < gy) { q.p.y = gy; q.v.multiplyScalar(0.3); }
      dummy.position.copy(q.p);
      dummy.rotation.set(q.rx, q.ry, 0);
      dummy.scale.setScalar(Math.max(0.001, q.size * Math.min(1, (q.life / q.max) * 2)));
      dummy.updateMatrix();
      this.pMesh.setMatrixAt(i, dummy.matrix);
    });
    if (dirty) this.pMesh.instanceMatrix.needsUpdate = true;

    for (const set of [this.marks, this.feet]) {
      let changed = false;
      set.list.forEach((k, i) => {
        if (!k.on) return;
        changed = true;
        k.life -= realDt;
        if (k.life <= 0) { k.on = false; set.mesh.setMatrixAt(i, ZERO); set.mesh.instanceMatrix.needsUpdate = true; return; }
        set.mesh.setColorAt(i, col.copy(GROUND).lerp(set.color, Math.min(1, k.life / 2)));
      });
      if (changed && set.mesh.instanceColor) set.mesh.instanceColor.needsUpdate = true;
    }

    // 카메라: 슬로모션 중엔 결정타 지점으로 살짝 다가간다
    this.zoomT = Math.max(0, this.zoomT - realDt);
    this.zoom += ((this.zoomT > 0 ? 1 : 0) - this.zoom) * (1 - Math.exp(-5 * realDt));
    this.shake = Math.max(0, this.shake - realDt * 2.4);
    tmp.copy(this.focus).add({ x: 0, y: 12, z: 10.5 * this.flip });
    this.camera.position.copy(this.base).lerp(tmp, this.zoom * 0.45);
    const s = this.shake * this.shake * 0.7;
    this.camera.position.x += (Math.random() - 0.5) * s;
    this.camera.position.y += (Math.random() - 0.5) * s;
    look.copy(this.target).lerp(this.focus, this.zoom * 0.45);
    this.camera.lookAt(look);
  }
}
