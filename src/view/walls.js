import * as THREE from 'three';
import { RULES } from '../../shared/rules.js';

const rand = (a, b) => a + Math.random() * (b - a);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const dummy = new THREE.Object3D();
const XS = [-1.11, -0.37, 0.37, 1.11];
const TONES = ['#eef3fa', '#e4ecf6', '#f3f6fb', '#dfe8f3'].map(c => new THREE.Color(c));

// 눈 벽돌을 2단으로 쌓은 벽. 벽돌 전부를 한 번에 그리고(인스턴싱), 무너질 땐 벽돌마다 따로 날린다.
export class WallsView {
  constructor(scene, walls) {
    this.walls = walls.map(w => ({ x: w.x, z: w.z, hp: RULES.wallHp }));
    const n = walls.length * 8;
    this.bricks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.72, 0.5, 0.78),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true, emissive: '#6f7f9f', emissiveIntensity: 0.22 }),
      n,
    );
    this.caps = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.7, 0.1, 0.74),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }),
      n,
    );
    for (const m of [this.bricks, this.caps]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = m.receiveShadow = true;
      m.frustumCulled = false;
      scene.add(m);
    }
    // 벽돌 하나하나: 원래 자리(home), 날아가는 중이면 위치/속도/회전
    this.list = [];
    walls.forEach((w, wi) => {
      for (let row = 0; row < 2; row++) {
        XS.forEach((bx, i) => {
          const b = {
            wall: wi, upper: row === 1,
            home: { x: w.x + bx + rand(-0.02, 0.02), y: row ? 0.76 : 0.25, z: w.z + rand(-0.025, 0.025), ry: rand(-0.04, 0.04), rz: rand(-0.02, 0.02) },
            p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), spin: new THREE.Vector3(), life: 0, state: 'home',
          };
          this.bricks.setColorAt(this.list.length, TONES[(i + row * 2 + Math.floor(Math.random() * 2)) % 4]);
          this.list.push(b);
        });
      }
    });
    this.reset();
  }

  place(i, b, pos, rot, scale = 1) {
    dummy.position.copy(pos);
    dummy.rotation.copy(rot);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    this.bricks.setMatrixAt(i, dummy.matrix);
    if (b.upper) {
      dummy.translateY(0.29 * scale);
      dummy.updateMatrix();
      this.caps.setMatrixAt(i, dummy.matrix);
    } else this.caps.setMatrixAt(i, ZERO);
  }

  // 공이 벽에 맞았을 때 (hp: 맞은 뒤 남은 체력)
  hit(wid, hp, vx, vz) {
    const w = this.walls[wid];
    if (!w || hp >= w.hp) return;
    const push = new THREE.Vector3(vx, 0, vz).normalize();
    const dropUpper = w.hp >= 2 && hp <= 1, dropLower = hp <= 0;
    w.hp = hp;
    this.list.forEach(b => {
      if (b.wall !== wid || b.state !== 'home') return;
      if (!(b.upper ? dropUpper || dropLower : dropLower)) return;
      b.state = 'fly';
      b.p.set(b.home.x, b.home.y, b.home.z);
      b.r.set(0, b.home.ry, b.home.rz);
      b.v.copy(push).multiplyScalar(rand(2, 5));
      b.v.x += rand(-1.5, 1.5);
      b.v.y = rand(2, 5.5);
      b.spin.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
      b.life = 2.2;
    });
  }

  // 새 라운드처럼 체력이 다시 올라가면 벽을 다시 세운다
  sync(hps) {
    if (!hps) return;
    if (this.walls.some((w, i) => hps[i] > w.hp)) this.reset();
  }

  reset() {
    for (const w of this.walls) w.hp = RULES.wallHp;
    this.list.forEach((b, i) => {
      b.state = 'home';
      this.place(i, b, b.p.set(b.home.x, b.home.y, b.home.z), b.r.set(0, b.home.ry, b.home.rz));
    });
    this.bricks.instanceMatrix.needsUpdate = true;
    this.caps.instanceMatrix.needsUpdate = true;
    if (this.bricks.instanceColor) this.bricks.instanceColor.needsUpdate = true;
  }

  update(dt) {
    let dirty = false;
    this.list.forEach((b, i) => {
      if (b.state !== 'fly') return;
      dirty = true;
      b.life -= dt;
      if (b.life <= 0) {
        b.state = 'gone';
        this.bricks.setMatrixAt(i, ZERO);
        this.caps.setMatrixAt(i, ZERO);
        return;
      }
      b.v.y -= 20 * dt;
      b.p.addScaledVector(b.v, dt);
      if (b.p.y < 0.2) {
        b.p.y = 0.2;
        b.v.y *= -0.25; b.v.x *= 0.6; b.v.z *= 0.6;
        b.spin.multiplyScalar(0.6);
      }
      b.r.x += b.spin.x * dt; b.r.y += b.spin.y * dt; b.r.z += b.spin.z * dt;
      this.place(i, b, b.p, b.r, b.life < 0.6 ? Math.max(0.001, b.life / 0.6) : 1);
    });
    if (dirty) {
      this.bricks.instanceMatrix.needsUpdate = true;
      this.caps.instanceMatrix.needsUpdate = true;
    }
  }
}
