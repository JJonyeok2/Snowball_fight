import * as THREE from 'three';

// 키보드와 마우스를 sim 입력 { mx, mz, ax, az, pack, charge, dash } 으로 바꾼다.
export class LocalInput {
  constructor(canvas) {
    this.camera = null;
    this.flip = 1; // 파랑팀은 화면이 뒤집혀 있으니 이동 방향도 뒤집는다
    this.keys = new Set();
    this.l = false;
    this.lLatch = false; // 아주 짧은 클릭도 놓치지 않게
    this.r = false;
    this.dashQueued = false;
    this.ndc = new THREE.Vector2();
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hit = new THREE.Vector3();

    addEventListener('keydown', e => {
      if (e.target.closest && e.target.closest('input, textarea')) return;
      if (e.code === 'Space' || e.code.startsWith('Shift') || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat && e.code.startsWith('Shift')) this.dashQueued = true;
      this.keys.add(e.code);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.releaseAll());
    addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect();
      this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    });
    canvas.addEventListener('pointerdown', e => {
      if (e.button === 0) { this.l = true; this.lLatch = true; }
      if (e.button === 2) this.r = true;
    });
    addEventListener('pointerup', e => {
      if (e.button === 0) this.l = false;
      if (e.button === 2) this.r = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  releaseAll() {
    this.keys.clear();
    this.l = this.r = this.lLatch = false;
    this.dashQueued = false;
  }

  sample() {
    const k = this.keys, f = this.flip;
    const has = (...c) => c.some(x => k.has(x));
    const mx = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0);
    const mz = (has('KeyS', 'ArrowDown') ? 1 : 0) - (has('KeyW', 'ArrowUp') ? 1 : 0);
    if (this.camera) {
      this.ray.setFromCamera(this.ndc, this.camera);
      this.ray.ray.intersectPlane(this.plane, this.hit);
    }
    const I = {
      mx: mx * f, mz: mz * f, ax: this.hit.x, az: this.hit.z,
      pack: k.has('Space') || this.r, charge: this.l || this.lLatch, dash: this.dashQueued,
    };
    this.lLatch = false;
    this.dashQueued = false;
    return I;
  }
}
