import { CFG, RULES } from './config.js';

const $ = id => document.getElementById(id);
const dots = (el, n) => { el.innerHTML = '<i></i>'.repeat(n); return [...el.children]; };

export class Hud {
  constructor() {
    this.slots = dots($('slots'), RULES.maxAmmo);
    this.hpMe = dots($('hpMe'), RULES.hp);
    this.hpFoe = dots($('hpFoe'), RULES.hp);
    this.rMe = dots($('rMe'), RULES.roundsToWin);
    this.rFoe = dots($('rFoe'), RULES.roundsToWin);
    this.prev = {};
  }

  set(key, val, fn) {
    if (this.prev[key] === val) return;
    this.prev[key] = val;
    fn(val);
  }

  update(me, foe, G) {
    this.set('ammo', me.ammo, v => this.slots.forEach((s, i) => s.classList.toggle('on', i < v)));
    this.set('hpMe', me.hp, v => this.hpMe.forEach((s, i) => s.classList.toggle('off', i >= v)));
    this.set('hpFoe', foe.hp, v => this.hpFoe.forEach((s, i) => s.classList.toggle('off', i >= v)));
    this.set('rMe', G.score.me, v => this.rMe.forEach((s, i) => s.classList.toggle('on', i < v)));
    this.set('rFoe', G.score.foe, v => this.rFoe.forEach((s, i) => s.classList.toggle('on', i < v)));
    this.set('round', G.round, v => { $('roundNo').textContent = `${v}라운드`; });
    $('packBar').style.width = `${me.pack * 100}%`;
    const dash = 1 - me.dashCd / CFG.dashCooldown;
    $('dashBar').style.width = `${dash * 100}%`;
    this.set('dashReady', me.dashCd <= 0, v => $('dashRow').classList.toggle('ready', v));
    this.set('charging', me.charging, v => $('chargeWrap').classList.toggle('show', v));
    if (me.charging) $('chargeBar').style.width = `${me.chargeFrac * 100}%`;
  }

  setRange(m) { $('rangeTxt').textContent = `${m.toFixed(1)}m`; }

  banner(text, kind = '', hold = 900) {
    const b = $('banner');
    b.textContent = text;
    b.className = '';
    void b.offsetWidth;
    b.className = `show ${kind}`;
    clearTimeout(this.bt);
    this.bt = setTimeout(() => b.classList.remove('show'), hold);
  }

  toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.tt);
    this.tt = setTimeout(() => t.classList.remove('show'), 1300);
  }

  showResult(win, score) {
    $('resultTitle').textContent = win ? '승리!' : '아쉽게 졌어요';
    $('resultScore').textContent = `${score.me} : ${score.foe}`;
    $('result').classList.toggle('win', win);
    $('result').hidden = false;
  }

  hideResult() { $('result').hidden = true; }
}
