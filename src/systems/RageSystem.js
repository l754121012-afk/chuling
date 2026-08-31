import { GHOST_CONFIG, stageForRage } from '../config/ghost.js';
import { GAME_CONFIG } from '../config/game.js';
import { clamp, distance2D } from '../core/Utils.js';

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

  update(dt, playerPos, ghostPos) {
    if (!this.game.isPlaying()) return;
    const prev = this._stage;
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
}
