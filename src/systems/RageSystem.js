import { GHOST_CONFIG, stageForRage } from '../config/ghost.js';
import { GAME_CONFIG } from '../config/game.js';
import { clamp, distance2D, nowSec } from '../core/Utils.js';

export class RageSystem {
  constructor(game, events, audio) {
    this.game = game;
    this.events = events;
    this.audio = audio;
    this._stage = game.currentStage();
  }

  add(amount, reason = '') {
    if (!this.game.isPlaying()) return;
    const prev = this._stage;
    this.game.rage = clamp(this.game.rage + amount, 0, 100);
    this._emitChange(prev, reason);
  }

  reduce(amount, reason = '') {
    this.add(-amount, reason);
  }

  addComposure(amount, reason = '') {
    if (!this.game.isPlaying()) return;
    this.game.composure = clamp(this.game.composure - amount, 0, GAME_CONFIG.composureMax);
    this.events.emit('composure.changed', {
      value: this.game.composure,
      reason
    });
    if (
      this.game.composure <= 0 &&
      !this.game.broken &&
      this.game.phase === 'investigate'
    ) {
      this._triggerBreak();
    }
  }

  addDrama(amount, reason = '') {
    if (!this.game.isPlaying()) return;
    const prev = this.game.drama;
    this.game.drama = clamp(this.game.drama + amount, 0, GAME_CONFIG.dramaMax);
    if (
      this.game.drama >= GAME_CONFIG.dramaMax &&
      prev < GAME_CONFIG.dramaMax &&
      !this.game.dramaFullNotified
    ) {
      this.game.dramaFullNotified = true;
      this.events.emit('toast', { text: '节目效果值满了！按 H 放社死大招！', ms: 2600 });
      this.audio?.play('win');
    }
    this.events.emit('drama.changed', {
      value: this.game.drama,
      reason
    });
  }

  update(dt, playerPos, ghostPos) {
    if (!this.game.isPlaying()) return;
    const prev = this._stage;
    if (this.game.broken && nowSec() >= this.game.brokenUntil) {
      this.game.broken = false;
      this.game.composure = GAME_CONFIG.composureBreakReset;
      this.add(14, 'breakEnd');
      this.events.emit('toast', { text: '它缓过来了，更生气了！！', ms: 2200 });
    }
    const dist = distance2D(playerPos.x, playerPos.z, ghostPos.x, ghostPos.z);
    if (this.game.hiding) {
      const hidePenalty = this.game.lockerHideCount >= 2 ? 0.5 : 1;
      this.game.rage = clamp(
        this.game.rage - GHOST_CONFIG.rage.hide * hidePenalty * dt,
        0,
        100
      );
    } else if (dist > 9 && !this.game.notebookOpen) {
      this.game.rage = clamp(this.game.rage - GHOST_CONFIG.rage.quiet * dt, 0, 100);
    }
    this._emitChange(prev);
  }

  _emitChange(prevStage, reason = '') {
    const stage = stageForRage(this.game.rage);
    this.events.emit('rage.changed', {
      rage: this.game.rage,
      stage,
      stageChanged: stage.id !== prevStage.id
    });
    if (stage.id !== prevStage.id) {
      this._stage = stage;
      this.events.emit('ghost.stage', { stage, reason });
      if (stage.id === 'furious' || stage.id === 'insane') {
        this.audio?.play('bleat');
      }
    }
  }

  get stage() {
    return stageForRage(this.game.rage);
  }

  _triggerBreak() {
    this.game.broken = true;
    this.game.brokenUntil = nowSec() + GAME_CONFIG.brokenWindow;
    this.addDrama(GAME_CONFIG.dramaBreak, 'break');
    this.events.emit('act.card', {
      title: '它破防了！！',
      line: '鬼跪在地上大哭，快按 E 处决！'
    });
    this.audio?.play('bleat');
  }
}
