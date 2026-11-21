import { Game } from '../shared/sim.js';
import { Bot } from '../shared/ai.js';
import { MODES } from '../shared/rules.js';

const BOT_NAMES = ['눈사람', '고드름', '눈송이', '털장갑'];

// 연습 모드(와 메뉴 뒤 데모): 브라우저 안에서 sim과 AI를 직접 돌린다.
export class LocalSession {
  constructor({ mode, level = 'normal', cfg, demo = false }) {
    this.mode = mode;
    this.game = new Game(mode, cfg);
    this.meId = demo ? -1 : 0;
    this.roster = [];
    this.bots = new Map();
    let id = 0, n = 0;
    for (let team = 0; team < 2; team++) {
      for (let slot = 0; slot < MODES[mode].teamSize; slot++) {
        const isMe = id === this.meId;
        const name = isMe ? '나' : BOT_NAMES[n++ % BOT_NAMES.length];
        const p = this.game.addPlayer(id, team, slot, name, !isMe);
        if (!isMe) this.bots.set(id, new Bot(this.game, p, level));
        this.roster.push({ id, team, slot, name, bot: !isMe });
        id++;
      }
    }
    this.events = [];
    this.dt = 0;
    this.game.startMatch();
  }

  setLevel(level) { for (const b of this.bots.values()) b.level = level; }

  restart() {
    this.game.startMatch();
    for (const b of this.bots.values()) b.reset();
    this.events.push(...this.game.drain());
  }

  tick(realDt, input, fx) {
    const dt = fx ? fx.scale(realDt) : realDt;
    this.dt = dt;
    const I = input ? input.sample() : null;
    this.game.step(dt, p => (p.id === this.meId ? [I] : [this.bots.get(p.id).update(dt)]));
    this.events.push(...this.game.drain());
  }

  takeEvents() { const e = this.events; this.events = []; return e; }

  renderState() {
    const g = this.game;
    return {
      time: g.time, state: g.state, stateT: g.stateT, round: g.round, score: g.score, kills: g.kills,
      winner: g.winner, walls: g.walls.map(w => w.hp), players: g.players, balls: g.balls, cfg: g.cfg,
      me: g.get(this.meId) || null,
    };
  }
}
