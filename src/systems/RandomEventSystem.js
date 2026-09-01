import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.js';
import { ITEM_DEFS } from '../config/items.js';
import { distance2D, nowSec, rand } from '../core/Utils.js';

const EVENTS = ['blackout', 'red_zone', 'desk_rampage', 'supply_drop'];

export class RandomEventSystem {
  constructor({ scene, events, game, ghost, player, rage, audio }) {
    this.scene = scene;
    this.events = events;
    this.game = game;
    this.ghost = ghost;
    this.player = player;
    this.rage = rage;
    this.audio = audio;
    this._blackoutPending = false;
    this._redZone = null;
    this._supplyTimer = 0;
  }

  reset() {
    this.game.randomEvents = this._rollEvents();
    this.game.nextEventAt = nowSec() + 22;
    this.game.huntActive = false;
    this.game.huntUntil = 0;
    this.game.huntDone = false;
    this.game.ghostSpeedBoostUntil = 0;
    this.game.deskRampageUntil = 0;
    this._clearRedZone();
    this._clearSupplyDrop();
    this._blackoutPending = false;
    this.events.emit('hunt.end');
  }

  _rollEvents() {
    const pool = [...EVENTS];
    const picked = [];
    while (picked.length < 2 && pool.length) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    return picked;
  }

  update(dt) {
    if (!this.game.isPlaying() || this.game.phase !== 'investigate') return;
    if (
      this.game.nextEventAt > 0 &&
      nowSec() >= this.game.nextEventAt &&
      this.game.randomEvents.length
    ) {
      const event = this.game.randomEvents.shift();
      this.game.nextEventAt = nowSec() + rand(32, 55);
      this._runEvent(event);
    }

    if (!this.game.huntDone && this.game.rage >= 75) {
      this._startHunt();
    }
    if (this.game.huntActive && nowSec() >= this.game.huntUntil) {
      this.game.huntActive = false;
      this.events.emit('hunt.end');
      this.rage.addDrama(20, 'hunt');
      this.events.emit('toast', { text: '你活过了猎杀时刻！节目效果+20！', ms: 2200 });
    }

    if (this._blackoutPending && this.game.lightsOutUntil <= nowSec()) {
      this._blackoutPending = false;
      const p = this.player.getPos();
      const yaw = this.player.camera?.yaw || 0;
      const fwdX = -Math.sin(yaw);
      const fwdZ = -Math.cos(yaw);
      this.ghost.pawn.body.position.set(p.x - fwdX * 3, 1.2, p.z - fwdZ * 3);
      this.ghost.pawn.body.velocity.set(0, 0, 0);
      this.audio?.play('ghost');
      this.events.emit('blackout.end');
      this.events.emit('toast', { text: '灯亮了……它就在你身后！！', ms: 2200 });
      this.events.emit('camera.shake', { amount: 0.4 });
    }

    if (this._redZone) {
      const z = this._redZone;
      const p = this.player.getPos();
      const inside = distance2D(p.x, p.z, z.x, z.z) < z.r;
      if (inside) {
        this.game.stamina = Math.max(0, this.game.stamina - GAME_CONFIG.staminaDrainPerSecond * 0.8 * dt);
        if (!z.toasted) {
          z.toasted = true;
          this.events.emit('toast', { text: '禁区红线！快离开！', ms: 1400 });
        }
      }
      if (nowSec() >= z.until) {
        this._clearRedZone();
      }
    }

    if (this.game.supplyDrop) {
      const s = this.game.supplyDrop;
      const p = this.player.getPos();
      if (distance2D(p.x, p.z, s.x, s.z) < 1.2) {
        this._takeSupplyDrop(s);
      } else if (nowSec() >= s.until) {
        this._clearSupplyDrop();
      }
    }
  }

  _runEvent(type) {
    if (type === 'blackout') {
      this.game.lightsOutUntil = nowSec() + 2;
      this._blackoutPending = true;
      this.events.emit('blackout.start');
      this.audio?.play('heartbeat');
      this.events.emit('toast', { text: '啪——停电了！！', ms: 1600 });
      return;
    }
    if (type === 'red_zone') {
      const c = this.scene.L.classroom;
      const x = rand(c.minX + 2, c.maxX - 2);
      const z = rand(c.minZ + 2, c.maxZ - 2);
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(2.1, 2.4, 32),
        new THREE.MeshBasicMaterial({
          color: 0xff4d4d,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.05, z);
      this.scene.group.add(mesh);
      this._redZone = { x, z, r: 2.3, until: nowSec() + 8, mesh, toasted: false };
      this.events.emit('toast', { text: '禁区红线出现了！！', ms: 1600 });
      this.audio?.play('chalk');
      return;
    }
    if (type === 'desk_rampage') {
      this.game.deskRampageUntil = nowSec() + 6;
      this.game.ghostSpeedBoostUntil = nowSec() + 6;
      this.events.emit('toast', { text: '桌椅暴走了！鬼也变快了！！', ms: 1800 });
      this.audio?.play('shake');
      this.events.emit('camera.shake', { amount: 0.3 });
      return;
    }
    if (type === 'supply_drop') {
      const c = this.scene.L.classroom;
      const x = rand(c.minX + 2, c.maxX - 2);
      const z = rand(c.minZ + 2, c.maxZ - 2);
      const id = ['pen', 'glue', 'tape', 'mine'][Math.floor(Math.random() * 4)];
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9 })
      );
      mesh.position.set(x, 0.35, z);
      this.scene.group.add(mesh);
      this.game.supplyDrop = { x, z, id, until: nowSec() + 12, mesh };
      this.events.emit('toast', { text: '主管空投了一个补给箱！', ms: 1600 });
      this.audio?.play('gate');
    }
  }

  _takeSupplyDrop(s) {
    this._clearSupplyDrop();
    if (Math.random() < 0.5) {
      this.game.addItem(s.id, 1);
      this.events.emit('toast', { text: `${ITEM_DEFS[s.id]?.name || s.id} 到手了！`, ms: 1400 });
      this.audio?.play('paper');
    } else {
      this.game.stamina = Math.max(0, this.game.stamina - 20);
      this.events.emit('noise', { pos: { x: s.x, z: s.z }, radius: 12, rage: 3 });
      this.events.emit('toast', { text: '箱子里是恶作剧！！体力-20', ms: 1600 });
      this.audio?.play('slap');
    }
  }

  _clearRedZone() {
    if (this._redZone) {
      this.scene.group.remove(this._redZone.mesh);
      this._redZone = null;
    }
  }

  _clearSupplyDrop() {
    if (this.game.supplyDrop) {
      this.scene.group.remove(this.game.supplyDrop.mesh);
      this.game.supplyDrop = null;
    }
  }

  _startHunt() {
    this.game.huntDone = true;
    this.game.huntActive = true;
    this.game.huntUntil = nowSec() + 8;
    this.events.emit('hunt.start');
    this.audio?.play('heartbeat');
    this.events.emit('toast', { text: '猎杀时刻！！活过 8 秒！', ms: 2200 });
    this.events.emit('camera.shake', { amount: 0.35 });
  }
}
