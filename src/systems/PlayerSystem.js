import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.js';
import { ITEM_DEFS } from '../config/items.js';
import { GROUPS, makeBody, syncMeshToBody } from '../core/Physics.js';
import { makePlayerMesh } from '../core/PlaceholderAssets.js';
import { clamp, distance2D, nowSec, rand } from '../core/Utils.js';

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
    this._noiseTimer = 0;
    this._itemCycle = Object.keys(ITEM_DEFS);
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
    this._ropeT = 0;
    this._ropeDirSign = 1;
    this._ladder = null;
    events.on('player.hurt', () => {
      this.playPose('hurt', 0.7);
      this._hurtFlash = 0.6;
    });
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
    this._handleStamina(dt, body);
    this._checkFootprints(dt);
    this._handleInteractions();
    this._handleItemControls();
    this._flashCooldown = Math.max(0, this._flashCooldown - dt);
    if (this.input.justPressed('KeyV')) this._usePhoneFlash();

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
    this.crouching = this.input.isDown('KeyX') || this.input.isDown('ControlLeft');
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
        GAME_CONFIG.staminaMax
      );
    } else {
      this.game.stamina = clamp(
        this.game.stamina + GAME_CONFIG.staminaRegenPerSecond * dt,
        0,
        GAME_CONFIG.staminaMax
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
          label: this.game.hiding ? '从柜子里出来' : '躲进柜子',
          pos: { x: this.refs.locker.pos.x, y: 2.2, z: this.refs.locker.pos.z }
        };
      }
    }

    for (const prop of this.refs.props) {
      const px = prop.type === 'crate' ? prop.body.position.x : prop.pos.x;
      const pz = prop.type === 'crate' ? prop.body.position.z : prop.pos.z;
      const d = distance2D(pos.x, pos.z, px, pz);
      if (d < GAME_CONFIG.interactRadius && 1 > bestPriority) {
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
    if (target.type === 'item') {
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
      this.game.hiding = !this.game.hiding;
      if (this.game.hiding) {
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
        text: this.game.hiding ? '躲进柜子了，暴怒值缓慢下降' : '从柜子里出来',
        ms: 1600
      });
    } else if (target.type === 'prop') {
      this._kickProp(target.prop);
    }
  }

  _kickProp(prop) {
    if (prop.type === 'bookshelf') {
      if (!prop.used) {
        prop.used = true;
        this.game.damages.push('bookshelf');
      }
      prop.body.applyImpulse(
        new CANNON.Vec3(rand(-3, 3), 4.5, rand(-3, 3)),
        new CANNON.Vec3(prop.body.position.x, 0.4, prop.body.position.z)
      );
      prop.body.angularVelocity.set(rand(-2, 2), 0.6, rand(-1.5, 1.5));
      prop.body.collisionFilterGroup = GROUPS.WORLD;
      prop.body.collisionFilterMask = GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM;
      this.rage.add(12, 'break');
      this.events.emit('noise', { pos: this.getPos(), radius: GAME_CONFIG.noiseBreakRadius, rage: 0 });
      this.events.emit('toast', { text: '书架倒了！赔偿 8000 円！', ms: 2200 });
      this.audio?.play('hit');
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

    if (def.type === 'throw') {
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

    if (this.input.justPressed('KeyC')) {
      if (def.type === 'throw' && this.game.hasItem('pen') && this.game.hasItem('rubber')) {
        this.aiming = true;
        this._comboReady = true;
        this.playPose('aim', 0.2);
        this.events.emit('aim.changed', { aiming: true, combo: true });
        this.events.emit('toast', { text: '自制弹弓已装填，左键或 F 射出', ms: 1500 });
      } else if (def.type !== 'throw') {
        this.items.comboSlingshot();
      }
    }

    if (this.input.justPressed('KeyQ')) {
      this._cycleItem();
      this.aiming = false;
      this._comboReady = false;
      this.events.emit('aim.changed', { aiming: false, combo: false });
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

  _cycleItem() {
    const owned = this._itemCycle.filter(id => this.game.hasItem(id));
    if (owned.length === 0) return;
    const idx = owned.indexOf(this.game.equipped);
    this.game.equipped = owned[(idx + 1) % owned.length];
    this.audio?.play('click');
  }
}
