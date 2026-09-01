import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.js';
import { ITEM_DEFS } from '../config/items.js';
import { GROUPS, makeBody, syncMeshToBody } from '../core/Physics.js';
import { makePlayerMesh } from '../core/PlaceholderAssets.js';
import { choice, clamp, distance2D, nowSec, rand } from '../core/Utils.js';

export class PlayerSystem {
  constructor({
    scene, physics, events, game, input, camera, itemSystem, clueSystem, audio, refs, rage
  }) {
    this.scene = scene;
    this.physics = physics;
    this.events = events;
    this.game = game;
    this.input = input;
    this.camera = camera;
    this.items = itemSystem;
    this.clues = clueSystem;
    this.audio = audio;
    this.refs = refs;
    this.rage = rage;
    this.pawn = null;
    this.phoneLight = null;
    this.ghost = null;
    this._flashCooldown = 0;
    this._whipCooldown = 0;
    this._dodgeCooldown = 0;
    this._dodgeVX = 0;
    this._dodgeVZ = 0;
    this._shiftTapAt = 0;
    this._shiftTapHandled = false;
    this._throwJumpUsed = false;
    this._noiseTimer = 0;
    this._itemCycle = this.game.quickSlots;
    this.pose = 'idle';
    this.poseTimer = 0;
    this.aiming = false;
    this._comboReady = false;
    this._lastEquipped = null;
    this._hurtFlash = 0;
    this._footprintCooldown = 0;
    this._hideRestorePos = null;
    this._hideRestoreType = null;
    this._hideRestoreMask = null;
    this.crouching = false;
    this._shortcutUsed = { locker: false, platform: false };
    this._jumpsUsed = 0;
    this._wasFalling = false;
    this._jumpLock = 0;
    this._pushTarget = null;
    this._pushMove = null;
    this._pushMoveTimer = 0;
    this._pendingCrushUntil = 0;
    this._pendingCrushProp = null;
    this._shelfCrushApplied = false;
    this._ropeT = 0;
    this._ropeDirSign = 1;
    this._ladder = null;
    events.on('player.hurt', () => {
      this.playPose('hurt', 0.7);
      this._hurtFlash = 0.6;
    });
    events.on('vote.choose', i => this._resolveVote(i));
  }

  createPawn() {
    const start = this.refs.playerStart;
    const mesh = makePlayerMesh();
    mesh.position.set(start.x, 1.0, start.z);
    this.scene.group.add(mesh);
    const body = makeBody({
      shape: new CANNON.Sphere(0.35),
      position: { x: start.x, y: 1.0, z: start.z },
      mass: 80,
      group: GROUPS.PLAYER,
      mask: GROUPS.WORLD | GROUPS.PROP | GROUPS.ITEM,
      fixedRotation: true
    });
    body.linearDamping = 0.35;
    body.allowSleep = false;
    this.physics.add(body);
    this.pawn = { mesh, body };
    const phoneLight = new THREE.PointLight('#ffe9b0', 1.8, 8, 1.8);
    phoneLight.position.set(0.45, 1.05, 0.55);
    mesh.add(phoneLight);
    this.phoneLight = phoneLight;
    return this.pawn;
  }

  resetHiding() {
    this.game.hiding = false;
    this.game.ropeClimbing = false;
    this.game.ladderClimbing = false;
    this._ladder = null;
    if (this.pawn) this.pawn.mesh.visible = true;
    if (this.pawn) {
      this.pawn.body.type = CANNON.Body.DYNAMIC;
      this.pawn.body.collisionFilterMask = GROUPS.WORLD | GROUPS.PROP | GROUPS.ITEM;
    }
    if (this._hideRestoreType) {
      this.pawn.body.type = this._hideRestoreType;
      this._hideRestoreType = null;
    }
    if (this._hideRestoreMask) {
      this.pawn.body.collisionFilterMask = this._hideRestoreMask;
      this._hideRestoreMask = null;
    }
    this._hideRestorePos = null;
  }

  resetShortcuts() {
    this._shortcutUsed = { locker: false, platform: false };
  }

