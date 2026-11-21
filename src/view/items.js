import * as THREE from 'three';
import { RULES } from '../../shared/rules.js';

// 하늘에서 떨어지는 얼음돌 꾸러미. 떨어지는 동안 바닥에 착지 표시가 깜빡인다.
export class ItemsView {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map();
    this.crystalGeo = new THREE.OctahedronGeometry(0.22, 0);
    this.crystalMat = new THREE.MeshStandardMaterial({ color: '#9fdcff', roughness: 0.15, flatShading: true, emissive: '#3aa6e8', emissiveIntensity: 0.8 });
    this.ringGeo = new THREE.RingGeometry(0.7, 0.9, 32);
  }

  make() {
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    [[0, 0.32, 0, 1.3], [0.22, 0.2, 0.1, 0.9], [-0.18, 0.18, -0.12, 0.8], [0.05, 0.16, -0.25, 0.7]].forEach(([x, y, z, s]) => {
      const m = new THREE.Mesh(this.crystalGeo, this.crystalMat);
      m.position.set(x, y, z);
      m.scale.set(s, s * 1.6, s);
      m.rotation.set(Math.random() * 0.4, Math.random() * 3, Math.random() * 0.4);
      m.castShadow = true;
      body.add(m);
    });
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: '#3aa6e8', transparent: true, opacity: 0.7, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);
    this.scene.add(g);
    return { g, body, ring };
  }

  // list: [{ id, x, z, fallT }]
  update(list, t) {
    const seen = new Set();
    for (const it of list) {
      seen.add(it.id);
      let e = this.map.get(it.id);
      if (!e) { e = this.make(); this.map.set(it.id, e); }
      e.g.position.set(it.x, 0, it.z);
      const falling = it.fallT > 0;
      const k = falling ? it.fallT / RULES.itemFall : 0;
      e.body.position.y = falling ? k * k * 14 : 0.12 + Math.sin(t * 3 + it.id) * 0.08;
      e.body.rotation.y = t * 1.5 + it.id;
      e.ring.material.opacity = falling ? (Math.floor(t * 8) % 2 ? 0.85 : 0.3) : 0.55;
      e.ring.scale.setScalar(falling ? 1 + k * 0.6 : 1 + Math.sin(t * 4) * 0.06);
    }
    for (const [id, e] of this.map) {
      if (!seen.has(id)) { this.scene.remove(e.g); this.map.delete(id); }
    }
  }
}
