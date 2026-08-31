import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GHOST_CONFIG, stageForRage } from '../config/ghost.js';
import { GAME_CONFIG } from '../config/game.js';
import { GROUPS, makeBody, syncMeshToBody, v3 } from '../core/Physics.js';
import { makeGhostMesh, makeWeakPointMarker, makePropMesh } from '../core/PlaceholderAssets.js';
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
    this.playerCrouching = null;
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
    this._hiddenTimer = 0;
    this._dashTimer = 0;
    this._dashCooldown = 0;
    this._dashDirX = 0;
    this._dashDirZ = 0;
    this._dashSpeed = 0;
    this._dashFlash = 0;
    this._spinTimer = 0;
    this._spinDir = 1;
    this._knockbackTimer = 0;
    this._knockbackVX = 0;
    this._knockbackVZ = 0;
    this._stuckTime = 0;
    this._lastStuckPos = { x: 0, z: 0 };
    this._skillCooldown = rand(8, 14);
    this._ambushUntil = 0;
    this._ambushActive = false;
    this._ambushSpeed = 0;
    this._disguiseActive = false;
    this._disguiseMesh = null;
    this._disguiseUntil = 0;
    this._disguiseCooldown = rand(20, 30);
    this._attackCooldown = rand(
      GAME_CONFIG.ghostAttackCooldownMin,
      GAME_CONFIG.ghostAttackCooldownMax
    );
    this._telegraphActive = false;
    this._telegraphUntil = 0;
    this._attackUntil = 0;
    this._attackFired = false;
    this._kiteCooldown = 0;
    this._attackAnimTimer = 0;
    this._telegraphRing = null;
    this._telegraphRingMat = null;
    this._parryRangeRing = null;
    this._parryRangeMat = null;
    this._weakPoint = null;
    this._rangeRing = null;
    this._rangeRingMat = null;

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
      mask: GROUPS.WORLD,
      fixedRotation: true,
      gravityScale: 0
    });
    body.linearDamping = 0.4;
    body.allowSleep = false;
    this.physics.add(body);
    this.pawn = { mesh, body };
    this._lastStuckPos = { x: pos.x, z: pos.z };

    const weak = makeWeakPointMarker();
    weak.position.set(0, 1.4, -0.52);
    weak.visible = false;
    mesh.add(weak);
    this._weakPoint = weak;

    const rangeMat = new THREE.MeshBasicMaterial({
      color: 0xe63946,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const range = new THREE.Mesh(new THREE.RingGeometry(2.25, 2.4, 40), rangeMat);
    range.rotation.x = -Math.PI / 2;
    range.position.y = -1.2;
    range.visible = false;
    mesh.add(range);
    this._rangeRing = range;
    this._rangeRingMat = rangeMat;

    const attackRing = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 2.6, 32),
      new THREE.MeshBasicMaterial({
        color: 0xff6b6b,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    attackRing.rotation.x = -Math.PI / 2;
    attackRing.visible = false;
    this.scene.group.add(attackRing);
    this._telegraphRing = attackRing;
    this._telegraphRingMat = attackRing.material;

    const parryRing = new THREE.Mesh(
      new THREE.RingGeometry(4.0, 4.2, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    parryRing.rotation.x = -Math.PI / 2;
    parryRing.visible = false;
    this.scene.group.add(parryRing);
    this._parryRangeRing = parryRing;
    this._parryRangeMat = parryRing.material;

    return this.pawn;
  }

  getPos() {
    const p = this.pawn.body.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  _isPinned() {
    return this.game.chainPinned || this.game.pinnedUntil > nowSec();
  }

  update(dt, playerPos) {
    if (!this.pawn) return;
    this._applyStageVisual(this.game.currentStage(), dt);
    this._updateTargetingUI(playerPos);
    if (!this.game.isPlaying()) return;
    const body = this.pawn.body;
    syncMeshToBody(this.pawn.mesh, body);
    this._slapCooldown = Math.max(0, this._slapCooldown - dt);
    this._speechTimer = Math.max(0, this._speechTimer - dt);
    this._flash = Math.max(0, this._flash - dt);
    const weakNow = this.game.weakUntil > nowSec();
    const baseScale = this._flash > 0 ? 1.22 : this._dashFlash > 0 ? 1.28 : 1;
    const squashed = this._isPinned();
    this.pawn.mesh.scale.set(
      squashed ? baseScale * 1.18 : baseScale,
      squashed ? baseScale * 0.5 : weakNow ? baseScale * 0.72 : baseScale,
      squashed ? baseScale * 1.18 : baseScale
    );
    this._dashFlash = Math.max(0, this._dashFlash - dt);

    if (this._isPinned()) {
      this.pawn.body.velocity.set(0, 0, 0);
    } else if (this.game.chainStuck) {
      this.pawn.body.velocity.set(0, 0, 0);
    } else if (this.game.broken) {
      this.pawn.body.velocity.set(0, 0, 0);
    } else if (weakNow) {
      this.pawn.body.velocity.set(0, 0, 0);
      if (this.game.phase === 'escape') {
        this.game.escapeTimer -= dt;
        if (this.game.escapeTimer <= 0) this._catchPlayer();
      }
    } else if (this._knockbackTimer > 0) {
      this._knockbackTimer -= dt;
      this.pawn.body.velocity.set(this._knockbackVX, 2, this._knockbackVZ);
    } else if (this._dashTimer > 0) {
      this._dashTimer -= dt;
      this._setVelocity(this._dashDirX * this._dashSpeed, this._dashDirZ * this._dashSpeed, dt);
    } else {
      this._tryDash(dt, playerPos);
      if (this.game.phase === 'escape') {
        this._chase(playerPos, GHOST_CONFIG.finalChaseSpeed, dt);
        this.game.escapeTimer -= dt;
        if (this.game.escapeTimer <= 0) this._catchPlayer();
      } else {
        this._investigateAI(dt, playerPos);
      }
    }

    if (this._spinTimer > 0) {
      this._spinTimer -= dt;
      this.pawn.mesh.rotation.y += dt * 14 * this._spinDir;
    }
    this._updateAttack(dt, playerPos);
    this._kiteCooldown = Math.max(0, this._kiteCooldown - dt);
    const armR = this.pawn.mesh.userData?.armR;
    const handR = this.pawn.mesh.userData?.handR;
    if (this._attackAnimTimer > 0) {
      this._attackAnimTimer -= dt;
      if (armR) {
        const t = 1 - Math.max(0, this._attackAnimTimer) / 0.45;
        armR.rotation.x = Math.sin(t * Math.PI) * 1.5;
        armR.rotation.z = -0.2;
      }
      if (handR) handR.position.set(0, -0.5, 0.7);
    } else if (armR && !this._telegraphActive && Math.abs(armR.rotation.x) > 0.01) {
      armR.rotation.x = 0;
      armR.rotation.z = -0.5;
      if (handR) handR.position.set(0, -0.66, 0);
    }

    const speed = Math.hypot(body.velocity.x, body.velocity.z);
    this._footprintTimer -= dt;
    if (speed > 0.3 && this._footprintTimer <= 0) {
      this.scene.addFootprint(body.position.x, body.position.z);
      this._footprintTimer = this.game.phase === 'escape' ? 0.28 : 0.65;
    }

    this._catchOrSlap(playerPos);

    if (this.game.hiding) {
      this._hiddenTimer += dt;
      const hideThreshold = this.game.lockerHideCount >= 2 ? 6 : 2.5;
      if (this._hiddenTimer > hideThreshold) {
        this._lastSeen = null;
        this._lastNoise = null;
        this._searchTimer = 0;
        this._waypoint = this._pointAwayFromLocker();
      }
    } else {
      this._hiddenTimer = 0;
    }

    const py = playerPos.y;
    const gy = body.position.y;
    const heightDiff = py - gy;
    if (heightDiff > 0.25 && heightDiff < 0.8) {
      body.position.y += heightDiff * Math.min(1, dt * 2.5);
    } else if (heightDiff < -0.2) {
      body.position.y += heightDiff * Math.min(1, dt * 1.2);
    }

    const stage = this.game.currentStage();
    this._skillCooldown -= dt;
    if (this._ambushActive) {
      if (nowSec() < this._ambushUntil) {
      const p = playerPos;
      const b = this.pawn.body.position;
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      const len = Math.hypot(dx, dz) || 1;
      this.pawn.body.velocity.set(
        (dx / len) * this._ambushSpeed,
        0,
        (dz / len) * this._ambushSpeed
      );
      } else {
        this._ambushActive = false;
        const p = playerPos;
        const b = this.pawn.body.position;
        const dx = p.x - b.x;
        const dz = p.z - b.z;
        b.x = p.x + dx * 0.1;
        b.z = p.z + dz * 0.1;
        this.audio?.play('ghost');
        this.events.emit('toast', { text: '鬼影突袭！', ms: 1500 });
        this.events.emit('camera.shake', { amount: 0.35 });
      }
    } else if (
      this._skillCooldown <= 0 &&
      (stage.id === 'angry' || stage.id === 'furious' || stage.id === 'insane') &&
      this.game.phase === 'investigate' &&
      !this.game.hiding &&
      !this.game.chainActive &&
      !this.game.ropeClimbing &&
      !this._disguiseActive
    ) {
      this._skillCooldown = rand(12, 18);
      this._ambushActive = true;
      this._ambushUntil = nowSec() + 0.8;
      const cfg = GHOST_CONFIG.stages.find(s => s.id === stage.id) || GHOST_CONFIG.stages[3];
      this._ambushSpeed = cfg.speed * 2.2;
      this.audio?.play('whoosh');
      this.events.emit('toast', { text: '它消失了……', ms: 1200 });
    }

    this._disguiseCooldown -= dt;
    if (this._disguiseActive) {
      if (this._disguiseMesh) this._disguiseMesh.rotation.y += dt * 1.5;
      const distToPlayer = distance2D(body.position.x, body.position.z, playerPos.x, playerPos.z);
      if (nowSec() >= this._disguiseUntil || distToPlayer < 2.6) {
        this._revealDisguise(playerPos);
      } else {
        body.velocity.set(0, 0, 0);
      }
    } else if (
      this._disguiseCooldown <= 0 &&
      (stage.id === 'angry' || stage.id === 'furious' || stage.id === 'insane') &&
      this.game.phase === 'investigate' &&
      !this.game.hiding &&
      !this.game.chainActive &&
      !this.game.ropeClimbing &&
      !this._ambushActive
    ) {
      const distToPlayer = distance2D(body.position.x, body.position.z, playerPos.x, playerPos.z);
      if (distToPlayer > 6) this._startDisguise(playerPos);
    }

    const trying = Math.hypot(body.velocity.x, body.velocity.z) > 0.3;
    const moved = Math.hypot(
      body.position.x - this._lastStuckPos.x,
      body.position.z - this._lastStuckPos.z
    );
    if (trying && moved < 0.02) {
      this._stuckTime += dt;
    } else {
      this._stuckTime = 0;
    }
    this._lastStuckPos = { x: body.position.x, z: body.position.z };
    if (this._stuckTime > 0.6) {
      this._stuckTime = 0;
      this._waypoint = this._randomClassroomPoint();
      this._lastSeen = null;
      this._lastNoise = null;
      this._searchTimer = 0;
    }
  }

  _tryDash(dt, playerPos) {
    if (this.game.hiding) return;
    if (this._isPinned()) return;
    if (this.game.chainStuck) return;
    if (this.game.broken) return;
    if (this.game.chainActive) return;
    if (this.game.weakUntil > nowSec()) return;
    this._dashCooldown -= dt;
    if (this._dashCooldown > 0) return;
    const stage = this.game.currentStage();
    const idx = GHOST_CONFIG.stages.findIndex(s => s.id === stage.id);
    if (idx < 2) return;
    const b = this.pawn.body.position;
    const dist = distance2D(b.x, b.z, playerPos.x, playerPos.z);
    if (dist < 2.5 || dist > 14) return;
    if (Math.random() > dt * 0.55) return;
    const speed = (GHOST_CONFIG.stages[idx].speed || 2.6) * 1.8;
    const dx = playerPos.x - b.x;
    const dz = playerPos.z - b.z;
    const len = Math.hypot(dx, dz) || 1;
    this._dashDirX = dx / len;
    this._dashDirZ = dz / len;
    this._dashSpeed = speed;
    this._dashTimer = 0.38;
    this._dashCooldown = rand(2.8, 5.5);
    this._dashFlash = 0.3;
    this.audio?.play('whoosh');
    this.events.emit('toast', { text: '鬼突然加速了！', ms: 1100 });
  }

  knockback(vx, vz, duration = 0.45) {
    this._knockbackVX = vx;
    this._knockbackVZ = vz;
    this._knockbackTimer = duration;
  }

  _updateAttack(dt, playerPos) {
    if (this.game.phase !== 'investigate') return;
    if (
      this.game.hiding ||
      this.game.broken ||
      this.game.chainActive ||
      this.game.chainStuck ||
      this._isPinned()
    ) return;
    const b = this.pawn.body.position;
    const dist = distance2D(b.x, b.z, playerPos.x, playerPos.z);

    if (this._telegraphActive) {
      const remaining = Math.max(0, this._telegraphUntil - nowSec()) / GAME_CONFIG.attackTelegraph;
      if (this._telegraphRing) {
        this._telegraphRing.position.set(b.x, 0.06, b.z);
        this._telegraphRing.visible = true;
        this._telegraphRing.scale.setScalar(0.85 + remaining * 0.3);
        this._telegraphRingMat.opacity = 0.3 + (1 - remaining) * 0.45;
      }
      if (this._parryRangeRing) {
        this._parryRangeRing.position.set(playerPos.x, 0.05, playerPos.z);
        this._parryRangeRing.visible = true;
        this._parryRangeMat.opacity = 0.18 + (1 - remaining) * 0.35;
      }
      const armR = this.pawn.mesh.userData?.armR;
      const armL = this.pawn.mesh.userData?.armL;
      const hand = this.pawn.mesh.userData?.handR;
      const t = 1 - remaining;
      if (armL) armL.rotation.x = -0.8;
      if (armR) {
        armR.rotation.x = -1.5 + t * 2.7;
        armR.rotation.z = -0.9 + t * 0.7;
      }
      if (hand) hand.position.set(0, -0.5, -0.35 + t * 1.05);
      if (nowSec() < this._telegraphUntil) return;
      if (!this._attackFired) {
        this._attackFired = true;
        this.audio?.play('whoosh');
        this.events.emit('camera.shake', { amount: 0.18 });
        this._hideAttackRings();
        this.scene.spawnSlashTrail(
          { x: b.x, y: 0, z: b.z },
          { x: playerPos.x, y: 0, z: playerPos.z },
          '#ff6b6b',
          0.45
        );
        this.scene.spawnAirSlash(
          {
            x: b.x + Math.sin(this._facing) * 0.8,
            y: 1.3,
            z: b.z + Math.cos(this._facing) * 0.8
          },
          { x: playerPos.x, y: 1.25, z: playerPos.z },
          '#ff6b6b',
          0.4
        );
        this.scene.spawnClawSwipe(
          {
            x: b.x + Math.sin(this._facing) * 0.9,
            y: 1.15,
            z: b.z + Math.cos(this._facing) * 0.9
          },
          this._facing,
          '#9fc0a8',
          0.45
        );
        this._attackAnimTimer = 0.45;
        const arm = this.pawn.mesh.userData?.armR;
        const hand = this.pawn.mesh.userData?.handR;
        if (arm) {
          arm.rotation.x = 1.5;
          arm.rotation.z = -0.2;
        }
        if (hand) hand.position.set(0, -0.5, 0.7);
        if (
          dist < 2.6 &&
          playerPos.y - b.y < 0.8 &&
          nowSec() >= this.game.dodgingUntil
        ) {
          this._doGhostSwipe(playerPos);
        } else {
          this.rage.addDrama(GAME_CONFIG.dramaPerfectDodge, 'dodgeAttack');
          this.events.emit('toast', { text: '鬼扑空了！！', ms: 1200 });
          this._speak('人呢？！', 1400);
        }
      }
      if (nowSec() >= this._attackUntil) {
        this._telegraphActive = false;
        this._attackFired = false;
        this._hideAttackRings();
        this._attackCooldown = rand(
          GAME_CONFIG.ghostAttackCooldownMin,
          GAME_CONFIG.ghostAttackCooldownMax
        );
      }
      return;
    }

    const stage = this.game.currentStage();
    const attackRange = stage.id === 'insane' ? 8 : 5;
    if (this._attackCooldown > 0) {
      this._attackCooldown -= dt * (stage.id === 'insane' ? 3 : 1);
    }
    if (this._attackCooldown > 0) return;
    if (dist < 0.8 || dist > attackRange) return;
    this._telegraphActive = true;
    this._attackFired = false;
    this._telegraphUntil = nowSec() + GAME_CONFIG.attackTelegraph;
    this._attackUntil = nowSec() + GAME_CONFIG.attackTelegraph + GAME_CONFIG.attackWindup;
    this._dashFlash = 0.3;
    this.audio?.play('ghost');
    this.events.emit('ghost.telegraph', { until: this._telegraphUntil });
    if (this._telegraphRing) this._telegraphRing.visible = true;
    if (this._parryRangeRing) this._parryRangeRing.visible = true;
    this.events.emit('toast', {
      text: this.game.whipMode
        ? '鬼要出招了！左键拼文具，或按 R 闪开！'
        : '鬼要出招了！按 G 切鞭子拼文具，或按 R 闪开！',
      ms: 1400
    });
  }

  _hideAttackRings() {
    if (this._telegraphRing) this._telegraphRing.visible = false;
    if (this._parryRangeRing) this._parryRangeRing.visible = false;
  }

  _doGhostSwipe(playerPos) {
    if (this._slapCooldown > 0) return;
    this._slapCooldown = GAME_CONFIG.slapCooldown;
    this.game.invincibleUntil = nowSec() + 1.0;
    this.rage.add(GHOST_CONFIG.rage.slap, 'slap');
    this.game.stamina = Math.max(0, this.game.stamina - 25);
    if (this.playerBody) {
      const b = this.pawn.body.position;
      const dx = playerPos.x - b.x;
      const dz = playerPos.z - b.z;
      const len = Math.hypot(dx, dz) || 1;
      this.playerBody.velocity.set((dx / len) * 7, 4, (dz / len) * 7);
    }
    this.audio?.play('slap');
    this.events.emit('toast', { text: '鬼一巴掌呼过来！体力-25', ms: 1800 });
    this.events.emit('player.hurt');
    this.events.emit('camera.shake', { amount: 0.32 });
    this.rage.addDrama(GAME_CONFIG.dramaHurt, 'hurt');
    this._speak('别在教室里乱跑！', 1800);
  }

  parrySucceeded() {
    if (!this._telegraphActive || nowSec() >= this._telegraphUntil) return false;
    this._telegraphActive = false;
    this._attackFired = false;
    this._hideAttackRings();
    this._attackCooldown = rand(
      GAME_CONFIG.ghostAttackCooldownMin,
      GAME_CONFIG.ghostAttackCooldownMax
    );
    this.game.parryCount += 1;
    this.rage.addComposure(GAME_CONFIG.composureParry, 'parry');
    this.rage.addDrama(GAME_CONFIG.dramaParry, 'parry');
    const stage = this.game.currentStage();
    const rageCut = stage.id === 'insane' ? 15 : 8;
    this.rage.reduce(rageCut, 'parry');
    if (stage.id === 'insane') {
      this.events.emit('toast', {
        text: '满怒也能拼！它被你打回暴怒了！',
        ms: 2200
      });
    } else {
      this.events.emit('toast', {
        text: `拼刀成功！怒气 -${rageCut}`,
        ms: 1400
      });
    }
    const p = this.playerPos();
    const b = this.pawn.body.position;
    const dx = b.x - p.x;
    const dz = b.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    this.scene.spawnSlashTrail(
      { x: p.x, y: 0, z: p.z },
      { x: b.x, y: 0, z: b.z },
      '#ffffff',
      0.5
    );
    this.scene.spawnAirSlash(
      { x: p.x, y: 1.25, z: p.z },
      { x: b.x, y: 1.25, z: b.z },
      '#ffffff',
      0.5
    );
    this.scene.spawnHitRing(
      { x: (p.x + b.x) / 2, y: 1, z: (p.z + b.z) / 2 },
      '#ffffff'
    );
    this._attackAnimTimer = 0.3;
    const arm = this.pawn.mesh.userData?.armR;
    const hand = this.pawn.mesh.userData?.handR;
    if (arm) {
      arm.rotation.x = 1.2;
      arm.rotation.z = -0.2;
    }
    if (hand) hand.position.set(0, -0.5, 0.7);
    this.knockback((dx / len) * 9, (dz / len) * 9, 0.5);
    this._spinTimer = 0.8;
    this.game.stunnedUntil = nowSec() + 1.2;
    this.events.emit('hitstop', { ms: 110 });
    this.events.emit('slowmo', { ms: 280 });
    this.events.emit('camera.shake', { amount: 0.4 });
    this.events.emit('act.card', { title: '拼文具成功！！', line: '它的攻击被你弹开了！' });
    this.audio?.play('whip');
    this._speak('疼疼疼！！', 1600);
    return true;
  }

  registerKnockdown() {
    if (this.game.broken || !this.game.isPlaying()) return;
    this.rage.addComposure(GAME_CONFIG.composureKnockdown, 'knockdown');
    this.rage.addDrama(GAME_CONFIG.dramaKnockdown, 'knockdown');
  }

  _registerKite() {
    if (this._kiteCooldown > 0 || !this.game.isPlaying()) return;
    this._kiteCooldown = 8;
    this.game.kiteCount += 1;
    this.rage.addComposure(GAME_CONFIG.composureKite, 'kite');
    this.rage.addDrama(GAME_CONFIG.dramaKite, 'kite');
    this.events.emit('toast', { text: '你把它溜傻了！心态大幅下降', ms: 1800 });
    this._speak('人呢？？人呢！！', 1600);
  }

  performFinisher() {
    if (this.game.phase !== 'investigate') return;
    if (!this.game.broken && !this.game.chainPinned) return;
    this.game.broken = false;
    this.game.finisherDone = true;
    this.rage.addDrama(GAME_CONFIG.dramaFinisher, 'finisher');
    this.events.emit('hitstop', { ms: 130 });
    this.events.emit('slowmo', { ms: 500 });
    this.events.emit('act.card', {
      title: '喜剧处决！！',
      line: choice(['钉进成绩单！', '塞进垃圾桶！！', '拖去擦黑板！！！'])
    });
    this.audio?.play('win');
    this._sealSuccess('finisher');
  }

  _startDisguise(playerPos) {
    const p = playerPos;
    const ang = Math.random() * Math.PI * 2;
    const d = rand(4, 7);
    const x = clamp(
      p.x + Math.cos(ang) * d,
      this.scene.L.classroom.minX + 1,
      this.scene.L.classroom.maxX - 1
    );
    const z = clamp(
      p.z + Math.sin(ang) * d,
      this.scene.L.classroom.minZ + 1,
      this.scene.L.classroom.maxZ - 1
    );
    this.pawn.body.position.set(x, 1.2, z);
    this.pawn.body.velocity.set(0, 0, 0);
    this.pawn.mesh.visible = false;
    this._disguiseMesh = makePropMesh('trashCan');
    this._disguiseMesh.position.set(x, 0, z);
    this.scene.group.add(this._disguiseMesh);
    this._disguiseActive = true;
    this._disguiseUntil = nowSec() + 10;
    this._disguiseCooldown = rand(14, 22);
    this.audio?.play('ghost');
    this.events.emit('toast', { text: '它消失了……教室里多了一个垃圾桶？', ms: 2000 });
  }

  _revealDisguise(playerPos) {
    if (this._disguiseMesh) {
      this.scene.group.remove(this._disguiseMesh);
      this._disguiseMesh = null;
    }
    this.pawn.mesh.visible = true;
    this._disguiseActive = false;
    const b = this.pawn.body.position;
    b.x = playerPos.x;
    b.z = playerPos.z;
    this.audio?.play('ghost');
    this.events.emit('camera.shake', { amount: 0.4 });
    this.events.emit('hitstop', { ms: 80 });
    this.events.emit('toast', { text: '那个垃圾桶是鬼！！', ms: 1800 });
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
    if (this.game.weakUntil > nowSec()) {
      parts.ghostMat.color.setHex(0xa9c6dc);
      parts.ghostMat.emissive.setHex(0x1d4e89);
      parts.ghostMat.emissiveIntensity = 0.35;
      if (parts.aura) {
        parts.aura.material.color.setHex(0x6fa8dc);
        parts.aura.material.opacity = 0.2;
      }
    }
    if (this._ambushActive) {
      parts.ghostMat.transparent = true;
      parts.ghostMat.opacity = 0.25;
    } else {
      parts.ghostMat.transparent = false;
      parts.ghostMat.opacity = 1;
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
    if (this.game.weakUntil > nowSec()) speed = 0;
    if (this.game.slowedUntil > nowSec()) speed *= 0.45;
    if (this.game.stunnedUntil > nowSec()) speed = 0;
    if (this._isPinned()) speed = 0;
    if (this.game.chainStuck) speed = 0;
    if (this.game.broken) {
      this._setVelocity(0, 0, 0);
      return;
    }

    if (this.game.chainActive && this.game.chainStep === 'lure') {
      const target = this._lastNoise;
      if (target) this._goTo(target, speed, dt);
      return;
    }

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
    if (sees && (stage.id === 'annoyed' || stage.id === 'calm')) {
      this._lastNoise = { x: playerPos.x, z: playerPos.z };
    }

    if (this._lastSeen) {
      const arrived = this._goTo(this._lastSeen, speed, dt);
      if (arrived) {
        this._lastSeen = null;
        this._searchTimer = 2.2;
        const b = this.pawn.body.position;
        const d = distance2D(playerPos.x, playerPos.z, b.x, b.z);
        if (d > 5) this._registerKite();
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

  _pointAwayFromLocker() {
    const locker = this.scene.refs?.locker;
    for (let i = 0; i < 8; i++) {
      const p = this._randomClassroomPoint();
      if (!locker || distance2D(p.x, p.z, locker.pos.x, locker.pos.z) > 3) return p;
    }
    return this._randomClassroomPoint();
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
    if (playerPos.y - b.y > 0.8) return false;
    const dist = distance2D(b.x, b.z, playerPos.x, playerPos.z);
    if (dist > stage.viewDist) return false;
    if (this.playerCrouching?.() && dist > 1.8) return false;

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

  _onNoise({ pos, radius, rage }) {
    if (!this.game.isPlaying() || this.game.phase !== 'investigate') return;
    if (this.game.hiding) return;
    const b = this.pawn.body.position;
    const dist = distance2D(b.x, b.z, pos.x, pos.z);
    if (dist > radius) return;
    const stage = this.game.currentStage();
    if (rage) this.rage.add(rage, 'noise');
    if (!this.game.hiding) this._lastNoise = { x: pos.x, z: pos.z };
    if (stage.id !== 'calm') {
      this._speak(choice(GHOST_CONFIG.speech.annoyed), 1800);
      this.audio?.play('ghost');
    }
  }

  _catchOrSlap(playerPos) {
    if (this._caught) return;
    if (this._telegraphActive) return;
    if (this.game.hiding) return;
    if (this.game.chainStuck) return;
    if (this.game.broken) return;
    if (this._isPinned()) return;
    if (this.game.ropeClimbing) return;
    if (this.game.ladderClimbing) return;
    if (nowSec() < this.game.dodgingUntil) return;
    if (nowSec() < this.game.weakUntil) return;
    if (nowSec() < this.game.invincibleUntil) return;
    const b = this.pawn.body.position;
    if (playerPos.y - b.y > 0.8) return;
    const dist = distance2D(b.x, b.z, playerPos.x, playerPos.z);
    if (dist > 1.15) return;
    const stage = this.game.currentStage();
    if (
      this.game.phase === 'investigate' &&
      stage.id === 'insane' &&
      !this._telegraphActive &&
      dist <= 5
    ) {
      this._attackCooldown = 0;
      this._updateAttack(0, playerPos);
      return;
    }
    const shouldCatch = this.game.phase === 'escape';
    if (shouldCatch) {
      if (this.game.lives > 0) {
        this.game.lives -= 1;
        this.game.invincibleUntil = nowSec() + 2.2;
        if (this.playerBody) {
          const dx = playerPos.x - b.x;
          const dz = playerPos.z - b.z;
          const len = Math.hypot(dx, dz) || 1;
          this.playerBody.velocity.set((dx / len) * 9, 4, (dz / len) * 9);
        }
        this._lastSeen = null;
        this._lastNoise = null;
        this._searchTimer = 0;
        this._waypoint = this._pointAwayFromLocker();
        this.audio?.play('slap');
        this.events.emit('player.hurt');
        this.events.emit('camera.shake', { amount: 0.45 });
        this.events.emit('hitstop', { ms: 90 });
        this.rage.addDrama(GAME_CONFIG.dramaHurt, 'caught');
        if (this.game.lives <= 0) {
          this._catchPlayer();
          return;
        }
        this.events.emit('toast', { text: `它把你举起来闻了闻！还剩 ${this.game.lives} 次机会`, ms: 2200 });
        this._speak('你跑不掉的……咦，你好臭。', 1800);
        return;
      }
      this._catchPlayer();
      return;
    }
    if (stage.id === 'calm' || stage.id === 'annoyed') return;
    if (
      !this._telegraphActive &&
      dist <= 1.6 &&
      (stage.id === 'insane' || this._attackCooldown <= 1.5)
    ) {
      this._attackCooldown = 0;
      this._updateAttack(0, playerPos);
      return;
    }
    if (this._slapCooldown > 0) return;
    this._slapCooldown = GAME_CONFIG.slapCooldown;
    this.game.invincibleUntil = nowSec() + 1.0;
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
    this.events.emit('player.hurt');
    this.rage.addDrama(GAME_CONFIG.dramaHurt, 'slap');
    this.events.emit('camera.shake', { amount: 0.32 });
    this._speak('别在教室里乱跑！', 1800);
  }

  _updateTargetingUI(playerPos) {
    if (!this._weakPoint || !this._rangeRing) return;
    const noteKnown = this.game.hasClue('note');
    const showWeak = noteKnown && this.game.phase === 'investigate' && !this.game.sealed;
    this._weakPoint.visible = showWeak;
    if (showWeak) this._weakPoint.rotation.z = Math.sin(nowSec() * 3) * 0.15;

    const staplerEquipped = this.game.equipped === 'stapler';
    this._rangeRing.visible = showWeak && staplerEquipped;
    if (!this._rangeRing.visible) return;

    const b = this.pawn.body.position;
    const dist = distance2D(b.x, b.z, playerPos.x, playerPos.z);
    const dx = playerPos.x - b.x;
    const dz = playerPos.z - b.z;
    const facingX = Math.sin(this._facing);
    const facingZ = Math.cos(this._facing);
    const dot = (dx * facingX + dz * facingZ) / (Math.hypot(dx, dz) || 1);
    const behind = dot < -0.25;
    const ready = dist <= 2.4 && behind;
    this._rangeRingMat.color.setHex(ready ? 0x4caf50 : 0xe63946);
    this._rangeRingMat.opacity = ready ? 0.85 : 0.4;
    this._rangeRing.scale.setScalar(1 + Math.sin(nowSec() * 4) * 0.03);
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

    if (this.game.chainActive && !this.game.chainPinned) {
      this.events.emit('toast', {
        text: '订书机抖得厉害：主管说的三件套还没做完！',
        ms: 2200
      });
      this._speak('你想干嘛？！', 1600);
      return 'blocked';
    }

    const stage = this.game.currentStage();
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    const facingX = Math.sin(this._facing);
    const facingZ = Math.cos(this._facing);
    const dot = (dx * facingX + dz * facingZ) / (Math.hypot(dx, dz) || 1);
    const behind = dot < -0.25;
    const stealthy = (stage.id === 'calm' || stage.id === 'annoyed') && !this.game.hiding;

    if (this.game.hasClue('note') && ((stealthy && behind) || this._isPinned())) {
      this._sealSuccess();
      return 'success';
    }

    this.game.consumeItem('stapler');
    this.game.usedItems.push('stapler');
    this.game.staplerBroken = true;
    this.game.weakUntil = nowSec() + 1.6;
    this.rage.add(GHOST_CONFIG.rage.wrongSeal, 'wrongSeal');
    this.audio?.play('stapler');
    this.events.emit('toast', { text: '订书机咬住了空气，鬼笑出了声！', ms: 2200 });
    this._speak('你在干嘛？！', 2000);
    return 'wrong';
  }

  _sealSuccess(reason = 'sealed') {
    this.game.sealed = true;
    this.game.rage = 100;
    this.game.phase = 'escape';
    this.game.escapeTimer = GAME_CONFIG.escapeTime;
    this.game.weakUntil = nowSec() + 5.0;
    this.game.pinnedUntil = 0;
    this.scene.openExit();
    this.audio?.play('stapler');
    this.audio?.play('gate');
    this.events.emit('hitstop', { ms: 120 });
    this.events.emit('slowmo', { ms: 450 });
    this.events.emit('escape.start', { reason });
    this.events.emit('toast', { text: '封印成功！它被你钉在空气里了！快跑！', ms: 2600 });
    this._speak('你居然……咩————！！！', 2600);
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
