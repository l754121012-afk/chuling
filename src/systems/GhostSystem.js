import * as CANNON from 'cannon-es';
import { GHOST_CONFIG, stageForRage } from '../config/ghost.js';
import { GAME_CONFIG } from '../config/game.js';
import { GROUPS, makeBody, syncMeshToBody, v3 } from '../core/Physics.js';
import { makeGhostMesh } from '../core/PlaceholderAssets.js';
import { choice, clamp, distance2D, nowSec, rand } from '../core/Utils.js';

const GHOST_VISUALS = {
  calm: {
    color: 0xf3efe7, emissive: 0x000000, intensity: 0,
    aura: 0x9fb8ad, auraOpacity: 0.08, flames: false, danger: 0
  },
  annoyed: {
    color: 0xf5e8c8, emissive: 0x4a3600, intensity: 0.08,
    aura: 0xd9a94e, auraOpacity: 0.18, flames: false, danger: 0.12
  },
  angry: {
    color: 0xf0c3a0, emissive: 0x7a2418, intensity: 0.18,
    aura: 0xe76f51, auraOpacity: 0.3, flames: false, danger: 0.3
  },
  furious: {
    color: 0xd99090, emissive: 0xa01225, intensity: 0.45,
    aura: 0xd7263d, auraOpacity: 0.45, flames: true, danger: 0.5
  },
  insane: {
    color: 0xb58fd6, emissive: 0x5d1fa8, intensity: 0.8,
    aura: 0x9b5de5, auraOpacity: 0.6, flames: true, danger: 0.72
  }
};

export class GhostSystem {
  constructor({ scene, physics, events, game, rage, audio }) {
    this.scene = scene;
    this.physics = physics;
    this.events = events;
    this.game = game;
    this.rage = rage;
    this.audio = audio;
    this.pawn = null;
    this.playerPos = () => ({ x: 0, y: 0, z: 0 });
    this.playerBody = null;
    this._waypoint = null;
    this._lastNoise = null;
    this._lastSeen = null;
    this._searchTimer = 0;
    this._slapCooldown = 0;
    this._footprintTimer = 0;
    this._speechTimer = 0;
    this._flash = 0;
    this._facing = 0;
    this._caught = false;
    this._visualStage = null;
    this._flameTime = 0;

    events.on('noise', payload => this._onNoise(payload));
  }

  createPawn(pos) {
    const mesh = makeGhostMesh();
    mesh.position.set(pos.x, 1.2, pos.z);
    this.scene.group.add(mesh);
    const body = makeBody({
      shape: new CANNON.Sphere(0.55),
      position: { x: pos.x, y: 1.2, z: pos.z },
      mass: 20,
      group: GROUPS.GHOST,
      mask: GROUPS.WORLD | GROUPS.PROP,
      fixedRotation: true,
      gravityScale: 0
    });
    body.linearDamping = 0.4;
    body.allowSleep = false;
    this.physics.add(body);
    this.pawn = { mesh, body };
    return this.pawn;
  }

