import * as THREE from 'three';
import { RULES } from '../../shared/rules.js';

const rand = (a, b) => a + Math.random() * (b - a);

// 눈 벽돌을 2단으로 쌓은 벽의 모습. 상태는 sim이 갖고, 여기선 그리기와 파편만 맡는다.
export class WallsView {
  constructor(scene, walls) {
    this.scene = scene;
    this.debris = [];
    const brickGeo = new THREE.BoxGeometry(0.72, 0.5, 0.78);
    const capGeo = new THREE.BoxGeometry(0.7, 0.1, 0.74);
    const tones = ['#eef3fa', '#e4ecf6', '#f3f6fb', '#dfe8f3'].map(c => new THREE.MeshStandardMaterial({
      color: c, roughness: 0.95, flatShading: true, emissive: '#6f7f9f', emissiveIntensity: 0.22,
    }));
    const capMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true });

    this.list = walls.map(({ x, z }) => {
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
      return { g, hp: RULES.wallHp, lower, upper };
    });
  }

  // 공이 벽에 맞았을 때 (hp: 맞은 뒤 남은 체력)
  hit(wid, hp, vx, vz) {
    const w = this.list[wid];
    if (!w || hp >= w.hp) return;
    const push = new THREE.Vector3(vx, 0, vz).normalize();
    const drop = [];
    if (w.hp >= 2 && hp <= 1) drop.push(...w.upper);
    if (hp <= 0) drop.push(...w.lower);
    w.hp = hp;
    for (const b of drop) {
      if (b.parent !== w.g) continue;
      this.scene.attach(b);
      const v = push.clone().multiplyScalar(rand(2, 5));
      v.x += rand(-1.5, 1.5);
      v.y = rand(2, 5.5);
      this.debris.push({ b, v, spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), life: 2.2 });
    }
  }

  // 새 라운드처럼 체력이 다시 올라가면 벽을 다시 세운다
  sync(hps) {
    if (!hps) return;
    if (this.list.some((w, i) => hps[i] > w.hp)) this.reset();
  }

  reset() {
    for (const d of this.debris) d.b.visible = false;
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
}
