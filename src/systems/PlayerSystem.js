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
    if (this.pawn) this.pawn.mesh.visible = true;
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

    const canJump = this.input.isDown('Space') &&
      this._jumpsUsed < 2 &&
      (Math.abs(body.velocity.y) < 0.12 || this._jumpsUsed > 0);
    if (canJump) {
      body.velocity.y = 5.6;
      this._jumpsUsed++;
    }
    if (this._wasFalling && body.velocity.y > -0.1) {
      this._jumpsUsed = 0;
    }
    this._wasFalling = body.velocity.y < -0.2;

    if (canSprint && len > 0 && this._noiseTimer <= 0) {
      this.events.emit('noise', {
        pos: this.getPos(),
        radius: GAME_CONFIG.noiseRunRadius
      });
      this._noiseTimer = 0.5;
    }

    if (len > 0 && this._noiseTimer <= 0) this._checkClutter();
  }

  isCrouching() {
    return this.crouching;
  }

  _checkClutter() {
    const pos = this.getPos();
    for (const c of this.scene.refs?.clutter || []) {
      if (c.used) continue;
      const d = distance2D(pos.x, pos.z, c.x, c.z);
      if (d < 0.9) {
        c.used = true;
        this.rage.add(2, 'clutter');
        this.events.emit('noise', { pos: { x: c.x, z: c.z }, radius: 9 });
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
        this.events.emit('noise', { pos: { x: f.x, z: f.z }, radius: 7 });
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
      this.events.emit('interact.prompt', { text: `E  ${target.label}` });
    } else {
      this.events.emit('interact.prompt', { text: '' });
    }
    if (this.input.justPressed('KeyE') && target) this._doInteract(target);
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
        best = { type: 'item', pickup, label: `捡起${ITEM_DEFS[pickup.id].name}` };
      }
    }

    if (this.game.phase === 'escape' && this.refs.exit) {
      const d = distance2D(pos.x, pos.z, this.refs.exit.pos.x, this.refs.exit.pos.z);
      if (d < GAME_CONFIG.interactRadius && 3 > bestPriority) {
        bestPriority = 3;
        best = { type: 'exit', label: '逃出校园' };
      }
    }

    for (const clue of this.refs.clues) {
      if (this.game.hasClue(clue.id)) continue;
      const d = distance2D(pos.x, pos.z, clue.pos.x, clue.pos.z);
      if (d < GAME_CONFIG.interactRadius && 2.5 > bestPriority) {
        bestPriority = 2.5;
        best = { type: 'clue', clue, label: '查看线索' };
      }
    }

    if (this.refs.locker) {
      const d = distance2D(pos.x, pos.z, this.refs.locker.pos.x, this.refs.locker.pos.z);
      if (d < GAME_CONFIG.interactRadius && 2 > bestPriority) {
        bestPriority = 2;
        best = {
          type: 'locker',
          label: this.game.hiding ? '从柜子里出来' : '躲进柜子'
        };
      }
    }

    for (const prop of this.refs.props) {
      const d = distance2D(pos.x, pos.z, prop.pos.x, prop.pos.z);
      if (d < GAME_CONFIG.interactRadius && 1 > bestPriority) {
        bestPriority = 1;
        best = {
          type: 'prop',
          prop,
          label: prop.type === 'bookshelf' ? '推倒书架' : prop.type === 'trash' ? '踢垃圾桶' : prop.type === 'plant' ? '碰倒盆栽' : '推箱子'
        };
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
      this.events.emit('noise', { pos: this.getPos(), radius: GAME_CONFIG.noiseBreakRadius });
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
      this.events.emit('noise', { pos: this.getPos(), radius: GAME_CONFIG.noiseBreakRadius });
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
      this.events.emit('noise', { pos: this.getPos(), radius: GAME_CONFIG.noiseBreakRadius });
      this.events.emit('toast', { text: '盆栽倒了！赔偿 2000 円！', ms: 1800 });
      this.audio?.play('hit');
    } else if (prop.type === 'crate') {
      prop.body.applyImpulse(
        new CANNON.Vec3(rand(-2, 2), 2.5, rand(-2, 2)),
        new CANNON.Vec3(prop.body.position.x, 0.4, prop.body.position.z)
      );
      prop.body.angularVelocity.set(rand(-1, 1), 0.3, rand(-1, 1));
      this.events.emit('noise', { pos: this.getPos(), radius: 6 });
      this.events.emit('toast', { text: '箱子被推动了！', ms: 1200 });
      this.audio?.play('hit');
    }
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
          this.aiming = true;
          this.playPose('aim', 0.2);
          this.audio?.play('click');
          this.events.emit('aim.changed', { aiming: true, combo: this._comboReady });
          this.events.emit('toast', { text: '瞄准中，再次左键或按 F 射出', ms: 1500 });
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

  _cycleItem() {
    const owned = this._itemCycle.filter(id => this.game.hasItem(id));
    if (owned.length === 0) return;
    const idx = owned.indexOf(this.game.equipped);
    this.game.equipped = owned[(idx + 1) % owned.length];
    this.audio?.play('click');
  }
}
