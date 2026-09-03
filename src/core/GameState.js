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
    this.composure = 100;
    this.drama = 0;
    this.ghostHp = GHOST_CONFIG.hpMax;
    this.stamina = GAME_CONFIG.staminaMax;
    this.staminaMax = GAME_CONFIG.staminaMax;
    this.staminaRegenBonus = 0;
    this.battery = 100;
    this.batteryMax = 100;
    this.clues = new Set();
    this.notebookEntries = [];
    this.inventory = new Map();
    this.equipped = 'pen';
    this.quickSlots = ['pen', 'glue', 'tape', 'stapler'];
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
    this.randomEvents = [];
    this.nextEventAt = 0;
    this.huntActive = false;
    this.huntUntil = 0;
    this.huntDone = false;
    this.ghostSpeedBoostUntil = 0;
    this.deskRampageUntil = 0;
    this.supplyDrop = null;
    this.bellPhaseActive = false;
    this.bellPhaseUntil = 0;
    this.bellCircle = null;
    this.bellCharge = 0;
    this.bellPhaseIndex = 0;
    this.artifactActive = false;
    this.artifactUntil = 0;
    this.artifactCircle = null;
    this.artifactDefendTime = 0;
    this.artifactDefendUntil = 0;
    this.artifactStage = 0;
    this.artifactStageUntil = 0;
    this.artifactGhostGrabAt = 0;
    this.artifactSecured = false;
    this.artifactPenalty = false;
    this.artifactGhostBoostUntil = 0;
    this.artifactPhaseIndex = 0;
    this.artifactLockoutZones = [];
    this.artifactClearance = [];
    this.lastPlayerAction = '';
    this.lastActionAt = 0;
    this.rebelItem = null;
    this.desperate = false;
    this.voteActive = false;
    this.voteOptions = [];
    this.comboWindowUntil = 0;
    this.speedBoostUntil = 0;
    this.comboSkillDone = false;
    this.hitstopUntil = 0;
    this.slowmoUntil = 0;
    this.firstScareDone = false;
    this.act3Started = false;
    this.runStart = 0;
    this.runTime = 0;
    this.lockerHideCount = 0;
    this.crateRouteComplete = false;
    this.chainActive = false;
    this.chainStep = 'idle';
    this.chainStuck = false;
    this.chainPinned = false;
    this.chainTutorialDone = false;
    this.pinnedUntil = 0;
    this.broken = false;
    this.brokenUntil = 0;
    this.playerStunUntil = 0;
    this.dodgingUntil = 0;
    this.thrownUntil = 0;
    this.thrownByGhost = false;
    this.charging = false;
    this.chargingUntil = 0;
    this.finisherDone = false;
    this.dramaFullNotified = false;
    this.freePass = 0;
    this.damageWaiver = false;
    this.doublePoints = false;
    this.resignUnlocked = false;
    this.parryCount = 0;
    this.dodgeCount = 0;
    this.kiteCount = 0;
    this.whipCooldownUntil = 0;
    this.whipMode = false;
    this.whipCombo = 0;
    this.maxWhipCombo = 0;
    this.whipHits = 0;
    this.whipMisses = 0;
    this.whipComboUntil = 0;
    this.ghostScore = 0;
    this.ghostWishKnocked = false;
    this.ghostWishHelped = false;
    this.detentionMode = false;
    this.runMode = false;
    this.runStage = 1;
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

  addNote(id, category, title, text) {
    if (this.notebookEntries.some(n => n.id === id)) return;
    this.notebookEntries.push({ id, category, title, text });
  }

  isPlaying() {
    return this.phase === 'investigate' || this.phase === 'escape';
  }
}
