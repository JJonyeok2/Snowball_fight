import * as THREE from 'three';

export const mat = (color, o = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...o });

export function mesh(geo, material, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

let HX = 15, HZ = 10;
// 모드마다 경기장 크기가 달라서 무대를 만들기 전에 먼저 정한다
export function setArena(M) { HX = M.w / 2; HZ = M.d / 2; }
const rand = (a, b) => a + Math.random() * (b - a);

// 경기장 안은 거의 평평하고, 밖으로 갈수록 눈 언덕이 솟는다.
export function terrainHeight(x, z) {
  const ax = Math.max(0, Math.abs(x) - HX - 0.5);
  const az = Math.max(0, Math.abs(z) - HZ - 0.5);
  const out = Math.min(1, Math.hypot(ax, az) / 6);
  const n = Math.sin(x * 0.37 + 1.3) * Math.cos(z * 0.41) * 0.5
    + Math.sin(x * 0.93 + z * 0.71) * 0.25
    + Math.sin(x * 2.1 - z * 1.7) * 0.06;
  return n * (0.04 + out * 0.9) + out * 0.6;
}

function tree(scene, x, z, s) {
  const g = new THREE.Group();
  g.position.set(x, terrainHeight(x, z), z);
  g.scale.setScalar(s);
  g.rotation.y = Math.random() * 6;
  scene.add(g);
  mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.8, 6), mat('#6b4f3a'), g, 0, 0.4, 0);
  const pine = mat('#2f5d50'), snow = mat('#ffffff');
  [[1.35, 1.4, 1.25], [1.05, 1.25, 2.05], [0.72, 1.05, 2.75]].forEach(([r, h, y]) => {
    mesh(new THREE.ConeGeometry(r, h, 7), pine, g, 0, y, 0);
    mesh(new THREE.ConeGeometry(r * 0.6, h * 0.5, 7), snow, g, 0, y + h * 0.28, 0);
  });
}

function snowman(scene, x, z, ry) {
  const g = new THREE.Group();
  g.position.set(x, terrainHeight(x, z), z);
  g.rotation.y = ry;
  scene.add(g);
  const w = mat('#f7f9fd'), coal = mat('#2a2a33');
  mesh(new THREE.IcosahedronGeometry(0.6, 1), w, g, 0, 0.55, 0);
  mesh(new THREE.IcosahedronGeometry(0.45, 1), w, g, 0, 1.35, 0);
  mesh(new THREE.IcosahedronGeometry(0.32, 1), w, g, 0, 1.95, 0);
  const nose = mesh(new THREE.ConeGeometry(0.06, 0.3, 6), mat('#f08a24'), g, 0, 1.95, 0.42);
  nose.rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.045, 6, 4), coal, g, -0.11, 2.04, 0.28);
  mesh(new THREE.SphereGeometry(0.045, 6, 4), coal, g, 0.11, 2.04, 0.28);
  for (const y of [1.25, 1.45]) mesh(new THREE.SphereGeometry(0.05, 6, 4), coal, g, 0, y, 0.44);
  const stick = mat('#5a4030');
  for (const sd of [-1, 1]) {
    const a = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), stick, g, sd * 0.75, 1.5, 0);
    a.rotation.z = sd * 1.0;
  }
  mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.32, 10), coal, g, 0, 2.35, 0);
  mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 10), coal, g, 0, 2.2, 0);
}

function sled(scene, x, z, ry) {
  const g = new THREE.Group();
  g.position.set(x, terrainHeight(x, z), z);
  g.rotation.y = ry;
  scene.add(g);
  const red = mat('#b8483a'), metal = mat('#3e4352', { metalness: 0.4, roughness: 0.5 });
  for (let i = 0; i < 4; i++) mesh(new THREE.BoxGeometry(0.75, 0.06, 0.26), red, g, 0, 0.42, -0.55 + i * 0.36);
  for (const sx of [-0.33, 0.33]) {
    mesh(new THREE.BoxGeometry(0.06, 0.06, 1.6), metal, g, sx, 0.08, 0);
    mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), metal, g, sx, 0.25, -0.45);
    mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), metal, g, sx, 0.25, 0.45);
    const curl = mesh(new THREE.TorusGeometry(0.18, 0.03, 5, 10, Math.PI), metal, g, sx, 0.26, 0.8);
    curl.rotation.y = Math.PI / 2;
  }
}

