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
      this.game.rage = clamp(this.game.rage - GHOST_CONFIG.rage.hide * dt, 0, 100);
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
        this.events.emit('toast', {
          text: stage.id === 'furious' ? '暴怒！环境开始异变了！' : '狂乱！它已经不讲道理了！',
          ms: 2200
        });
      } else {
        this.events.emit('toast', { text: `恶灵进入「${stage.label}」状态`, ms: 1600 });
      }
    }
  }

  get stage() {
    return stageForRage(this.game.rage);
  }
}
