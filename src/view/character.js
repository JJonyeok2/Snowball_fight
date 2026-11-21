import * as THREE from 'three';
import { mat, mesh } from './world.js';

// 털모자, 목도리, 벙어리장갑을 낀 통통한 로우폴리 캐릭터.
// 회전 규칙: 팔/다리 rotation.x 가 음수면 앞으로, 상체 rotation.x 가 양수면 앞으로 숙인다.
export function buildCharacter(color, accent) {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);

  const coat = mat(color);
  const acc = mat(accent);
  const dark = mat('#2d3448');
  const skin = mat('#f2cfb0');
  const white = mat('#f7f9fc');

  const legGeo = new THREE.CapsuleGeometry(0.13, 0.22, 3, 8);
  const bootGeo = new THREE.SphereGeometry(0.15, 8, 6);
  const leg = sx => {
    const g = new THREE.Group();
    g.position.set(sx, 0.42, 0);
    rig.add(g);
    mesh(legGeo, dark, g, 0, -0.2, 0);
    mesh(bootGeo, dark, g, 0, -0.33, 0.05).scale.set(1, 0.7, 1.35);
    return g;
  };
  const legL = leg(-0.18), legR = leg(0.18);

  const torso = new THREE.Group();
  torso.position.y = 0.45;
  rig.add(torso);
  mesh(new THREE.SphereGeometry(0.52, 10, 8), coat, torso, 0, 0.42, 0).scale.set(1, 1.08, 0.92);
  mesh(new THREE.BoxGeometry(0.06, 0.58, 0.05), acc, torso, 0, 0.4, 0.46);
  mesh(new THREE.TorusGeometry(0.3, 0.1, 6, 14), acc, torso, 0, 0.88, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.15, 0.4, 0.06), acc, torso, 0.17, 0.68, 0.33).rotation.z = 0.18;

  const head = new THREE.Group();
  head.position.y = 1.12;
  torso.add(head);
  mesh(new THREE.SphereGeometry(0.34, 12, 10), skin, head);
  for (const sx of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.045, 8, 6), dark, head, sx * 0.12, 0.03, 0.31);
    mesh(new THREE.SphereGeometry(0.05, 8, 6), mat('#f29a94'), head, sx * 0.2, -0.08, 0.26).scale.z = 0.5;
  }
  mesh(new THREE.SphereGeometry(0.36, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), acc, head, 0, 0.06, 0).scale.y = 1.05;
  mesh(new THREE.TorusGeometry(0.33, 0.07, 6, 16), white, head, 0, 0.07, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.1, 8, 6), white, head, 0, 0.47, 0);

  const armGeo = new THREE.CapsuleGeometry(0.11, 0.3, 3, 8);
  const mittGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const arm = sx => {
    const g = new THREE.Group();
    g.position.set(sx * 0.5, 0.7, 0);
    torso.add(g);
    mesh(armGeo, coat, g, 0, -0.22, 0);
    mesh(mittGeo, acc, g, 0, -0.45, 0);
    return g;
  };
  const armL = arm(-1), armR = arm(1);

  const held = mesh(new THREE.IcosahedronGeometry(0.16, 1), white, armR, 0, -0.56, 0.1);
  held.visible = false;
  const packBall = mesh(new THREE.IcosahedronGeometry(0.2, 1), white, root, 0, 0.2, 0.62);
  packBall.visible = false;

  // 맞을수록 몸에 눈이 덕지덕지 붙는다
  const patchGeo = new THREE.IcosahedronGeometry(0.13, 0);
  const patches = [
    [torso, 0.22, 0.55, 0.42], [torso, -0.28, 0.32, 0.38], [head, 0.12, 0.2, 0.26],
    [torso, 0.05, 0.2, 0.47], [torso, -0.15, 0.75, 0.36], [head, -0.18, 0.28, 0.18],
  ].map(([p, x, y, z]) => {
    const m = mesh(patchGeo, white, p, x, y, z);
    m.scale.set(1.2, 1, 0.55);
    m.rotation.set(Math.random(), Math.random(), Math.random());
    m.visible = false;
    return m;
  });

  return { root, rig, torso, head, legL, legR, armL, armR, held, packBall, patches, coat };
}