  getPos() {
    const p = this.pawn.body.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  update(dt) {
    if (!this.pawn) return;
    if (!this.game.isPlaying()) {
      this._syncPlayerMesh();
      return;
    }

    const body = this.pawn.body;
    this._noiseTimer = Math.max(0, this._noiseTimer - dt);

    this._handleMovement(dt, body);
    if (this.game.thrownUntil > nowSec() && this.pawn.body.velocity.y < 0) {
      this._checkThrowCollision();
    }
    this._handleStamina(dt, body);
    this._checkFootprints(dt);
    this._handleInteractions();
    this._updatePendingCrush();
    this._handleItemControls();
    if (this.input.zoom !== 0) this._cycleItem(this.input.zoom > 0 ? 1 : -1);
    if (this.game.whipMode && this.input.isLeftDown()) {
      if (!this._tryParry()) this._doWhip();
    }
    this._flashCooldown = Math.max(0, this._flashCooldown - dt);
    this._whipCooldown = Math.max(0, this._whipCooldown - dt);
    this._dodgeCooldown = Math.max(0, this._dodgeCooldown - dt);
    if (this.game.charging && nowSec() >= this.game.chargingUntil) {
      this.game.charging = false;
      this.game.battery = this.game.batteryMax;
      this.audio?.play('win');
      this.events.emit('toast', { text: '电充满了！手机满血复活！', ms: 2000 });
    }
    if (this.input.justPressed('KeyV')) this._usePhoneFlash();
    if (this.input.justPressed('KeyG')) this._toggleWhipMode();
    if (this.input.justPressed('KeyH')) this._doUltimate();
    const shiftDown = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    if (this.input.justPressed('ShiftLeft') || this.input.justPressed('ShiftRight')) {
      this._shiftTapAt = nowSec();
      this._shiftTapHandled = false;
    }
    if (this._shiftTapAt > 0 && !this._shiftTapHandled) {
      if (nowSec() - this._shiftTapAt > 0.18) {
        this._shiftTapHandled = true;
      } else if (!shiftDown) {
        this._shiftTapHandled = true;
        this._doDodge();
      }
    }

    if (this._pushTarget) {
      const pos = this.getPos();
      const d = distance2D(
        pos.x,
        pos.z,
        this._pushTarget.body.position.x,
        this._pushTarget.body.position.z
      );
      if (this.input.isDown('KeyE') && d < 3.2) {
        this._pushCrateContinuous(this._pushTarget);
        const v = this._pushTarget.body.velocity;
        this._pushTarget.body.position.x += v.x * dt;
        this._pushTarget.body.position.z += v.z * dt;
        this._pushTarget.body.aabbNeedsUpdate = true;
        if (!this.game.crateRouteComplete && this.refs.crateTarget) {
          const t = this.refs.crateTarget;
          const td = distance2D(
            this._pushTarget.body.position.x,
            this._pushTarget.body.position.z,
            t.x,
            t.z
          );
          if (td < t.r) {
            this.game.crateRouteComplete = true;
            this.audio?.play('gate');
            this.events.emit('toast', { text: '箱子到位！踩着箱子跳上柱子，抓绳索！', ms: 2600 });
            this.scene.spawnParticles({ x: t.x, y: 0.6, z: t.z }, '#f4d35e');
            this.scene.spawnHitRing({ x: t.x, y: 0.5, z: t.z }, '#f4d35e');
          }
        }
      } else {
        this._pushTarget = null;
        this._pushMove = null;
        this._pushMoveTimer = 0;
      }
    }

    this._syncPlayerMesh();
    const hSpeed = Math.hypot(body.velocity.x, body.velocity.z);
    if (hSpeed > 0.4) {
      this.pawn.mesh.rotation.y = Math.atan2(body.velocity.x, body.velocity.z);
    }
    this._updatePose(dt);
    if (this.phoneLight) {
      const f = Math.max(0, this.game.battery) / 100;
      this.phoneLight.intensity = f * 1.9;
      this.phoneLight.distance = 5 + f * 6;
    }
    this.pawn.mesh.scale.y = this.crouching ? 0.68 : 1;
    if (this.game.hiding) {
      this.pawn.mesh.visible = false;
    } else if (nowSec() < this.game.invincibleUntil) {
      this.pawn.mesh.visible = Math.floor(nowSec() * 12) % 2 === 0;
    } else {
      this.pawn.mesh.visible = true;
    }
  }

  _syncPlayerMesh() {
    syncMeshToBody(this.pawn.mesh, this.pawn.body);
    // Physics capsule center sits at 0.35 above the floor; the visual model's
    // feet are at local y=0, so shift the mesh down to stand on the ground.
    this.pawn.mesh.position.y = this.pawn.body.position.y - 0.35;
  }

  playPose(name, duration) {
    this.pose = name;
    this.poseTimer = duration;
  }

  _updatePose(dt) {
    if (this.poseTimer > 0) {
      this.poseTimer -= dt;
      if (this.poseTimer <= 0) this.pose = 'idle';
    }
    const parts = this.pawn.mesh.userData.parts;
    if (!parts) return;
    const target = this._poseTarget();
    const k = Math.min(1, dt * 10);
    const lerpRot = (obj, axis, value) => {
      obj.rotation[axis] += (value - obj.rotation[axis]) * k;
    };
    lerpRot(parts.armR, 'x', target.armR.x);
    lerpRot(parts.armR, 'z', target.armR.z);
    lerpRot(parts.armL, 'x', target.armL.x);
    lerpRot(parts.armL, 'z', target.armL.z);
    lerpRot(parts.body, 'x', target.body);
    lerpRot(parts.head, 'x', target.head);

    const mats = this.pawn.mesh.userData.materials;
    if (mats) {
      if (this._hurtFlash > 0) {
        this._hurtFlash -= dt;
        mats.bodyMat.emissive.setHex(0x8f2f24);
        mats.bodyMat.emissiveIntensity = Math.min(0.8, this._hurtFlash * 2);
      } else if (mats.bodyMat.emissiveIntensity !== 0) {
        mats.bodyMat.emissive.setHex(0x000000);
        mats.bodyMat.emissiveIntensity = 0;
      }
    }
  }

  _poseTarget() {
    const poses = {
      idle: { armR: { x: -0.55, z: -0.15 }, armL: { x: 0.25, z: -0.45 }, body: 0, head: 0 },
      use: { armR: { x: -1.15, z: -0.45 }, armL: { x: 0.3, z: -0.5 }, body: 0.08, head: -0.08 },
      interact: { armR: { x: -0.95, z: -0.3 }, armL: { x: -1.0, z: -0.75 }, body: 0.3, head: 0.25 },
      aim: { armR: { x: -0.9, z: -0.3 }, armL: { x: 0.3, z: -0.5 }, body: 0.05, head: -0.05 },
      hurt: { armR: { x: 1.1, z: -0.2 }, armL: { x: 1.2, z: -0.8 }, body: -0.28, head: -0.35 }
    };
    return poses[this.pose] || poses.idle;
  }

  _handleMovement(dt, body) {
    if (this.game.hiding || this.game.notebookOpen) {
      body.velocity.set(0, body.velocity.y, 0);
      return;
    }
    if (nowSec() < this.game.playerStunUntil) {
      body.velocity.set(0, body.velocity.y, 0);
      return;
    }
    if (this.game.charging) {
      body.velocity.set(0, body.velocity.y, 0);
      return;
    }
    if (nowSec() < this.game.thrownUntil) {
      if (nowSec() < this.game.dodgingUntil) return;
      if (body.position.y > 6.8) {
        body.position.y = 6.8;
        body.velocity.y = 0;
      }
      let moveX = 0;
      let moveZ = 0;
      if (this.input.isDown('KeyW') || this.input.isDown('ArrowUp')) moveZ += 1;
      if (this.input.isDown('KeyS') || this.input.isDown('ArrowDown')) moveZ -= 1;
      if (this.input.isDown('KeyD') || this.input.isDown('ArrowRight')) moveX += 1;
      if (this.input.isDown('KeyA') || this.input.isDown('ArrowLeft')) moveX -= 1;
      const yaw = this.camera.yaw;
      const fwdX = -Math.sin(yaw);
      const fwdZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);
      let dirX = fwdX * moveZ + rightX * moveX;
      let dirZ = fwdZ * moveZ + rightZ * moveX;
      if (Math.hypot(dirX, dirZ) < 0.1) {
        body.velocity.x *= 0.98;
        body.velocity.z *= 0.98;
      } else {
        const len = Math.hypot(dirX, dirZ) || 1;
        body.velocity.x = (dirX / len) * GAME_CONFIG.throwControlSpeed;
        body.velocity.z = (dirZ / len) * GAME_CONFIG.throwControlSpeed;
      }
      if (this.input.isDown('Space') && !this._throwJumpUsed) {
        this._throwJumpUsed = true;
        body.velocity.y = Math.max(body.velocity.y, 8);
        body.velocity.x += fwdX * 3;
        body.velocity.z += fwdZ * 3;
        this.audio?.play('whoosh');
      }
      return;
    }
    this._throwJumpUsed = false;
    if (nowSec() < this.game.dodgingUntil) {
      body.velocity.set(this._dodgeVX, body.velocity.y, this._dodgeVZ);
      return;
    }
    if (this.game.ropeClimbing) {
      body.velocity.set(0, 0, 0);
      const rope = this.refs.rope;
      const speed = 0.55;
      const ropeDx = rope.to.x - rope.from.x;
      const ropeDz = rope.to.z - rope.from.z;
      const ropeLen = Math.hypot(ropeDx, ropeDz) || 1;
      const yaw = this.camera.yaw;
      const facingX = -Math.sin(yaw);
      const facingZ = -Math.cos(yaw);
      const dirSign = (ropeDx * facingX + ropeDz * facingZ) / ropeLen >= 0 ? 1 : -1;
      if (this.input.isDown('KeyW') || this.input.isDown('ArrowUp')) {
        this._ropeT = Math.min(1, this._ropeT + speed * dt * dirSign);
      }
      if (this.input.isDown('KeyS') || this.input.isDown('ArrowDown')) {
        this._ropeT = Math.max(0, this._ropeT - speed * dt * dirSign);
      }
      body.position.set(
        rope.from.x + (rope.to.x - rope.from.x) * this._ropeT,
        rope.y - 0.05,
        rope.from.z + (rope.to.z - rope.from.z) * this._ropeT
      );
      return;
    }
    if (this.game.ladderClimbing) {
      body.velocity.set(0, 0, 0);
      const ladder = this._ladder;
      const speed = 2.5;
      if (this.input.isDown('KeyW') || this.input.isDown('ArrowUp')) {
        body.position.y = Math.min(ladder.topY - 0.2, body.position.y + speed * dt);
      }
      if (this.input.isDown('KeyS') || this.input.isDown('ArrowDown')) {
        body.position.y = Math.max(0.35, body.position.y - speed * dt);
      }
      return;
    }
    if (this._pushMoveTimer > 0) {
      this._pushMoveTimer -= dt;
      if (this._pushMove) body.velocity.set(this._pushMove.vx, body.velocity.y, this._pushMove.vz);
      return;
    }

    let moveX = 0;
    let moveZ = 0;
    if (this.input.isDown('KeyW') || this.input.isDown('ArrowUp')) moveZ += 1;
    if (this.input.isDown('KeyS') || this.input.isDown('ArrowDown')) moveZ -= 1;
    if (this.input.isDown('KeyD') || this.input.isDown('ArrowRight')) moveX += 1;
    if (this.input.isDown('KeyA') || this.input.isDown('ArrowLeft')) moveX -= 1;

    const yaw = this.camera.yaw;
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    let dirX = fwdX * moveZ + rightX * moveX;
    let dirZ = fwdZ * moveZ + rightZ * moveX;
    const len = Math.hypot(dirX, dirZ);
    if (len > 0) {
      dirX /= len;
      dirZ /= len;
    }

    const sprint = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const canSprint = sprint && this.game.stamina > GAME_CONFIG.staminaMinToSprint;
    const sticky = this.game.stickyUntil > nowSec();
    this.crouching = this.input.isDown('KeyC') || this.input.isDown('ControlLeft');
    const baseSpeed = canSprint ? GAME_CONFIG.sprintSpeed : GAME_CONFIG.walkSpeed;
    const speed = baseSpeed * (sticky ? 0.6 : 1) * (this.crouching ? 0.55 : 1);

    body.velocity.set(dirX * speed, body.velocity.y, dirZ * speed);
    body.wakeUp();

    this._jumpLock = Math.max(0, this._jumpLock - dt);
    const grounded = this._isGrounded();
    if (grounded) this._jumpsUsed = 0;
    const canJump = this.input.isDown('Space') &&
      this._jumpsUsed < 2 &&
      this._jumpLock <= 0 &&
      this.game.stamina >= GAME_CONFIG.jumpStaminaCost;
    if (canJump) {
      body.velocity.y = 5.6;
      this._jumpsUsed++;
      this._jumpLock = 0.18;
      this.game.stamina = Math.max(0, this.game.stamina - GAME_CONFIG.jumpStaminaCost);
    }

    if (canSprint && len > 0 && this._noiseTimer <= 0) {
      this.events.emit('noise', {
        pos: this.getPos(),
        radius: GAME_CONFIG.noiseRunRadius,
        rage: 0
      });
      this._noiseTimer = 0.5;
    }

    if (len > 0 && this._noiseTimer <= 0) this._checkClutter();
  }

