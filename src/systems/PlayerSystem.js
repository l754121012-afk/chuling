import * as CANNON from 'cannon-es';
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
    this._noiseTimer = 0;
    this._itemCycle = Object.keys(ITEM_DEFS);
    this.pose = 'idle';
    this.poseTimer = 0;
    this.aiming = false;
    this._comboReady = false;
    this._lastEquipped = null;
    this._hurtFlash = 0;
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
    return this.pawn;
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
    this._handleInteractions();
    this._handleItemControls();

    this._syncPlayerMesh();
    const hSpeed = Math.hypot(body.velocity.x, body.velocity.z);
    if (hSpeed > 0.4) {
      this.pawn.mesh.rotation.y = Math.atan2(body.velocity.x, body.velocity.z);
    }
    this._updatePose(dt);
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
    const baseSpeed = canSprint ? GAME_CONFIG.sprintSpeed : GAME_CONFIG.walkSpeed;
    const speed = baseSpeed * (sticky ? 0.6 : 1);

    body.velocity.set(dirX * speed, body.velocity.y, dirZ * speed);
    body.wakeUp();

    if ((this.input.isDown('Space')) && body.position.y < 0.62) {
      body.velocity.y = 5.6;
    }

    if (canSprint && len > 0 && this._noiseTimer <= 0) {
      this.events.emit('noise', {
        pos: this.getPos(),
        radius: GAME_CONFIG.noiseRunRadius
      });
      this._noiseTimer = 0.5;
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
          label: prop.type === 'bookshelf' ? '推倒书架' : '踢垃圾桶'
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
      this.pawn.mesh.visible = !this.game.hiding;
      if (this.game.hiding) this.pawn.body.velocity.set(0, 0, 0);
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
      this.rage.add(12, 'break');
      this.events.emit('noise', { pos: this.getPos(), radius: GAME_CONFIG.noiseBreakRadius });
      this.events.emit('toast', { text: '书架倒了！赔偿 8000 円！', ms: 2200 });
      this.audio?.play('hit');
    } else {
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
    } else if (click && usable) {
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
