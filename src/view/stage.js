import * as THREE from 'three';
import { MODES, RULES } from '../../shared/rules.js';
import { makeWalls, launch, chargeFrac, SPAWN_OFFSET } from '../../shared/sim.js';
import { createWorld, setArena } from './world.js';
import { Effects } from './effects.js';
import { WallsView } from './walls.js';
import { BallsView } from './balls.js';
import { ItemsView } from './items.js';
import { buildCharacter, animate } from './character.js';
import { sfx } from './audio.js';

export const TEAM_COLORS = ['#e0483e', '#3a6fd8'];
const ACCENTS = [['#ffcf5a', '#ff9fc3'], ['#8fe3d2', '#ffd27a']];

// 캐릭터 한 명의 모습. 상태 객체를 받아 위치, 방향, 포즈, 발자국을 만든다.
class CharacterView {
  constructor(scene, r, isMe, fx) {
    this.id = r.id;
    this.team = r.team;
    this.isMe = isMe;
    this.fx = fx;
    this.model = buildCharacter(TEAM_COLORS[r.team], ACCENTS[r.team][r.slot % 2]);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, isMe ? 0.78 : 0.68, 28),
      new THREE.MeshBasicMaterial({ color: TEAM_COLORS[r.team], transparent: true, opacity: isMe ? 0.85 : 0.45, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    this.model.root.add(ring);
    scene.add(this.model.root);
    this.vs = { anim: { walk: 0 }, speedNow: 0, flash: 0 };
    this.yaw = null;
    this.step = 0;
    this.foot = 1;
  }

  update(p, dt, rs) {
    const vs = this.vs, root = this.model.root;
    vs.dashT = p.dashT; vs.throwT = p.throwT; vs.hitT = p.hitT; vs.down = p.down;
    vs.charging = p.charging; vs.packing = p.packing; vs.pack = p.pack;
    vs.chargeFrac = chargeFrac(p, rs.cfg);
    vs.speedNow += (p.speed - vs.speedNow) * (1 - Math.exp(-14 * dt));
    vs.flash = Math.max(0, vs.flash - dt);
    vs.win = (rs.state === 'roundEnd' || rs.state === 'matchEnd') && rs.winner === this.team && !p.down;

    root.position.set(p.x, 0, p.z);
    const target = Math.atan2(p.dx, p.dz);
    if (this.yaw === null) this.yaw = target;
    if (!p.down) {
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-(this.isMe ? 30 : 14) * dt));
    }
    root.rotation.y = this.yaw;
    animate(this.model, vs, dt, rs.time);

    const show = p.down ? 6 : (RULES.hp - p.hp) * 2;
    this.model.patches.forEach((m, i) => { m.visible = i < show; });
    root.visible = !(p.invulnT > 0 && Math.floor(rs.time * 12) % 2 === 0);

    if (p.speed > 0.5 && !p.down) {
      this.step += p.speed * dt;
      if (this.step > 0.6) {
        this.step = 0;
        this.foot *= -1;
        const a = Math.atan2(p.mvx, p.mvz);
        this.fx.footprint(p.x + Math.cos(a) * 0.16 * this.foot, p.z - Math.sin(a) * 0.16 * this.foot, a);
      }
    }
  }
}

// 한 판의 무대: 경기장, 캐릭터, 벽, 눈덩이, 효과, 이름표
export class Stage {
  constructor(renderer, { mode, roster, meId, hud, local = true, quiet = false }) {
    this.renderer = renderer;
    this.mode = mode;
    this.M = MODES[mode];
    this.meId = meId;
    this.hud = hud;
    this.quiet = quiet;
    this.roster = new Map(roster.map(r => [r.id, r]));
    const me = this.roster.get(meId);
    this.myTeam = me ? me.team : 0;
    this.flip = this.myTeam === 1 ? -1 : 1;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 220);
    setArena(this.M);
    this.world = createWorld(this.scene);
    this.fx = new Effects(this.scene, this.camera, new THREE.Vector3(0, this.M.cam.y, this.M.cam.z * this.flip), this.flip);
    this.fx.local = local;
    this.camera.position.copy(this.fx.base);
    this.camera.lookAt(this.fx.target);
    this.walls = new WallsView(this.scene, makeWalls(mode));
    this.balls = new BallsView(this.scene, this.fx);
    this.items = new ItemsView(this.scene);
    this.chars = new Map(roster.map(r => [r.id, new CharacterView(this.scene, r, r.id === meId, this.fx)]));