  isCrouching() {
    return this.crouching;
  }

  _isGrounded() {
    const b = this.pawn.body.position;
    const from = new CANNON.Vec3(b.x, b.y, b.z);
    const to = new CANNON.Vec3(b.x, b.y - 0.75, b.z);
    const hit = this.physics.raycastClosest(from, to, GROUPS.WORLD | GROUPS.PROP);
    if (!hit) return false;
    const hp = hit.hitPointWorld;
    return Math.hypot(hp.x - from.x, hp.y - from.y, hp.z - from.z) < 0.7;
  }

  _checkClutter() {
    const pos = this.getPos();
    for (const c of this.scene.refs?.clutter || []) {
      if (c.used) continue;
      const d = distance2D(pos.x, pos.z, c.x, c.z);
      if (d < 0.9) {
        c.used = true;
        this.scene.breakClutter(c);
        this.rage.add(2, 'clutter');
        this.events.emit('noise', { pos: { x: c.x, z: c.z }, radius: 9, rage: 0 });
        this.events.emit('toast', { text: '踢到杂物了！', ms: 1200 });
        this.audio?.play('hit');
      }
    }
  }

  _handleStamina(dt, body) {
    const moving = Math.hypot(body.velocity.x, body.velocity.z) > 0.4;
    const sprinting = this.input.isDown('ShiftLeft') && moving &&
      this.game.stamina > GAME_CONFIG.staminaMinToSprint;
    if (sprinting) {
      this.game.stamina = clamp(
        this.game.stamina - GAME_CONFIG.staminaDrainPerSecond * dt,
        0,
        this.game.staminaMax
      );
    } else {
      this.game.stamina = clamp(
        this.game.stamina + (GAME_CONFIG.staminaRegenPerSecond + this.game.staminaRegenBonus) * dt,
        0,
        this.game.staminaMax
      );
    }
  }

  _checkFootprints(dt) {
    this._footprintCooldown = Math.max(0, this._footprintCooldown - dt);
    if (this._footprintCooldown > 0 || this.game.hiding) return;
    const pos = this.getPos();
    for (const f of this.scene.footprints) {
      const d = distance2D(pos.x, pos.z, f.x, f.z);
      if (d < 0.38) {
        this._footprintCooldown = 0.8;
        this.rage.add(6, 'footprint');
        this.game.stamina = Math.max(0, this.game.stamina - 5);
        this.events.emit('noise', { pos: { x: f.x, z: f.z }, radius: 7, rage: 0 });
        this.events.emit('toast', { text: '踩到脚印了！它听见了！', ms: 1500 });
        this.audio?.play('slap');
        this.playPose('hurt', 0.35);
        break;
      }
    }
  }

  _handleInteractions() {
    const target = this.findInteractable();
    if (target) {
      const pos = target.pos || { x: 0, y: 1.5, z: 0 };
      const sp = this._screenPos(pos);
      this.events.emit('interact.prompt', { text: `E  ${target.label}`, x: sp.x, y: sp.y });
    } else {
      this.events.emit('interact.prompt', { text: '' });
    }
    if (this.input.justPressed('KeyE') && target) {
      if (target.type === 'prop' && target.prop.type === 'crate') {
        this._pushTarget = target.prop;
        this._pushCrateOnce(target.prop);
      } else {
        this._doInteract(target);
      }
    }
  }

