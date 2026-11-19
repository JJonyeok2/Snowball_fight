import * as THREE from 'three';
import { RULES } from './config.js';

// 좌우 대칭 눈벽 배치 [x, z]
const LAYOUT = [[-8, 4], [8, 4], [0, 2.6], [-8, -4], [8, -4], [0, -2.6]];
const rand = (a, b) => a + Math.random() * (b - a);

// 눈 벽돌을 2단으로 쌓은 벽. 한 번 맞으면 윗단이, 두 번 맞으면 아랫단까지 무너진다.
export class Walls {
  constructor(scene) {
    this.scene = scene;
    this.debris = [];
    const brickGeo = new THREE.BoxGeometry(0.72, 0.5, 0.78);
    const capGeo = new THREE.BoxGeometry(0.7, 0.1, 0.74);
    const tones = ['#eef3fa', '#e4ecf6', '#f3f6fb', '#dfe8f3']
      .map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true, emissive: '#6f7f9f', emissiveIntensity: 0.22 }));
    const capMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true });

    this.list = LAYOUT.map(([x, z]) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      scene.add(g);
      const row = (y, shade) => [-1.11, -0.37, 0.37, 1.11].map((bx, i) => {
        const b = new THREE.Mesh(brickGeo, tones[(i + shade + Math.floor(Math.random() * 2)) % 4]);
        b.position.set(bx + rand(-0.02, 0.02), y, rand(-0.025, 0.025));
        b.rotation.set(0, rand(-0.04, 0.04), rand(-0.02, 0.02));
        b.castShadow = b.receiveShadow = true;
        b.userData.home = { p: b.position.clone(), r: b.rotation.clone() };
        g.add(b);
        return b;
      });
      const lower = row(0.25, 0), upper = row(0.76, 2);
      for (const b of upper) {
        const c = new THREE.Mesh(capGeo, capMat);
        c.position.y = 0.29;
        c.castShadow = true;
        b.add(c);
      }
      return { g, x, z, sx: 3, sz: 0.8, hp: RULES.wallHp, lower, upper };
    });
  }

  height(w) { return w.hp >= 2 ? 1.1 : w.hp === 1 ? 0.55 : 0; }

  // 반환값: 완전히 무너졌으면 true
  hit(w, vel) {
    w.hp--;
    const bricks = w.hp >= 1 ? w.upper : w.lower;
    const push = new THREE.Vector3(vel.x, 0, vel.z).normalize();
    for (const b of bricks) {
      this.scene.attach(b);
      const v = push.clone().multiplyScalar(rand(2, 5));
      v.x += rand(-1.5, 1.5);
      v.y = rand(2, 5.5);
      this.debris.push({ b, v, spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), life: 2.2 });
    }
    return w.hp <= 0;
  }

  update(dt) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i], p = d.b.position;
      d.life -= dt;
      d.v.y -= 20 * dt;
      p.addScaledVector(d.v, dt);
      if (p.y < 0.2) {
        p.y = 0.2;
        d.v.y *= -0.25; d.v.x *= 0.6; d.v.z *= 0.6;
        d.spin.multiplyScalar(0.6);
      }
      d.b.rotation.x += d.spin.x * dt;
      d.b.rotation.y += d.spin.y * dt;
      d.b.rotation.z += d.spin.z * dt;
      if (d.life < 0.6) d.b.scale.setScalar(Math.max(0.001, d.life / 0.6));
      if (d.life <= 0) { d.b.visible = false; this.debris.splice(i, 1); }
    }
  }

  reset() {
    this.debris.length = 0;
    for (const w of this.list) {
      w.hp = RULES.wallHp;
      for (const b of [...w.lower, ...w.upper]) {
        w.g.add(b);
        b.position.copy(b.userData.home.p);
        b.rotation.copy(b.userData.home.r);
        b.scale.setScalar(1);
        b.visible = true;
      }
    }
  }

  // 원(캐릭터)을 벽 밖으로 밀어낸다
  pushOut(p, r) {
    for (const w of this.list) {
      if (w.hp <= 0) continue;
      const hx = w.sx / 2 + r, hz = w.sz / 2 + r, dx = p.x - w.x, dz = p.z - w.z;
      if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
        if (hx - Math.abs(dx) < hz - Math.abs(dz)) p.x = w.x + Math.sign(dx || 1) * hx;
        else p.z = w.z + Math.sign(dz || 1) * hz;
      }
    }
  }

  ballHit(p) {
    for (const w of this.list) {
      if (w.hp > 0 && Math.abs(p.x - w.x) < w.sx / 2 + 0.15 && Math.abs(p.z - w.z) < w.sz / 2 + 0.15 && p.y < this.height(w)) return w;
    }
    return null;
  }
}