export function createWorld(scene) {
  const sx = HX / 15, sz = HZ / 10;
  const bg = new THREE.Color('#dcc8d6');
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 42, 78);

  // 해 질 녘: 따뜻한 햇빛 + 파란 그늘
  scene.add(new THREE.HemisphereLight('#cfe0ff', '#6b7fb5', 1.25));
  const sun = new THREE.DirectionalLight('#ffc48a', 2.7);
  sun.position.set(-14, 16, -10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -(HX + 11), right: HX + 11, top: HZ + 12, bottom: -(HZ + 12), near: 1, far: 90 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  // 바닥
  const gg = new THREE.PlaneGeometry(120, 90, 120, 90);
  gg.rotateX(-Math.PI / 2);
  const gp = gg.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, terrainHeight(gp.getX(i), gp.getZ(i)));
  gg.computeVertexNormals();
  const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: '#f6f8fc', roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // 경기장 둘레 눈 둔덕
  const lumps = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat('#eef3fa'), 100);
  lumps.castShadow = lumps.receiveShadow = true;
  const d = new THREE.Object3D();
  let n = 0;
  const lump = (x, z) => {
    d.position.set(x, 0.05, z);
    d.scale.set(rand(0.8, 1.2), rand(0.35, 0.55), rand(0.7, 1.0));
    d.rotation.y = Math.random() * 3;
    d.updateMatrix();
    lumps.setMatrixAt(n++, d.matrix);
  };
  for (let x = -HX - 1; x <= HX + 1; x += 1.3) { lump(x, -HZ - 0.95); lump(x, HZ + 0.95); }
  for (let z = -HZ + 0.4; z <= HZ - 0.4; z += 1.3) { lump(-HX - 0.95, z); lump(HX + 0.95, z); }
  lumps.count = n;
  scene.add(lumps);

  // 중앙선
  const dash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.02, 0.1), mat('#a9bedd'), 30);
  n = 0;
  for (let x = -HX + 0.5; x < HX; x += 1) {
    d.position.set(x, 0.04, 0); d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0); d.updateMatrix();
    dash.setMatrixAt(n++, d.matrix);
  }
  dash.count = n;
  dash.receiveShadow = true;
  scene.add(dash);

  // 나무
  [[-19, -8, 1.3], [-21, 2, 1.1], [-19.5, 9, 1.5], [19, -9, 1.4], [21, 1, 1.2], [19.6, 8.5, 1.1],
   [-10, -15, 1.2], [4, -15.5, 1.5], [12, -14.5, 1.0], [-3, -16, 1.0], [-16, -13.5, 1.4], [17, -13.5, 1.3],
   [-23, -4, 1.3], [23, -4, 1.4], [-22, 12, 1.2], [22, 12, 1.3]]
    .forEach(([x, z, s]) => tree(scene, x * sx, z * sz, s));

  // 뒤쪽 나무 울타리
  const wood = mat('#8a6448');
  const fz = -(HZ + 2.6), fx = Math.floor(HX - 3);
  for (let x = -fx; x <= fx; x += 2) mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6), wood, scene, x, 0.55 + terrainHeight(x, fz), fz);
  for (const y of [0.45, 0.85]) mesh(new THREE.BoxGeometry(fx * 2 + 0.4, 0.1, 0.06), wood, scene, 0, y + 0.1 + terrainHeight(0, fz), fz);

  snowman(scene, -(HX + 2.6), -5.5 * sz, 0.9);
  snowman(scene, HX + 2.8, 4.5 * sz, -2.2);
  sled(scene, HX + 2.2, -6.5 * sz, 0.5);
  sled(scene, -(HX + 2.4), 6.8 * sz, -0.4);

  // 랜턴
  const lamps = [];
  const post = mat('#3a3340'), glow = mat('#ffd28a', { emissive: '#ffb24d', emissiveIntensity: 1.6 });
  for (const [x, z] of [[-(HX + 1.6), -(HZ + 1)], [HX + 1.6, -(HZ + 1)], [-(HX + 1.6), HZ + 1], [HX + 1.6, HZ + 1]]) {
    const y0 = terrainHeight(x, z);
    mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.2, 6), post, scene, x, y0 + 1.1, z);
    mesh(new THREE.BoxGeometry(0.34, 0.42, 0.34), glow, scene, x, y0 + 2.35, z);
    mesh(new THREE.ConeGeometry(0.3, 0.22, 4), post, scene, x, y0 + 2.67, z).rotation.y = Math.PI / 4;
    const L = new THREE.PointLight('#ffad55', 14, 10, 1.6);
    L.position.set(x, y0 + 2.2, z);
    scene.add(L);
    lamps.push(L);
  }

  // 내리는 눈
  const FN = 900, fp = new Float32Array(FN * 3);
  for (let i = 0; i < FN; i++) {
    fp[i * 3] = rand(-HX - 17, HX + 17); fp[i * 3 + 1] = rand(0, 30); fp[i * 3 + 2] = rand(-HZ - 14, HZ + 14);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const c2 = cv.getContext('2d');
  const gr = c2.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  c2.fillStyle = gr;
  c2.fillRect(0, 0, 32, 32);
  const flakes = new THREE.Points(fg, new THREE.PointsMaterial({
    size: 0.22, map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, opacity: 0.9,
  }));
  scene.add(flakes);

  return {
    update(dt, t) {
      const a = fg.attributes.position.array;
      for (let i = 0; i < FN; i++) {
        a[i * 3 + 1] -= dt * (1.1 + (i % 5) * 0.25);
        a[i * 3] += Math.sin(t * 0.7 + i) * dt * 0.35;
        if (a[i * 3 + 1] < 0) a[i * 3 + 1] = 30;
      }
      fg.attributes.position.needsUpdate = true;
      lamps.forEach((L, i) => { L.intensity = 14 + Math.sin(t * 9 + i * 2) * 0.8 + Math.sin(t * 23 + i) * 0.5; });
    },
  };
}