  _screenPos(worldPos) {
    const v = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z).project(this.camera.camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight
    };
  }

  _safeReleasePos() {
    const pos = this.getPos();
    for (const p of this.scene.refs.pillars || []) {
      const d = distance2D(pos.x, pos.z, p.pos.x, p.pos.z);
      if (d < (p.r || 0.55) + 0.1) {
        return { x: p.pos.x, y: 3.35, z: p.pos.z };
      }
    }
    return { x: pos.x, y: pos.y, z: pos.z };
  }

  findInteractable() {
    const pos = this.getPos();
    let best = null;
    let bestPriority = -1;

    if (
      this.ghost &&
      (this.game.broken || this.game.chainPinned) &&
      this.game.phase === 'investigate'
    ) {
      const gp = this.ghost.getPos();
      const d = distance2D(pos.x, pos.z, gp.x, gp.z);
      if (d < GAME_CONFIG.interactRadius + 0.4 && 6 > bestPriority) {
        bestPriority = 6;
        best = {
          type: 'finisher',
          label: '喜剧处决！E',
          pos: { x: gp.x, y: gp.y + 0.8, z: gp.z }
        };
      }
    }

    if (this.refs.charger && this.game.battery < 100) {
      const d = distance2D(pos.x, pos.z, this.refs.charger.pos.x, this.refs.charger.pos.z);
      if (d < GAME_CONFIG.interactRadius && 5 > bestPriority) {
        bestPriority = 5;
        best = {
          type: 'charger',
          label: this.game.charging ? '充电中...' : 'E 充电',
          pos: { x: this.refs.charger.pos.x, y: 1.4, z: this.refs.charger.pos.z }
        };
      }
    }

    for (const pickup of this.items.pickups) {
      if (pickup.picked) continue;
      const d = distance2D(pos.x, pos.z, pickup.pos.x, pickup.pos.z);
      if (d < GAME_CONFIG.pickupRadius && 4 > bestPriority) {
        bestPriority = 4;
        best = {
          type: 'item',
          pickup,
          label: `捡起${ITEM_DEFS[pickup.id].name}`,
          pos: { x: pickup.pos.x, y: (pickup.mesh.position?.y || 0.8) + 0.6, z: pickup.pos.z }
        };
      }
    }

    if (this.game.phase === 'escape' && this.refs.exit) {
      const d = distance2D(pos.x, pos.z, this.refs.exit.pos.x, this.refs.exit.pos.z);
      if (d < GAME_CONFIG.interactRadius && 3 > bestPriority) {
        bestPriority = 3;
        best = { type: 'exit', label: '逃出校园', pos: { x: this.refs.exit.pos.x, y: 2.6, z: this.refs.exit.pos.z } };
      }
    }

    for (const clue of this.refs.clues) {
      if (this.game.hasClue(clue.id)) continue;
      const d = distance2D(pos.x, pos.z, clue.pos.x, clue.pos.z);
      if (d < GAME_CONFIG.interactRadius && 2.5 > bestPriority) {
        bestPriority = 2.5;
        best = { type: 'clue', clue, label: '查看线索', pos: { x: clue.pos.x, y: 1.7, z: clue.pos.z } };
      }
    }

    if (this.refs.locker) {
      const d = distance2D(pos.x, pos.z, this.refs.locker.pos.x, this.refs.locker.pos.z);
      if (d < GAME_CONFIG.interactRadius && 2 > bestPriority) {
        bestPriority = 2;
        best = {
          type: 'locker',
          label: this.game.hiding
            ? '从柜子里出来'
            : this.game.lockerHideCount >= GAME_CONFIG.maxLockerHides
              ? '柜子已被记住'
              : '躲进柜子',
          pos: { x: this.refs.locker.pos.x, y: 2.2, z: this.refs.locker.pos.z }
        };
      }
    }

    for (const prop of this.refs.props) {
      const px = prop.type === 'crate' ? prop.body.position.x : prop.pos.x;
      const pz = prop.type === 'crate' ? prop.body.position.z : prop.pos.z;
      const d = distance2D(pos.x, pos.z, px, pz);
      const radius = prop.type === 'bookshelf' ? 2.8 : GAME_CONFIG.interactRadius;
      if (d < radius && 1 > bestPriority) {
        bestPriority = 1;
        best = {
          type: 'prop',
          prop,
          label: prop.type === 'bookshelf' ? '推倒书架' : prop.type === 'trash' ? '踢垃圾桶' : prop.type === 'plant' ? '碰倒盆栽' : '推箱子（按住持续推）',
          pos: {
            x: prop.type === 'crate' ? prop.body.position.x : prop.pos.x,
            y: prop.type === 'crate' ? 1.1 : prop.type === 'bookshelf' ? 2.0 : 1.0,
            z: prop.type === 'crate' ? prop.body.position.z : prop.pos.z
          }
        };
      }
    }

    const rope = this.refs.rope;
    if (rope) {
      const startD = distance2D(pos.x, pos.z, rope.from.x, rope.from.z);
      const endD = distance2D(pos.x, pos.z, rope.to.x, rope.to.z);
      const nearRopeEnd = Math.min(startD, endD) < 1.8 && Math.abs(pos.y - rope.y) < 1.2;
      if (this.game.ropeClimbing) {
        if (2.8 > bestPriority) {
          bestPriority = 2.8;
          best = {
            type: 'ropeRelease',
            label: '松开绳索',
            pos: { x: pos.x, y: pos.y + 1.0, z: pos.z }
          };
        }
      } else if (nearRopeEnd && 2.8 > bestPriority) {
        bestPriority = 2.8;
        best = {
          type: 'ropeGrab',
          label: '抓住绳索（W/S 移动）',
          pos: { x: startD <= endD ? rope.from.x : rope.to.x, y: rope.y + 0.6, z: startD <= endD ? rope.from.z : rope.to.z }
        };
      }
    }

    const ladder = this.refs.ladders?.[0];
    if (ladder) {
      const dl = distance2D(pos.x, pos.z, ladder.x, ladder.z);
      if (this.game.ladderClimbing) {
        if (2.7 > bestPriority) {
          bestPriority = 2.7;
          best = { type: 'ladderRelease', label: '离开梯子', pos: { x: pos.x, y: pos.y + 1.0, z: pos.z } };
        }
      } else if (dl < 1.6 && pos.y < 1.2 && 2.7 > bestPriority) {
        bestPriority = 2.7;
        best = { type: 'ladderGrab', label: '爬梯子（W/S 上下）', pos: { x: ladder.x, y: 0.8, z: ladder.z } };
      }
    }

    return best;
  }

  _doInteract(target) {
    this.playPose('interact', 0.55);
    if (target.type === 'finisher') {
      this.ghost?.performFinisher();
    } else if (target.type === 'charger') {
      if (this.game.charging) return;
      if (this.game.battery >= 100) {
        this.events.emit('toast', { text: '电量已满，不需要充电', ms: 1400 });
        return;
      }
      this.game.charging = true;
      this.game.chargingUntil = nowSec() + 3;
      this.audio?.play('click');
      this.events.emit('toast', { text: '开始充电，3秒后充满！小心鬼！', ms: 2200 });
    } else if (target.type === 'item') {
      this.items.pickup(target.pickup);
    } else if (target.type === 'exit') {
      this.events.emit('game.win');
    } else if (target.type === 'clue') {
      this.clues.readClue(target.clue.id);
    } else if (target.type === 'ropeGrab') {
      const rope = this.refs.rope;
      const startD = distance2D(
        this.pawn.body.position.x,
        this.pawn.body.position.z,
        rope.from.x,
        rope.from.z
      );
      const endD = distance2D(
        this.pawn.body.position.x,
        this.pawn.body.position.z,
        rope.to.x,
        rope.to.z
      );
      this._ropeT = startD <= endD ? 0 : 1;
      const ropeDx = rope.to.x - rope.from.x;
      const ropeDz = rope.to.z - rope.from.z;
      const ropeLen = Math.hypot(ropeDx, ropeDz) || 1;
      const yaw = this.camera.yaw;
      const facingX = -Math.sin(yaw);
      const facingZ = -Math.cos(yaw);
      const ropeDir = (ropeDx * facingX + ropeDz * facingZ) / ropeLen;
      this._ropeDirSign = ropeDir >= 0 ? 1 : -1;
      this.game.ropeClimbing = true;
      this.pawn.body.type = CANNON.Body.KINEMATIC;
      this.pawn.body.collisionFilterMask = 0;
      this.pawn.body.position.set(
        rope.from.x + (rope.to.x - rope.from.x) * this._ropeT,
        rope.y - 0.05,
        rope.from.z + (rope.to.z - rope.from.z) * this._ropeT
      );
      this.pawn.body.velocity.set(0, 0, 0);
      this.playPose('interact', 0.5);
      this.events.emit('toast', { text: '抓住绳索：W/S 横向移动', ms: 1800 });
    } else if (target.type === 'ropeRelease') {
      this.game.ropeClimbing = false;
      this.pawn.body.type = CANNON.Body.DYNAMIC;
      this.pawn.body.collisionFilterMask = GROUPS.WORLD | GROUPS.PROP | GROUPS.ITEM;
      const safe = this._safeReleasePos();
      this.pawn.body.position.set(safe.x, safe.y, safe.z);
      this.pawn.body.velocity.set(0, 0, 0);
      this.events.emit('toast', { text: '松开绳索', ms: 1000 });
    } else if (target.type === 'ladderGrab') {
      const ladder = this.refs.ladders?.[0];
      this.game.ladderClimbing = true;
      this._ladder = ladder;
      this.pawn.body.type = CANNON.Body.KINEMATIC;
      this.pawn.body.collisionFilterMask = 0;
      this.pawn.body.position.set(ladder.x, Math.max(0.35, this.pawn.body.position.y), ladder.z);
      this.pawn.body.velocity.set(0, 0, 0);
      this.events.emit('toast', { text: '爬梯子：W/S 上下移动', ms: 1800 });
    } else if (target.type === 'ladderRelease') {
      this.game.ladderClimbing = false;
      this._ladder = null;
      this.pawn.body.type = CANNON.Body.DYNAMIC;
      this.pawn.body.collisionFilterMask = GROUPS.WORLD | GROUPS.PROP | GROUPS.ITEM;
      const safe = this._safeReleasePos();
      this.pawn.body.position.set(safe.x, safe.y, safe.z);
      this.pawn.body.velocity.set(0, 0, 0);
      this.events.emit('toast', { text: '离开梯子', ms: 1000 });
    } else if (target.type === 'locker') {
      if (!this.game.hiding && this.game.lockerHideCount >= GAME_CONFIG.maxLockerHides) {
        this.events.emit('toast', { text: '鬼已经记住这个柜子了，再躲也没用！', ms: 2200 });
        this.audio?.play('slap');
        return;
      }
      this.game.hiding = !this.game.hiding;
      if (this.game.hiding) {
        this.game.lastPlayerAction = 'hide';
        this.game.lastActionAt = nowSec();
      }
      if (this.ghost) {
        if (this.game.hiding) {
          this.ghost._telegraphActive = false;
          this.ghost._hideAttackRings?.();
        } else {
          this.ghost._attackCooldown = Math.min(this.ghost._attackCooldown, 1.5);
        }
      }
      if (this.game.hiding) {
        this.game.lockerHideCount += 1;
        this._hideRestorePos = {
          x: this.pawn.body.position.x,
          y: this.pawn.body.position.y,
          z: this.pawn.body.position.z
        };
        this._hideRestoreType = this.pawn.body.type;
        this._hideRestoreMask = this.pawn.body.collisionFilterMask;
        this.pawn.body.type = CANNON.Body.KINEMATIC;
        this.pawn.body.collisionFilterMask = 0;
        const locker = this.refs.locker;
        this.pawn.body.position.set(locker.pos.x, 1.0, locker.pos.z);
        this.pawn.body.velocity.set(0, 0, 0);
        this.pawn.mesh.visible = false;
      } else {
        if (this._hideRestorePos) {
          this.pawn.body.type = this._hideRestoreType ?? CANNON.Body.DYNAMIC;
          this.pawn.body.collisionFilterMask = this._hideRestoreMask ??
            (GROUPS.WORLD | GROUPS.PROP | GROUPS.ITEM);
          this.pawn.body.position.set(
            this._hideRestorePos.x,
            this._hideRestorePos.y,
            this._hideRestorePos.z
          );
          this.pawn.body.velocity.set(0, 0, 0);
          this._hideRestorePos = null;
          this._hideRestoreType = null;
          this._hideRestoreMask = null;
        }
        this.pawn.mesh.visible = true;
      }
      this.audio?.play('click');
      this.events.emit('toast', {
        text: this.game.hiding
          ? this.game.lockerHideCount >= 2
            ? '鬼记住了这个柜子！它守在外面！暴怒值缓慢下降'
            : '躲进柜子了，暴怒值缓慢下降'
          : '从柜子里出来',
        ms: 1800
      });
    } else if (target.type === 'prop') {
      this._kickProp(target.prop);
    }
  }

  _kickProp(prop) {
    if (prop.type === 'bookshelf') {
      if (prop.body.type !== CANNON.Body.DYNAMIC) {
        prop.body.type = CANNON.Body.DYNAMIC;
        prop.body.mass = 45;
      }
      const pos = this.getPos();
      const dirX = prop.body.position.x - pos.x;
      const dirZ = prop.body.position.z - pos.z;
      const dirLen = Math.hypot(dirX, dirZ) || 1;
      if (!prop.used) {
        prop.used = true;
        this.game.damages.push('bookshelf');
      }
      prop.body.applyImpulse(
        new CANNON.Vec3((dirX / dirLen) * 6.5, 7, (dirZ / dirLen) * 6.5),
        new CANNON.Vec3(prop.body.position.x, 0.4, prop.body.position.z)
      );
      prop.body.angularVelocity.set((dirZ / dirLen) * 2.2, 0.8, -(dirX / dirLen) * 2.2);
      prop.body.collisionFilterGroup = GROUPS.WORLD;
      prop.body.collisionFilterMask = GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM;
      this.rage.add(12, 'break');
      this.events.emit('noise', { pos: this.getPos(), radius: GAME_CONFIG.noiseBreakRadius, rage: 0 });
      this.events.emit('toast', { text: '书架倒了！赔偿 8000 円！', ms: 2200 });
      this.audio?.play('hit');
      this._pendingCrushUntil = nowSec() + 1.3;
      this._pendingCrushProp = prop;
      this._shelfCrushApplied = false;
      this._applyShelfCrush(prop);
    } else if (prop.type === 'trash') {
      if (!prop.used) {
        prop.used = true;
        this.game.damages.push('trash');
      }
      prop.body.applyImpulse(
        new CANNON.Vec3(rand(-4, 4), 3.2, rand(-4, 4)),
        new CANNON.Vec3(prop.body.position.x, 0.5, prop.body.position.z)
      );
      this.rage.add(5, 'noise');
      this.events.emit('noise', { pos: this.getPos(), radius: GAME_CONFIG.noiseBreakRadius, rage: 0 });
      this.events.emit('toast', { text: '垃圾桶飞出去了！', ms: 1600 });
      this.audio?.play('slap');
    } else if (prop.type === 'plant') {
      if (!prop.used) {
        prop.used = true;
        this.game.damages.push('plant');
      }
      prop.body.applyImpulse(
        new CANNON.Vec3(rand(-3, 3), 3, rand(-3, 3)),
        new CANNON.Vec3(prop.body.position.x, 0.4, prop.body.position.z)
      );
      prop.body.angularVelocity.set(rand(-3, 3), 0.5, rand(-2, 2));
      this.rage.add(4, 'break');
      this.events.emit('noise', { pos: this.getPos(), radius: GAME_CONFIG.noiseBreakRadius, rage: 0 });
      this.events.emit('toast', { text: '盆栽倒了！赔偿 2000 円！', ms: 1800 });
      this.audio?.play('hit');
    } else if (prop.type === 'crate') {
      prop.body.applyImpulse(
        new CANNON.Vec3(rand(-2, 2), 2.5, rand(-2, 2)),
        new CANNON.Vec3(prop.body.position.x, 0.4, prop.body.position.z)
      );
      prop.body.angularVelocity.set(rand(-1, 1), 0.3, rand(-1, 1));
      this.events.emit('noise', { pos: this.getPos(), radius: 6, rage: 0 });
      this.events.emit('toast', { text: '箱子被推动了！', ms: 1200 });
      this.audio?.play('hit');
    }
  }

  _updatePendingCrush() {
    if (this._pendingCrushUntil <= 0) return;
    if (nowSec() >= this._pendingCrushUntil) {
      this._pendingCrushUntil = 0;
      this._pendingCrushProp = null;
      return;
    }
    if (!this._shelfCrushApplied && this._pendingCrushProp) {
      this._applyShelfCrush(this._pendingCrushProp);
    }
  }

  _applyShelfCrush(prop) {
    if (this._shelfCrushApplied || !this.ghost) return false;
    const gp = this.ghost.getPos();
    const gd = Math.hypot(gp.x - prop.body.position.x, gp.z - prop.body.position.z);
    if (gd > 4.2) return false;
    this._shelfCrushApplied = true;
    this._pendingCrushUntil = 0;
    this._pendingCrushProp = null;
    this.game.stunnedUntil = nowSec() + 2;
    this.ghost.damage(10, { rage: 5 });
    this.game.pinnedUntil = nowSec() + 12;
    this.ghost.registerKnockdown();
    if (this.game.chainActive || this.game.chainStuck) {
      this.game.chainStuck = false;
      this.game.chainPinned = true;
    }
    this.audio?.play('slam');
    this.events.emit('hitstop', { ms: 100 });
    this.events.emit('camera.shake', { amount: 0.45 });
    this.events.emit('toast', { text: '书架把鬼砸扁了！！它动不了了！', ms: 2000 });
    this.scene.spawnParticles({ x: gp.x, y: gp.y, z: gp.z }, '#c94f3d');
    this.scene.spawnHitRing({ x: gp.x, y: gp.y, z: gp.z }, '#c94f3d');
    return true;
  }

  _pushCrateOnce(prop) {
    const yaw = this.camera.yaw;
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    if (!this._crateInFront(prop, fwdX, fwdZ)) {
      this.events.emit('toast', { text: '需要面向箱子才能推', ms: 1200 });
      return;
    }
    if (!this._canPushCrate(prop, fwdX, fwdZ)) {
      this.events.emit('toast', { text: '推不动，前面被挡住了', ms: 1200 });
      return;
    }
    const speed = 2.1;
    prop.body.velocity.set(fwdX * speed, prop.body.velocity.y, fwdZ * speed);
    this._pushMove = { vx: fwdX * speed, vz: fwdZ * speed };
    this._pushMoveTimer = 0.18;
    this.audio?.play('hit');
    this.events.emit('toast', { text: '推动箱子', ms: 800 });
  }

  _pushCrateContinuous(prop) {
    const yaw = this.camera.yaw;
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    if (!this._crateInFront(prop, fwdX, fwdZ)) {
      this._pushTarget = null;
      return;
    }
    if (!this._canPushCrate(prop, fwdX, fwdZ)) {
      prop.body.velocity.set(0, prop.body.velocity.y, 0);
      this._pushMove = { vx: 0, vz: 0 };
      return;
    }
    const speed = 3.2;
    prop.body.velocity.set(fwdX * speed, prop.body.velocity.y, fwdZ * speed);
    this._pushMove = { vx: fwdX * speed, vz: fwdZ * speed };
    this._pushMoveTimer = 0.12;
  }

  _crateInFront(prop, fwdX, fwdZ) {
    const p = this.getPos();
    const dx = prop.body.position.x - p.x;
    const dz = prop.body.position.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    const dot = (dx * fwdX + dz * fwdZ) / len;
    return dot > 0.35 && len < 2.2;
  }

  _canPushCrate(prop, dirX, dirZ) {
    const b = prop.body.position;
    const len = Math.hypot(dirX, dirZ) || 1;
    dirX /= len;
    dirZ /= len;
    const from = new CANNON.Vec3(b.x + dirX * 0.45, b.y, b.z + dirZ * 0.45);
    const to = new CANNON.Vec3(b.x + dirX * 1.1, b.y, b.z + dirZ * 1.1);
    const hit = this.physics.raycastClosest(from, to, GROUPS.WORLD | GROUPS.PROP);
    if (!hit) return true;
    const hp = hit.hitPointWorld;
    const dist = Math.hypot(hp.x - from.x, hp.y - from.y, hp.z - from.z);
    return dist > 0.5;
  }

  _handleItemControls() {
    const def = this.game.equippedDef();
    if (!def) return;
    if (this._lastEquipped !== this.game.equipped) {
      this._lastEquipped = this.game.equipped;
      this.aiming = false;
      this._comboReady = false;
      this.events.emit('aim.changed', { aiming: false, combo: false });
    }

    const click = this.input.consumeClick() || this.input.justPressed('KeyF');
    const usable = !this.game.notebookOpen && !this.game.hiding;

    if (this.game.whipMode) {
      if (click && usable && !this._tryParry()) this._doWhip();
    } else if (def.type === 'throw') {
      if (this.input.justRightPressed()) {
        this.aiming = !this.aiming;
        if (!this.aiming) this._comboReady = false;
        this.audio?.play('click');
        this.events.emit('aim.changed', { aiming: this.aiming, combo: this._comboReady });
      }
      if (click && usable) {
        if (this.aiming) {
          this.aiming = false;
          const combo = this._comboReady;
          this._comboReady = false;
          this.playPose('use', 0.45);
          this.events.emit('aim.changed', { aiming: false, combo: false });
          if (combo) this.items.comboSlingshot();
          else this.items.useEquipped();
        } else {
          this.events.emit('toast', { text: '按右键瞄准后再投掷', ms: 1300 });
        }
      }
    } else if ((click || this.input.justRightPressed()) && usable) {
      this.playPose('use', 0.45);
      this.items.useEquipped();
    }

    for (let i = 0; i < this._itemCycle.length; i++) {
      if (this.input.justPressed(`Digit${i + 1}`)) {
        const id = this._itemCycle[i];
        if (this.game.hasItem(id)) {
          this.game.equipped = id;
          this.aiming = false;
          this._comboReady = false;
          this.events.emit('aim.changed', { aiming: false, combo: false });
        }
      }
    }
  }

  _usePhoneFlash() {
    if (this._flashCooldown > 0) {
      this.events.emit('toast', { text: '闪光还在冷却', ms: 1200 });
      return;
    }
    if (this.game.battery < 15) {
      this.events.emit('toast', { text: '电量不足，无法闪光', ms: 1600 });
      return;
    }
    this.game.battery -= 15;
    this._flashCooldown = 6;
    this.audio?.play('flash');
    this.events.emit('phone.flash');
    this.events.emit('camera.shake', { amount: 0.15 });

    if (!this.ghost) return;
    const pp = this.getPos();
    const gp = this.ghost.getPos();
    const dx = gp.x - pp.x;
    const dz = gp.z - pp.z;
    const dist = Math.hypot(dx, dz);
    const yaw = this.camera.yaw;
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const dot = (dx * fwdX + dz * fwdZ) / (dist || 1);
    if (dist < 9 && dot > 0.2) {
      this.game.stunnedUntil = nowSec() + 2;
      this.events.emit('toast', { text: '闪光灯！鬼被闪瞎了！', ms: 1800 });
      this.ghost._speak('眼睛！！', 1500);
    } else {
      this.events.emit('toast', { text: '闪光灯亮了，但没照到鬼', ms: 1200 });
    }
  }

  _toggleWhipMode() {
    if (!this.game.isPlaying()) return;
    if (this.game.hiding || this.game.notebookOpen) return;
    if (this.game.ropeClimbing || this.game.ladderClimbing) return;
    this.game.whipMode = !this.game.whipMode;
    this.game.whipCombo = 0;
    this.aiming = false;
    this._comboReady = false;
    this.events.emit('aim.changed', { aiming: false, combo: false });
    this.audio?.play('click');
    this.playPose(this.game.whipMode ? 'use' : 'idle', 0.3);
    this.events.emit('toast', {
      text: this.game.whipMode
        ? '鞭子模式：按住或点击左键连抽，再按 G 关闭'
        : '鞭子模式已关闭',
      ms: 2000
    });
  }

  _doWhip() {
    if (this._whipCooldown > 0) return;
    if (this.game.hiding || this.game.notebookOpen) return;
    if (this.game.ropeClimbing || this.game.ladderClimbing) return;
    if (this.game.stamina < GAME_CONFIG.whipStaminaCost) {
      this.events.emit('toast', { text: '没力气抽了！先喘口气', ms: 1300 });
      return;
    }
    this.game.lastPlayerAction = 'whip';
    this.game.lastActionAt = nowSec();

    this._whipCooldown = GAME_CONFIG.whipCooldown;
    this.game.whipCooldownUntil = nowSec() + GAME_CONFIG.whipCooldown;
    this.game.stamina = Math.max(0, this.game.stamina - GAME_CONFIG.whipStaminaCost);
    this.playPose('use', 0.4);

    if (this.game.whipComboUntil < nowSec()) this.game.whipCombo = 0;
    if (!this.ghost) {
      this._whipMiss();
      return;
    }
    if (this.ghost._isPinned() || this.game.chainStuck) {
      this.game.whipCombo = 0;
      this.events.emit('toast', {
        text: this.game.chainStuck ? '它都被修正带黏住了，别抽了！' : '它都被压扁了，别鞭尸了！',
        ms: 1400
      });
      this.audio?.play('whoosh');
      return;
    }

    const pp = this.getPos();
    const gp = this.ghost.getPos();
    const dx = gp.x - pp.x;
    const dz = gp.z - pp.z;
    const dist = Math.hypot(dx, dz);
    const yaw = this.camera.yaw;
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const dot = (dx * fwdX + dz * fwdZ) / (dist || 1);
    if (dist > GAME_CONFIG.whipRange || dist < 0.5 || dot < GAME_CONFIG.whipCone) {
      this._whipMiss();
      return;
    }

    this.game.whipCombo += 1;
    this.game.whipHits += 1;
    this.game.maxWhipCombo = Math.max(this.game.maxWhipCombo, this.game.whipCombo);
    this.game.whipComboUntil = nowSec() + GAME_CONFIG.whipComboWindow;
    const combo = this.game.whipCombo;
    const rageAmount = GAME_CONFIG.whipRageBase + (combo >= 10 ? 8 : combo >= 5 ? 5 : 0);
    this.rage.add(rageAmount, 'whip');
    const kb = GAME_CONFIG.whipKnockback * (this.game.desperate ? 1.5 : 1);
    this.ghost.knockback(
      (dx / dist) * kb,
      (dz / dist) * kb,
      0.35
    );
    this.ghost._spinTimer = GAME_CONFIG.whipSpinDuration;
    this.ghost._spinDir = dx >= 0 ? 1 : -1;
    this.ghost._dashFlash = 0.25;
    this.ghost.damage(1, { rage: 0 });
    this.audio?.play('whip');
    this.scene.spawnSlashTrail(
      { x: pp.x, y: 0, z: pp.z },
      { x: gp.x, y: 0, z: gp.z },
      '#ffd166',
      0.35
    );
    this.scene.spawnAirSlash(
      { x: pp.x, y: 1.25, z: pp.z },
      { x: gp.x, y: 1.25, z: gp.z },
      '#ffd166',
      0.35
    );
    this.events.emit('hitstop', { ms: 60 });
    this.events.emit('camera.shake', { amount: 0.22 });
    this.scene.spawnParticles({ x: gp.x, y: gp.y, z: gp.z }, '#f4d35e');
    this.scene.spawnHitRing({ x: gp.x, y: gp.y, z: gp.z }, '#f4d35e');
    this.events.emit('toast', { text: `啪！连击 x${combo}`, ms: 1100 });

    if (combo % 5 === 0) {
      this.rage.add(12, 'whipBurst');
      this.ghost._speak('你居然敢抽我！！', 1800);
      this.ghost.registerKnockdown();
      this.ghost._dashCooldown = 0;
      this.ghost._skillCooldown = 0;
      this.events.emit('act.card', {
        title: `第 ${combo} 连击 · 它火了！！`,
        line: '鬼的能力提升了，别抽太爽忘记跑！'
      });
      this.events.emit('danmaku', {
        text: choice([`第 ${combo} 连击！！鞭神！`, '它被抽火了哈哈哈', '观众：再来一鞭！'])
      });
    }
  }

  _whipMiss() {
    this.game.whipCombo = 0;
    this.game.whipMisses += 1;
    this.game.stickyUntil = nowSec() + 0.6;
    if (this.game.desperate) {
      this.game.stamina = Math.max(0, this.game.stamina - 10);
      this.game.stickyUntil = nowSec() + 1.0;
    }
    this.rage.addDrama(GAME_CONFIG.dramaWhiff, 'whiff');
    this.playPose('hurt', 0.4);
    this.audio?.play('whoosh');
    this.events.emit('camera.shake', { amount: 0.1 });
    const pp = this.getPos();
    const yaw = this.camera.yaw;
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    this.scene.spawnSlashTrail(
      { x: pp.x, y: 0, z: pp.z },
      { x: pp.x + fwdX * 2, y: 0, z: pp.z + fwdZ * 2 },
      '#d9c8a0',
      0.3
    );
    this.scene.spawnAirSlash(
      { x: pp.x, y: 1.25, z: pp.z },
      { x: pp.x + fwdX * 2, y: 1.25, z: pp.z + fwdZ * 2 },
      '#d9c8a0',
      0.3
    );
    this.events.emit('noise', { pos: this.getPos(), radius: 12, rage: 3 });
    this.events.emit('toast', {
      text: '抽空了！自己绊了一下，鬼看过来了！',
      ms: 1600
    });
    this.events.emit('danmaku', {
      text: choice(['笑死，抽空了', '主播手滑了！', '这鞭子抽了个寂寞'])
    });
  }

  _tryParry() {
    if (!this.ghost || !this.ghost._telegraphActive) return false;
    const pp = this.getPos();
    const gp = this.ghost.getPos();
    const dist = Math.hypot(gp.x - pp.x, gp.z - pp.z);
    const range = GAME_CONFIG.parryRange + (this.game.desperate ? 1.5 : 0);
    if (dist > range) return false;
    const yaw = this.camera.yaw;
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const dot = ((gp.x - pp.x) * fwdX + (gp.z - pp.z) * fwdZ) / (dist || 1);
    if (dot < (this.game.desperate ? 0.1 : 0.3)) return false;
    this.playPose('use', 0.45);
    return this.ghost.parrySucceeded();
  }

  _doDodge() {
    if (this._dodgeCooldown > 0) return;
    if (this.game.hiding || this.game.notebookOpen) return;
    if (this.game.ropeClimbing || this.game.ladderClimbing) return;
    if (nowSec() < this.game.playerStunUntil) return;
    if (this.game.stamina < GAME_CONFIG.dodgeStaminaCost) {
      this.events.emit('toast', { text: '没体力闪了！', ms: 1200 });
      return;
    }
    this._dodgeCooldown = GAME_CONFIG.dodgeCooldown;
    this.game.lastPlayerAction = 'dodge';
    this.game.lastActionAt = nowSec();
    this.game.stamina = Math.max(0, this.game.stamina - GAME_CONFIG.dodgeStaminaCost);
    this.game.dodgingUntil = nowSec() + GAME_CONFIG.dodgeDuration;
    this.game.dodgeCount += 1;
    this.playPose('hurt', 0.35);
    this.audio?.play('whoosh');
    this.events.emit('camera.shake', { amount: 0.08 });
    this.scene.spawnParticles(this.getPos(), '#d9c8a0');

    const yaw = this.camera.yaw;
    let moveX = 0;
    let moveZ = 0;
    if (this.input.isDown('KeyW') || this.input.isDown('ArrowUp')) moveZ += 1;
    if (this.input.isDown('KeyS') || this.input.isDown('ArrowDown')) moveZ -= 1;
    if (this.input.isDown('KeyD') || this.input.isDown('ArrowRight')) moveX += 1;
    if (this.input.isDown('KeyA') || this.input.isDown('ArrowLeft')) moveX -= 1;
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    let dirX = fwdX * moveZ + rightX * moveX;
    let dirZ = fwdZ * moveZ + rightZ * moveX;
    if (Math.hypot(dirX, dirZ) < 0.1) {
      dirX = fwdX;
      dirZ = fwdZ;
    }
    const len = Math.hypot(dirX, dirZ) || 1;
    dirX /= len;
    dirZ /= len;
    this._dodgeVX = dirX * GAME_CONFIG.dodgeSpeed;
    this._dodgeVZ = dirZ * GAME_CONFIG.dodgeSpeed;
    this.pawn.body.velocity.set(
      this._dodgeVX,
      this.pawn.body.velocity.y,
      this._dodgeVZ
    );
    this._bonkCheck(dirX, dirZ);
  }

  _bonkCheck(dirX, dirZ) {
    const p = this.getPos();
    const dashDist = GAME_CONFIG.dodgeSpeed * GAME_CONFIG.dodgeDuration;
    const bonkDist = Math.min(dashDist, 1.4);
    const from = new CANNON.Vec3(p.x, p.y + 0.4, p.z);
    const to = new CANNON.Vec3(
      p.x + dirX * bonkDist,
      p.y + 0.4,
      p.z + dirZ * bonkDist
    );
    const hit = this.physics.raycastClosest(from, to, GROUPS.WORLD | GROUPS.PROP);
    if (!hit) return;
    if (Math.random() < GAME_CONFIG.dodgeBonkChance) {
      this.game.playerStunUntil = nowSec() + 1.1;
      this.game.dodgingUntil = 0;
      this.pawn.body.velocity.set(0, this.pawn.body.velocity.y, 0);
      this.audio?.play('slap');
      this.events.emit('camera.shake', { amount: 0.28 });
      this.events.emit('toast', { text: '疼疼疼！！撞到实心障碍了！', ms: 1600 });
      this.rage.addDrama(GAME_CONFIG.dramaWhiff, 'bonk');
    }
  }

  _checkThrowCollision() {
    const p = this.getPos();
    const vx = this.pawn.body.velocity.x;
    const vz = this.pawn.body.velocity.z;
    const speed = Math.hypot(vx, vz);
    if (speed < 0.5) return;
    const dx = vx / speed;
    const dz = vz / speed;
    const from = new CANNON.Vec3(p.x, p.y + 0.5, p.z);
    const to = new CANNON.Vec3(p.x + dx * 1.1, p.y + 0.5, p.z + dz * 1.1);
    const hit = this.physics.raycastClosest(from, to, GROUPS.WORLD | GROUPS.PROP);
    if (!hit) return;
    this.game.thrownUntil = 0;
    this.game.thrownByGhost = false;
    this.game.playerStunUntil = nowSec() + 1.2;
    this.pawn.body.velocity.set(0, 0, 0);
    this.audio?.play('slap');
    this.events.emit('camera.shake', { amount: 0.35 });
    this.events.emit('toast', { text: '撞到阻挡了！头晕落地！', ms: 1600 });
    this.events.emit('danmaku', {
      text: choice(['撞墙了哈哈哈', '抛飞变碰碰车！'])
    });
  }

  _doUltimate() {
    if (this.game.voteActive) return;
    if (this.game.drama < GAME_CONFIG.dramaMax) return;
    const pool = [
      { id: 'whip', label: '夺命连环鞭' },
      { id: 'recharge', label: '主管报销' },
      { id: 'trip', label: '假摔引鬼' },
      { id: 'broadcast', label: '社死广播' }
    ];
    const a = pool[Math.floor(Math.random() * pool.length)];
    let b = pool[Math.floor(Math.random() * pool.length)];
    while (b.id === a.id) b = pool[Math.floor(Math.random() * pool.length)];
    this.game.voteOptions = [a, b];
    this.game.voteActive = true;
    this.events.emit('vote.start', { options: this.game.voteOptions });
    this.audio?.play('click');
  }

  _resolveVote(index) {
    if (!this.game.voteActive) return;
    const opt = this.game.voteOptions[index];
    this.game.voteActive = false;
    this.game.voteOptions = [];
    this.game.drama = 0;
    this.game.dramaFullNotified = false;
    this.events.emit('vote.end');
    this.audio?.play('whip');
    this.events.emit('hitstop', { ms: 120 });
    this.events.emit('slowmo', { ms: 350 });
    this.events.emit('camera.shake', { amount: 0.5 });
    this.playPose('use', 0.6);
    this.events.emit('act.card', {
      title: `观众投票 · ${opt.label}！`,
      line: '观众的选择就是节目效果！'
    });
    if (opt.id === 'whip') this._applyVoteWhip();
    else if (opt.id === 'recharge') this._applyVoteRecharge();
    else if (opt.id === 'trip') this._applyVoteTrip();
    else this._applyVoteBroadcast();
  }

  _applyVoteWhip() {
    if (!this.ghost) return;
    const pp = this.getPos();
    const gp = this.ghost.getPos();
    const dx = gp.x - pp.x;
    const dz = gp.z - pp.z;
    const len = Math.hypot(dx, dz) || 1;
    this.ghost.knockback((dx / len) * 12, (dz / len) * 12, 0.7);
    this.ghost._spinTimer = 1.2;
    this.ghost._dashFlash = 0.5;
    this.rage.add(10, 'ultimate');
    this.ghost.registerKnockdown();
    this.scene.spawnParticles({ x: gp.x, y: gp.y, z: gp.z }, '#ffd166');
    this.scene.spawnHitRing({ x: gp.x, y: gp.y, z: gp.z }, '#ffd166');
    this.events.emit('toast', { text: '夺命连环鞭！！', ms: 1600 });
    this.events.emit('danmaku.burst');
  }

  _applyVoteRecharge() {
    this.game.stamina = this.game.staminaMax;
    this.game.addItem('pen', 1);
    this.events.emit('toast', { text: '主管报销：体力回满，还送了支圆珠笔！', ms: 1800 });
  }

  _applyVoteTrip() {
    if (!this.ghost) return;
    this.game.stunnedUntil = nowSec() + 2.2;
    this.ghost._speak('谁绊我？！', 1600);
    this.events.emit('toast', { text: '假摔成功！鬼被绊倒了！', ms: 1800 });
  }

  _applyVoteBroadcast() {
    this.rage.addComposure(40, 'broadcast');
    this.events.emit('toast', { text: '社死广播！它心态崩了一大截！', ms: 1800 });
  }

  _cycleItem(dir = 1) {
    const owned = this._itemCycle.filter(id => this.game.hasItem(id));
    if (owned.length === 0) return;
    const idx = owned.indexOf(this.game.equipped);
    this.game.equipped = owned[(idx + dir + owned.length) % owned.length];
    this.aiming = false;
    this._comboReady = false;
    this.events.emit('aim.changed', { aiming: false, combo: false });
    this.audio?.play('click');
  }
}