  getPos() {
    const p = this.pawn.body.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  update(dt, playerPos) {
    if (!this.pawn) return;
    this._applyStageVisual(this.game.currentStage(), dt);
    if (!this.game.isPlaying()) return;
    const body = this.pawn.body;
    syncMeshToBody(this.pawn.mesh, body);
    this._slapCooldown = Math.max(0, this._slapCooldown - dt);
    this._speechTimer = Math.max(0, this._speechTimer - dt);
    this._flash = Math.max(0, this._flash - dt);
    this.pawn.mesh.scale.setScalar(this._flash > 0 ? 1.22 : 1);

    if (this.game.phase === 'escape') {
      this._chase(playerPos, GHOST_CONFIG.finalChaseSpeed, dt);
      this.game.escapeTimer -= dt;
      if (this.game.escapeTimer <= 0) this._catchPlayer();
    } else {
      this._investigateAI(dt, playerPos);
    }

    const speed = Math.hypot(body.velocity.x, body.velocity.z);
    this._footprintTimer -= dt;
    if (speed > 0.3 && this._footprintTimer <= 0) {
      this.scene.addFootprint(body.position.x, body.position.z);
      this._footprintTimer = this.game.phase === 'escape' ? 0.28 : 0.65;
    }

    this._catchOrSlap(playerPos);
  }

  _applyStageVisual(stage, dt) {
    const v = GHOST_VISUALS[stage.id] || GHOST_VISUALS.calm;
    if (this._visualStage !== stage.id) {
      this._visualStage = stage.id;
      this.events.emit('ghost.visual', {
        stage: stage.id,
        label: stage.label,
        danger: v.danger,
        flames: v.flames
      });
    }
    const parts = this.pawn.mesh.userData;
    if (parts.ghostMat) {
      parts.ghostMat.color.setHex(v.color);
      parts.ghostMat.emissive.setHex(v.emissive);
      parts.ghostMat.emissiveIntensity = v.intensity;
      parts.ghostMat.needsUpdate = true;
    }
    if (parts.aura) {
      parts.aura.material.color.setHex(v.aura);
      parts.aura.material.opacity = v.auraOpacity;
    }
    this._updateFlames(dt, v.flames);
  }

  _updateFlames(dt, active) {
    const flames = this.pawn.mesh.userData.flames;
    if (!flames) return;
    this._flameTime += dt;
    for (const flame of flames.children) {
      flame.visible = active;
      if (!active) continue;
      const o = flame.userData.offset;
      const t = this._flameTime * o.speed + o.angle;
      flame.position.set(
        Math.sin(t) * 0.65,
        1.0 + ((o.rise + this._flameTime * 0.8) % 1) * 0.55,
        Math.cos(t * 0.8) * 0.55
      );
      flame.rotation.z = Math.sin(t * 2) * 0.3;
      flame.scale.setScalar(0.8 + Math.sin(t * 3) * 0.3);
    }
  }

  _investigateAI(dt, playerPos) {
    const stage = this.game.currentStage();
    const cfg = GHOST_CONFIG.stages.find(s => s.id === stage.id) || GHOST_CONFIG.stages[0];
    let speed = cfg.speed;
    if (this.game.slowedUntil > nowSec()) speed *= 0.45;
    if (this.game.stunnedUntil > nowSec()) speed = 0;

    if (stage.id === 'furious' || stage.id === 'insane') {
      this._chase(playerPos, speed, dt);
      return;
    }

    const sees = this._canSee(playerPos, stage);
    if (sees && stage.id === 'angry') {
      this._lastSeen = { x: playerPos.x, z: playerPos.z };
      this._chase(playerPos, speed, dt);
      return;
    }
    if (sees && stage.id === 'annoyed') {
      this._lastNoise = { x: playerPos.x, z: playerPos.z };
    }

    if (this._lastSeen) {
      const arrived = this._goTo(this._lastSeen, speed, dt);
      if (arrived) {
        this._lastSeen = null;
        this._searchTimer = 2.2;
      }
      return;
    }
    if (this._lastNoise) {
      const arrived = this._goTo(this._lastNoise, speed, dt);
      if (arrived) this._lastNoise = null;
      return;
    }
    if (this._searchTimer > 0) {
      this._searchTimer -= dt;
      this._setVelocity(0, 0, 0);
      return;
    }

    this._patrol(dt, speed);
  }

  _patrol(dt, speed) {
    const b = this.pawn.body.position;
    if (!this._waypoint) {
      this._waypoint = this._randomClassroomPoint();
    }
    const dist = distance2D(b.x, b.z, this._waypoint.x, this._waypoint.z);
    if (dist < 0.7) {
      this._waypoint = this._randomClassroomPoint();
      return;
    }
    this._goTo(this._waypoint, speed, dt);
  }

  _randomClassroomPoint() {
    return {
      x: rand(-6, 6),
      z: rand(-4.4, 2.6)
    };
  }

  _goTo(target, speed, dt) {
    const b = this.pawn.body.position;
    const dx = target.x - b.x;
    const dz = target.z - b.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.45) {
      this._setVelocity(0, 0, 0);
      return true;
    }
    this._setVelocity((dx / dist) * speed, (dz / dist) * speed, dt);
    return false;
  }

  _chase(playerPos, speed, dt) {
    this._goTo(playerPos, speed, dt);
  }

  _setVelocity(vx, vz, dt) {
    this.pawn.body.velocity.set(vx, 0, vz);
    if (Math.hypot(vx, vz) > 0.1) {
      this._facing = Math.atan2(vx, vz);
      this.pawn.mesh.rotation.y = this._facing;
    }
  }

  _canSee(playerPos, stage) {
    if (this.game.hiding) return false;
    const b = this.pawn.body.position;
    const dist = distance2D(b.x, b.z, playerPos.x, playerPos.z);
    if (dist > stage.viewDist) return false;

    const dx = playerPos.x - b.x;
    const dz = playerPos.z - b.z;
    const facingX = Math.sin(this._facing);
    const facingZ = Math.cos(this._facing);
    const dot = (dx * facingX + dz * facingZ) / (Math.hypot(dx, dz) || 1);
    const angle = Math.acos(clamp(dot, -1, 1)) * (180 / Math.PI);
    if (stage.cone < 360 && angle > stage.cone / 2) return false;

    const from = v3(b.x, b.y + 0.8, b.z);
    const to = v3(playerPos.x, playerPos.y + 1.0, playerPos.z);
    const hit = this.physics.raycastClosest(from, to, GROUPS.WORLD | GROUPS.PROP);
    if (!hit) return true;
    const hp = hit.hitPointWorld;
    const hitDist = Math.hypot(hp.x - from.x, hp.y - from.y, hp.z - from.z);
    return hitDist >= dist * 0.9;
  }

