import * as THREE from 'three';

// 키보드와 마우스를 Fighter용 intent로 바꾼다.
export class LocalInput {
  constructor(canvas, camera) {
    this.camera = camera;
    this.keys = new Set();
    this.l = false;
    this.r = false;
    this.dashQueued = false;
    this.ndc = new THREE.Vector2();
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.intent = { mx: 0, mz: 0, aim: new THREE.Vector3(0, 0, -8), pack: false, charge: false, dash: false };

    addEventListener('keydown', e => {
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
      if (e.button === 0) this.l = true;
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
    this.l = this.r = false;
    this.dashQueued = false;
  }

  update() {
    const k = this.keys, I = this.intent;
    const has = (...c) => c.some(x => k.has(x));
    I.mx = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0);
    I.mz = (has('KeyS', 'ArrowDown') ? 1 : 0) - (has('KeyW', 'ArrowUp') ? 1 : 0);
    I.pack = k.has('Space') || this.r;
    I.charge = this.l;
    I.dash = this.dashQueued;
    this.dashQueued = false;
    this.ray.setFromCamera(this.ndc, this.camera);
    this.ray.ray.intersectPlane(this.plane, I.aim);
  }
}
