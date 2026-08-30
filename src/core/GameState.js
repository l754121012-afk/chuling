import { GAME_CONFIG } from '../config/game.js';
import { GHOST_CONFIG, stageForRage } from '../config/ghost.js';
import { ITEM_DEFS } from '../config/items.js';

export class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.phase = 'menu';
    this.rage = 0;
    this.ghostHp = GHOST_CONFIG.hpMax;
    this.stamina = GAME_CONFIG.staminaMax;
    this.battery = 100;
    this.clues = new Set();
    this.inventory = new Map();
    this.equipped = 'pen';
    this.hiding = false;
    this.damages = [];
    this.usedItems = [];
    this.escapeTimer = GAME_CONFIG.escapeTime;
    this.stickyUntil = 0;
    this.slowedUntil = 0;
    this.stunnedUntil = 0;
    this.notebookOpen = false;
    this.noiseTimer = 0;
    this.sealed = false;
    this.staplerBroken = false;
    this.lives = 3;
    this.invincibleUntil = 0;
    this.weakUntil = 0;
    this.ropeClimbing = false;
    this.ladderClimbing = false;
    this.lightsOutUntil = 0;
    this.hitstopUntil = 0;
    this.slowmoUntil = 0;
  }

  addItem(id, n = 1) {
    this.inventory.set(id, (this.inventory.get(id) || 0) + n);
  }

  consumeItem(id, n = 1) {
    const current = this.inventory.get(id) || 0;
    if (current < n) return false;
    const next = current - n;
    if (next <= 0) this.inventory.delete(id);
    else this.inventory.set(id, next);
    return true;
  }

  hasItem(id) {
    return (this.inventory.get(id) || 0) > 0;
  }

  equippedDef() {
    return ITEM_DEFS[this.equipped] || ITEM_DEFS.pen;
  }

  currentStage() {
    return stageForRage(this.rage);
  }

  hasClue(id) {
    return this.clues.has(id);
  }

  isPlaying() {
    return this.phase === 'investigate' || this.phase === 'escape';
  }
}