  _onNoise({ pos, radius }) {
    if (!this.game.isPlaying() || this.game.phase !== 'investigate') return;
    const b = this.pawn.body.position;
    const dist = distance2D(b.x, b.z, pos.x, pos.z);
    if (dist > radius) return;
    const stage = this.game.currentStage();
    this.rage.add(GHOST_CONFIG.rage.noise, 'noise');
    if (stage.id !== 'calm') {
      this._lastNoise = { x: pos.x, z: pos.z };
      this._speak(choice(GHOST_CONFIG.speech.annoyed), 1800);
      this.audio?.play('ghost');
    }
  }

  _catchOrSlap(playerPos) {
    if (this._caught) return;
    const b = this.pawn.body.position;
    const dist = distance2D(b.x, b.z, playerPos.x, playerPos.z);
    if (dist > 1.15) return;
    const stage = this.game.currentStage();
    const shouldCatch = this.game.phase === 'escape' || stage.id === 'insane';
    if (shouldCatch) {
      this._catchPlayer();
      return;
    }
    if (this._slapCooldown > 0) return;
    this._slapCooldown = GAME_CONFIG.slapCooldown;
    this.rage.add(GHOST_CONFIG.rage.slap, 'slap');
    this.game.stamina = Math.max(0, this.game.stamina - 25);
    if (this.playerBody) {
      const dx = playerPos.x - b.x;
      const dz = playerPos.z - b.z;
      const len = Math.hypot(dx, dz) || 1;
      this.playerBody.velocity.set((dx / len) * 7, 4, (dz / len) * 7);
    }
    this.audio?.play('slap');
    this.events.emit('toast', { text: '它扇了你一巴掌！体力-25', ms: 1800 });
    this._speak('别在教室里乱跑！', 1800);
  }

  _catchPlayer() {
    if (this._caught) return;
    this._caught = true;
    this.game.phase = 'lost';
    this.audio?.play('lose');
    this.events.emit('toast', { text: '被鬼抓住了……', ms: 2400 });
    this.events.emit('game.lost');
  }

  sealAttempt() {
    if (this.game.phase !== 'investigate') return 'miss';
    const b = this.pawn.body.position;
    const p = this.playerPos();
    const dist = distance2D(b.x, b.z, p.x, p.z);
    if (dist > 2.4) return 'miss';

    const stage = this.game.currentStage();
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    const facingX = Math.sin(this._facing);
    const facingZ = Math.cos(this._facing);
    const dot = (dx * facingX + dz * facingZ) / (Math.hypot(dx, dz) || 1);
    const behind = dot < -0.25;
    const stealthy = (stage.id === 'calm' || stage.id === 'annoyed') && !this.game.hiding;

    if (this.game.hasClue('note') && stealthy && behind) {
      this._sealSuccess();
      return 'success';
    }

    this.game.consumeItem('stapler');
    this.game.usedItems.push('stapler');
    this.rage.add(GHOST_CONFIG.rage.wrongSeal, 'wrongSeal');
    this.audio?.play('stapler');
    this.events.emit('toast', { text: '封了个寂寞！订书机坏了！', ms: 2200 });
    this._speak('你在干嘛？！', 2000);
    return 'wrong';
  }

  _sealSuccess() {
    this.game.sealed = true;
    this.game.rage = 100;
    this.game.phase = 'escape';
    this.game.escapeTimer = GAME_CONFIG.escapeTime;
    this.scene.openExit();
    this.audio?.play('stapler');
    this.audio?.play('gate');
    this.events.emit('escape.start', { reason: 'sealed' });
    this.events.emit('toast', { text: '封印成功！但它暴走了！快跑！', ms: 2600 });
    this._speak('你居然……咩————！！', 2600);
  }

  damage(amount, def = null) {
    if (this.game.phase !== 'investigate') return false;
    this.game.ghostHp -= amount;
    this._flash = 0.14;
    this.audio?.play('hit');
    if (def?.rage) this.rage.add(def.rage, 'hit');
    if (this.game.ghostHp <= 0) {
      this.game.rage = 100;
      this.game.phase = 'escape';
      this.game.escapeTimer = GAME_CONFIG.escapeTime;
      this.scene.openExit();
      this.events.emit('escape.start', { reason: 'brute' });
      this.events.emit('toast', { text: '它被你砸跑了…也算成功吧？快跑！', ms: 2600 });
      this.audio?.play('bleat');
      return true;
    }
    return true;
  }

  _speak(text, ms) {
    if (this._speechTimer > 0) return;
    this._speechTimer = ms / 1000;
    this.events.emit('speech', { text, ms });
  }
}
