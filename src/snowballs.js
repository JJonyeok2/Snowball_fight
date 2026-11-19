import * as THREE from 'three';
import { CFG, RULES } from './config.js';
import { terrainHeight } from './world.js';

// 차지 c(0~1)에 따라 사거리와 초기 속도를 정한다. 공은 정확히 사거리 지점 바닥에 떨어진다.
export function launch(c) {
  const range = CFG.minRange + (CFG.maxRange - CFG.minRange) * c;
  const vh = 12 + 10 * c;
  const t = range / vh;
  const vy = (0.5 * RULES.gravity * t * t - RULES.throwHeight) / t;
  return { range, vh, t, vy };
}

export const SPAWN_OFFSET = 0.55;

export class Snowballs {
  constructor(scene, effects) {
    this.scene = scene;
    this.fx = effects;
    this.list = [];
    this.geo = new THREE.IcosahedronGeometry(0.17, 1);
    this.mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75, flatShading: true });
  }

  spawn(owner, c) {
    const L = launch(c);
    const m = new THREE.Mesh(this.geo, this.mat);
    m.castShadow = true;
    m.position.set(owner.pos.x + owner.dir.x * SPAWN_OFFSET, RULES.throwHeight, owner.pos.z + owner.dir.z * SPAWN_OFFSET);
    this.scene.add(m);
    this.list.push({ m, v: new THREE.Vector3(owner.dir.x * L.vh, L.vy, owner.dir.z * L.vh), owner, trail: 0 });
  }

  // on: { fighter(f, ball), wall(w, ball), ground(ball) }
  update(dt, fighters, walls, on) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i], p = b.m.position;
      b.v.y -= RULES.gravity * dt;
      p.addScaledVector(b.v, dt);
      b.m.rotation.x += dt * 10;
      b.trail -= dt;
      if (b.trail <= 0 && dt > 0) { b.trail = 0.035; this.fx.puff(p); }

      let done = false;
      for (const f of fighters) {
        if (f === b.owner || f.down) continue;
        if (Math.hypot(p.x - f.pos.x, p.z - f.pos.z) < 0.6 && p.y < f.hitHeight && p.y > -0.1) {
          on.fighter(f, b); done = true; break;
        }
      }
      if (!done) {
        const w = walls.ballHit(p);
        if (w) { on.wall(w, b); done = true; }
      }
      if (!done && p.y <= terrainHeight(p.x, p.z) + 0.08) { on.ground(b); done = true; }
      if (!done && (Math.abs(p.x) > 40 || Math.abs(p.z) > 30)) done = true;
      if (done) { this.scene.remove(b.m); this.list.splice(i, 1); }
    }
  }

  clear() {
    for (const b of this.list) this.scene.remove(b.m);
    this.list.length = 0;
  }
}
