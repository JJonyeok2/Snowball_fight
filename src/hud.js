import { RULES, MODES, TEAM_NAMES } from '../shared/rules.js';

const $ = id => document.getElementById(id);
const dots = (el, n) => { el.innerHTML = '<i></i>'.repeat(n); return [...el.children]; };

export class Hud {
  constructor() {
    this.slots = dots($('slots'), RULES.maxAmmo);
    this.myHp = dots($('myHp'), RULES.hp);
    this.prev = {};
  }

  // 판이 시작될 때 모드와 내 팀에 맞춰 점수판을 다시 짠다
  setup(mode, myTeam, roster, meId) {
    const M = MODES[mode];
    this.M = M;
    this.mode = mode;
    this.prev = {};
    this.hp = [0, 1].map(t => dots($(`hp${t}`), RULES.hp));
    this.rounds = [0, 1].map(t => dots($(`r${t}`), RULES.roundsToWin));
    for (const t of [0, 1]) {
      const one = M.teamSize === 1 ? roster.find(r => r.team === t) : null;
      $(`name${t}`).textContent = one ? (one.id === meId ? '나' : one.name) : TEAM_NAMES[t];
      $(`side${t}`).classList.toggle('mine', t === myTeam);
    }
    document.body.classList.toggle('duo', M.teamSize > 1);
    $('feed').innerHTML = '';
    $('hud').hidden = false;
  }

  hide() { $('hud').hidden = true; }

  set(key, val, fn) {
    if (this.prev[key] === val) return;
    this.prev[key] = val;
    fn(val);
  }

  update(rs, me, cfg) {
    if (!this.M) return;
    const M = this.M;
    if (M.teamSize === 1) {
      for (const t of [0, 1]) {
        const p = rs.players.find(x => x.team === t);
        const hp = p ? (p.id === me?.id ? me.hp : p.hp) : 0;
        this.set(`hp${t}`, hp, v => this.hp[t].forEach((d, i) => d.classList.toggle('off', i >= v)));
      }
    } else {
      for (const t of [0, 1]) this.set(`k${t}`, rs.kills[t], v => { $(`k${t}`).textContent = `${v} / ${M.killsToWin}`; });
    }
    for (const t of [0, 1]) this.set(`r${t}`, rs.score[t], v => this.rounds[t].forEach((d, i) => d.classList.toggle('on', i < v)));
    this.set('round', rs.round, v => { $('roundNo').textContent = `${v}라운드`; });
    if (!me) return;
    this.set('ammo', me.ammo, v => this.slots.forEach((s, i) => s.classList.toggle('on', i < v)));
    this.set('myHp', me.hp, v => this.myHp.forEach((s, i) => s.classList.toggle('off', i >= v)));
    $('packBar').style.width = `${me.pack * 100}%`;
    $('dashBar').style.width = `${(1 - me.dashCd / cfg.dashCooldown) * 100}%`;
    this.set('dashReady', me.dashCd <= 0, v => $('dashRow').classList.toggle('ready', v));
    this.set('charging', me.charging, v => $('chargeWrap').classList.toggle('show', v));
    const rsText = me.down && M.respawn && rs.state === 'play' ? `부활까지 ${Math.max(0, me.respawnT).toFixed(1)}초` : '';
    this.set('respawn', rsText, v => { $('respawn').textContent = v; $('respawn').classList.toggle('show', !!v); });
  }

  setRange(m, c) {
    $('rangeTxt').textContent = `${m.toFixed(1)}m`;
    $('chargeBar').style.width = `${c * 100}%`;
  }

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
    this.tt = setTimeout(() => t.classList.remove('show'), 1600);
  }

  feed(by, byTeam, victim, vTeam) {
    const row = document.createElement('div');
    row.className = 'kill';
    const a = document.createElement('b'); a.className = `t${byTeam}`; a.textContent = by;
    const b = document.createElement('b'); b.className = `t${vTeam}`; b.textContent = victim;
    row.append(a, ' 눈덩이 → ', b);
    $('feed').prepend(row);
    while ($('feed').children.length > 4) $('feed').lastChild.remove();
    setTimeout(() => row.remove(), 5000);
  }

  showResult(win, score, online) {
    $('resultTitle').textContent = win ? '승리!' : '아쉽게 졌어요';
    $('resultScore').textContent = `${score[0]} : ${score[1]}`;
    $('result').classList.toggle('win', win);
    $('resultBtns').hidden = online;
    $('resultWait').hidden = !online;
    $('result').hidden = false;
  }

  hideResult() { $('result').hidden = true; }
}