    // 조준 곡선 미리보기
    this.TN = 36;
    this.trajGeo = new THREE.BufferGeometry();
    this.trajGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.TN * 3), 3));
    const col = TEAM_COLORS[this.myTeam];
    this.traj = new THREE.Line(this.trajGeo, new THREE.LineDashedMaterial({ color: col, dashSize: 0.32, gapSize: 0.2 }));
    this.landRing = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.52, 32),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.landRing.rotation.x = -Math.PI / 2;
    this.traj.visible = this.landRing.visible = false;
    // 얼음돌을 들고 있을 때 보이는 직선 조준선
    this.lineGeo = new THREE.BufferGeometry();
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.stoneLine = new THREE.Line(this.lineGeo, new THREE.LineDashedMaterial({ color: '#3aa6e8', dashSize: 0.5, gapSize: 0.25 }));
    this.stoneLine.visible = false;
    // 내가 보고 있는 방향 표시 (방향키 조준할 때 특히 필요)
    this.aimMark = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 3),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    this.aimMark.visible = false;
    this.scene.add(this.traj, this.landRing, this.stoneLine, this.aimMark);

    // 이름표
    this.tagBox = document.getElementById('tags');
    this.tags = new Map();
    for (const r of roster) {
      const el = document.createElement('div');
      el.className = `tag t${r.team}${r.id === meId ? ' me' : ''}`;
      el.innerHTML = `<span class="nm"></span><span class="hp">${'<i></i>'.repeat(RULES.hp)}</span><span class="rs"></span>`;
      el.querySelector('.nm').textContent = r.id === meId ? '나' : r.name;
      this.tagBox.appendChild(el);
      this.tags.set(r.id, { el, dots: [...el.querySelectorAll('.hp i')], rs: el.querySelector('.rs'), prevHp: -1, prevRs: '' });
    }
    this.v = new THREE.Vector3();
    this.resize();
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  update(rs, dt, realDt) {
    for (const p of rs.players) {
      const p2 = p.id === this.meId && rs.me ? rs.me : p;
      this.chars.get(p.id)?.update(p2, dt, rs);
    }
    this.walls.sync(rs.walls);
    this.walls.update(dt);
    this.balls.set(rs.balls, dt);
    this.items.update(rs.items || [], rs.time);
    this.fx.update(dt, realDt);
    this.world.update(dt, rs.time);
    this.updatePreview(rs.me, rs.cfg);
    this.updateTags(rs);
  }

  updatePreview(me, cfg) {
    this.aimMark.visible = !!(me && !me.down);
    if (me && !me.down) {
      this.aimMark.position.set(me.x + me.dx * 1.15, 0.06, me.z + me.dz * 1.15);
      this.aimMark.rotation.set(-Math.PI / 2, 0, Math.atan2(-me.dz, me.dx));
    }
    const straight = !!(me && me.stones > 0 && !me.charging && !me.down);
    this.stoneLine.visible = straight;
    if (straight) {
      const a = this.lineGeo.attributes.position.array, y = RULES.stoneHeight;
      const sx = me.x + me.dx * SPAWN_OFFSET, sz = me.z + me.dz * SPAWN_OFFSET;
      a[0] = sx; a[1] = y; a[2] = sz;
      a[3] = sx + me.dx * RULES.stoneRange; a[4] = y; a[5] = sz + me.dz * RULES.stoneRange;
      this.lineGeo.attributes.position.needsUpdate = true;
      this.stoneLine.computeLineDistances();
    }
    const on = !!(me && me.charging);
    this.traj.visible = this.landRing.visible = on;
    if (!on) return;
    const c = chargeFrac(me, cfg), L = launch(cfg, c), a = this.trajGeo.attributes.position.array;
    const sx = me.x + me.dx * SPAWN_OFFSET, sz = me.z + me.dz * SPAWN_OFFSET;
    for (let i = 0; i < this.TN; i++) {
      const t = (L.t * i) / (this.TN - 1);
      a[i * 3] = sx + me.dx * L.vh * t;
      a[i * 3 + 1] = Math.max(0.05, RULES.throwHeight + L.vy * t - 0.5 * RULES.gravity * t * t);
      a[i * 3 + 2] = sz + me.dz * L.vh * t;
    }
    this.trajGeo.attributes.position.needsUpdate = true;
    this.traj.computeLineDistances();
    this.landRing.position.set(sx + me.dx * L.range, 0.06, sz + me.dz * L.range);
    this.hud?.setRange(L.range, c);
  }

  updateTags(rs) {
    const W = innerWidth, H = innerHeight;
    for (const p of rs.players) {
      const tg = this.tags.get(p.id);
      if (!tg) continue;
      const q = p.id === this.meId && rs.me ? rs.me : p;
      this.v.set(q.x, q.down ? 1.2 : 2.6, q.z).project(this.camera);
      tg.el.style.transform = `translate(${((this.v.x + 1) / 2) * W}px, ${((1 - this.v.y) / 2) * H}px) translate(-50%, -100%)`;
      if (tg.prevHp !== q.hp) {
        tg.prevHp = q.hp;
        tg.dots.forEach((d, i) => d.classList.toggle('off', i >= q.hp));
      }
      const txt = q.down && this.M.respawn && rs.state === 'play' ? `${Math.max(0, q.respawnT).toFixed(1)}초` : '';
      if (txt !== tg.prevRs) { tg.prevRs = txt; tg.rs.textContent = txt; tg.el.classList.toggle('down', !!q.down); }
    }
  }

  name(id) {
    if (id === this.meId) return '나';
    return this.roster.get(id)?.name ?? '?';
  }

  // sim 이벤트를 소리와 효과로 바꾼다
  present(ev) {
    const fx = this.fx, me = this.meId;
    const s = this.quiet ? null : sfx;
    switch (ev.type) {
      case 'ball': if (ev.kind === 'stone') s?.stone(); else s?.throw(ev.c); break;
      case 'ballEnd': {
        const p = new THREE.Vector3(ev.x, ev.y, ev.z);
        if (ev.kind === 'hit') {
          fx.burst(p, 26, 5, 1.2, new THREE.Vector3(ev.vx, 0, ev.vz));
          const ch = this.chars.get(ev.id);
          if (ch) ch.vs.flash = 0.18;
          fx.hitStop(0.07);
          fx.addShake(ev.id === me ? 0.6 : 0.3);
          s?.hit();
          if (ev.k === 'stone') s?.clink();
        } else if (ev.kind === 'shield') {
          fx.burst(p, 10, 3, 0.8);
          s?.wall();
        } else if (ev.kind === 'wall') {
          this.walls.hit(ev.wid, ev.hp, ev.vx, ev.vz);
          fx.burst(p, 12, 3);
          if (ev.hp <= 0) {
            const w = this.walls.walls[ev.wid];
            fx.burst(new THREE.Vector3(w.x, 0.5, w.z), 30, 4.5, 1.3);
            fx.addShake(0.2);
            s?.wallBreak();
          } else s?.wall();
        } else if (ev.kind === 'fizzle') {
          fx.burst(p, 8, 2, 0.7);
          fx.mark(ev.x, ev.z, 0.6);
        } else if (ev.kind === 'ground') {
          fx.burst(p.setY(0.15), 8, 2, 0.8);
          fx.mark(ev.x, ev.z);
          s?.ground();
        }
        break;
      }
      case 'dash': s?.dash(); fx.burst(new THREE.Vector3(ev.x, 0.2, ev.z), 8, 2, 0.8); break;
      case 'pack': s?.pack(ev.id === me ? 1 : 0.4); break;
      case 'cancel': if (ev.id === me) s?.cancel(); break;
      case 'ready': if (ev.id === me) s?.ready(); break;
      case 'empty': if (ev.id === me) { this.hud?.toast('눈이 없어요. Space를 꾹 눌러 뭉치세요'); s?.empty(); } break;
      case 'kill': this.hud?.feed(this.name(ev.by), this.roster.get(ev.by)?.team ?? 0, this.name(ev.id), this.roster.get(ev.id)?.team ?? 1); break;
      case 'itemDrop': s?.drop(); break;
      case 'itemLand': fx.burst(new THREE.Vector3(ev.x, 0.2, ev.z), 16, 3, 1); fx.mark(ev.x, ev.z, 1.4); s?.land(); break;
      case 'itemPick':
        fx.burst(new THREE.Vector3(ev.x, 0.6, ev.z), 14, 2.5, 0.8);
        if (ev.id === me) { s?.pickup(); this.hud?.toast(`얼음돌 ${RULES.stonesPerPick}발! 다음 던지기는 직선으로 바로 나가요`); }
        break;
      case 'itemGone': fx.burst(new THREE.Vector3(ev.x, 0.3, ev.z), 8, 1.5, 0.6); break;
      case 'respawn': fx.burst(new THREE.Vector3(ev.x, 0.4, ev.z), 18, 3, 1); break;
      case 'left': this.hud?.toast(`${ev.name} 님이 나가서 AI가 이어받아요`); break;
      case 'roundEnd': fx.slowMo(1.1, new THREE.Vector3(ev.x, ev.y, ev.z)); break;
      case 'go': this.hud?.banner('던져!', 'go', 700); s?.go(); break;
      default: break;
    }
  }

  render() { this.renderer.render(this.scene, this.camera); }

  dispose() {
    this.tagBox.innerHTML = '';
    this.scene.traverse(o => {
      o.geometry?.dispose?.();
      const m = o.material;
      if (Array.isArray(m)) m.forEach(x => x.dispose()); else m?.dispose?.();
    });
  }
}