const damp = (cur, tgt, k, dt) => cur + (tgt - cur) * (1 - Math.exp(-k * dt));

// 상태(f)를 보고 매 프레임 포즈를 만든다.
export function animate(m, f, dt, t) {
  const A = f.anim;
  const moving = f.speedNow > 0.6;
  A.walk += f.speedNow * dt * 2.6;
  const sw = moving ? Math.sin(A.walk) : 0;

  let legL = sw * 0.75, legR = -sw * 0.75;
  let armL = -sw * 0.6, armR = sw * 0.6, armLz = 0, armRz = 0;
  let lean = moving ? 0.12 : 0, twist = 0, headX = 0, rigRot = 0, sq = 1;
  let rigY = moving ? Math.abs(Math.cos(A.walk)) * 0.07 : Math.sin(t * 2.2) * 0.012;
  let kArm = 16;
  m.held.visible = false;
  m.packBall.visible = false;

  if (f.down) {
    rigRot = -1.5; rigY = 0.38; armL = 2.6; armR = 2.6; armLz = -0.5; armRz = 0.5; legL = -0.3; legR = 0.2; lean = 0;
  } else if (f.win) {
    rigY = Math.abs(Math.sin(t * 5.5)) * 0.4; armL = armR = 2.9; armLz = -0.25; armRz = 0.25; legL = legR = 0; lean = -0.1;
  } else if (f.hitT > 0) {
    const k = f.hitT / 0.3;
    lean = -0.55 * k; armL = 1.4 * k; armR = 1.6 * k; armLz = -0.6 * k; armRz = 0.6 * k; headX = -0.4 * k;
  } else if (f.dashT > 0) {
    lean = 0.7; armL = armR = 1.3; legL = -0.8; legR = 0.6; sq = 0.86;
  } else if (f.throwT > 0) {
    const k = 1 - f.throwT / 0.25, e = 1 - (1 - k) ** 3;
    armR = 2.6 + (-1.4 - 2.6) * e; armL = -0.6 * (1 - e) + 0.5 * e;
    lean = 0.35 * Math.sin(k * Math.PI); twist = 0.45 - 0.9 * e; kArm = 45;
  } else if (f.charging) {
    const c = f.chargeFrac;
    armR = 2.3 + c * 0.5; armL = -1.1; lean = -0.12 - c * 0.12; twist = 0.25 + c * 0.25;
    m.held.visible = true;
    m.held.scale.setScalar(1 + c * 0.25);
  } else if (f.packing) {
    const r = Math.sin(t * 13) * 0.25;
    rigY = -0.22; lean = 0.6; legL = legR = -1.1; armL = -1.0 + r; armR = -1.0 - r; headX = 0.2;
    m.packBall.visible = true;
    m.packBall.scale.setScalar(0.35 + f.pack * 0.75);
    m.packBall.rotation.x += dt * 6;
  }

  m.legL.rotation.x = damp(m.legL.rotation.x, legL, 16, dt);
  m.legR.rotation.x = damp(m.legR.rotation.x, legR, 16, dt);
  m.armL.rotation.x = damp(m.armL.rotation.x, armL, kArm, dt);
  m.armR.rotation.x = damp(m.armR.rotation.x, armR, kArm, dt);
  m.armL.rotation.z = damp(m.armL.rotation.z, armLz, 16, dt);
  m.armR.rotation.z = damp(m.armR.rotation.z, armRz, 16, dt);
  m.torso.rotation.x = damp(m.torso.rotation.x, lean, 12, dt);
  m.torso.rotation.y = damp(m.torso.rotation.y, twist, f.throwT > 0 ? 30 : 14, dt);
  m.head.rotation.x = damp(m.head.rotation.x, headX, 14, dt);
  m.rig.position.y = damp(m.rig.position.y, rigY, 18, dt);
  m.rig.rotation.x = damp(m.rig.rotation.x, rigRot, 7, dt);
  m.rig.scale.y = damp(m.rig.scale.y, sq, 20, dt);

  const fl = f.flash > 0 ? f.flash * 5 : 0;
  m.coat.emissive.setRGB(fl, fl, fl);
}
