import * as THREE from 'three';

// 날아가는 눈덩이. 매 프레임 { id, x, y, z } 목록을 받아 그린다.
export class BallsView {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;
    this.geo = new THREE.IcosahedronGeometry(0.17, 1);
    this.mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75, flatShading: true });
    this.stoneGeo = new THREE.OctahedronGeometry(0.2, 0);
    this.stoneMat = new THREE.MeshStandardMaterial({ color: '#8fd3ff', roughness: 0.2, metalness: 0.1, flatShading: true, emissive: '#3aa6e8', emissiveIntensity: 0.6 });
    this.map = new Map();
    this.tmp = new THREE.Vector3();
  }

  set(list, dt) {
    const seen = new Set();
    for (const b of list) {
      seen.add(b.id);
      let e = this.map.get(b.id);
      if (!e) {
        const stone = b.kind === 'stone';
        const m = new THREE.Mesh(stone ? this.stoneGeo : this.geo, stone ? this.stoneMat : this.mat);
        if (stone) m.scale.set(1, 0.8, 1.6);
        m.castShadow = true;
        this.scene.add(m);
        e = { m, trail: 0 };
        this.map.set(b.id, e);
      }
      e.m.position.set(b.x, b.y, b.z);
      if (b.kind === 'stone') {
        e.m.rotation.y = Math.atan2(b.vx || 0, b.vz || 1);
        e.m.rotation.z += dt * 14;
      } else e.m.rotation.x += dt * 10;
      e.trail -= dt;
      if (e.trail <= 0 && dt > 0) { e.trail = 0.035; this.fx.puff(e.m.position); }
    }
    for (const [id, e] of this.map) {
      if (!seen.has(id)) { this.scene.remove(e.m); this.map.delete(id); }
    }
  }
}
