import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.js';
import { ITEM_DEFS } from '../config/items.js';
import { distance2D, nowSec, rand } from '../core/Utils.js';

const EVENTS = ['blackout', 'red_zone', 'desk_rampage', 'supply_drop', 'tape_revival', 'mimic'];

export class RandomEventSystem {
  constructor({ scene, events, game, ghost, player, rage, audio, items }) {
    this.scene = scene;
    this.events = events;
    this.game = game;
    this.ghost = ghost;
    this.player = player;
    this.rage = rage;
    this.audio = audio;
    this.items = items;
    this._blackoutPending = false;
    this._redZone = null;
    this._supplyTimer = 0;
    events.on('pun.horse', pos => this._triggerHorse(pos));
    events.on('env.chain', pos => this._triggerChain(pos));
  }

  reset() {
    this.game.randomEvents = this._rollEvents();
    this.game.nextEventAt = nowSec() + 22;
    this.game.huntActive = false;
    this.game.huntUntil = 0;
    this.game.huntDone = false;
    this.game.desperate = false;
    this.game.rebelItem = Math.random() < 0.6
      ? ['pen', 'glue', 'tape', 'crossbow', 'mine'][Math.floor(Math.random() * 5)]
      : null;
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

    if (!this.game.desperate && this.game.lives <= 1 && this.game.rage >= 95) {
      this.game.desperate = true;
      this.events.emit('act.card', {
        title: '绝境演出！！',
        line: '最后机会：鞭子火力全开，拼刀窗口变宽！'
      });
      this.audio?.play('heartbeat');
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
      return;
    }
    if (type === 'tape_revival') {
      const trap = this.items?.zones.find(z => z.type === 'trap');
      if (trap) {
        const c = this.scene.L.classroom;
        trap.pos.x = rand(c.minX + 2, c.maxX - 2);
        trap.pos.z = rand(c.minZ + 2, c.maxZ - 2);
        trap.mesh.position.set(trap.pos.x, 0.02, trap.pos.z);
        this.events.emit('toast', { text: '修正带活过来了！！自己挪走了！', ms: 1800 });
      } else {
        const c = this.scene.L.classroom;
        const x = rand(c.minX + 2, c.maxX - 2);
        const z = rand(c.minZ + 2, c.maxZ - 2);
        this.items?.zones.push({
          type: 'trap',
          mesh: null,
          pos: { x, z },
          radius: 0.9,
          until: nowSec() + 60,
          used: false
        });
        this.events.emit('toast', { text: '修正带自己画了一道陷阱线！', ms: 1800 });
      }
      this.audio?.play('splat');
      return;
    }
    if (type === 'mimic') {
      const action = this.game.lastPlayerAction;
      const stage = this.game.currentStage();
      if (action === 'whip') {
        this.ghost._startCharge(this.player.getPos(), stage);
        this.events.emit('toast', { text: '它学你挥鞭，反而撞过来了！！', ms: 1800 });
      } else if (action === 'hide') {
        this.events.emit('toast', { text: '它学你躲进柜子，然后重重关上门！！', ms: 1800 });
        this.events.emit('camera.shake', { amount: 0.45 });
        this.rage.add(6, 'mimic');
      } else {
        this.ghost._startCharge(this.player.getPos(), stage);
        this.events.emit('toast', { text: '它学会了你的走位，直接冲了过来！！', ms: 1800 });
      }
      this.audio?.play('ghost');
    }
  }

  _triggerHorse(pos) {
    this.scene.spawnHorse(pos);
    this.events.emit('toast', { text: '鱼缸里的海马……变成陆地马了！！', ms: 2400 });
    this.events.emit('danmaku.burst');
    this.audio?.play('bleat');
    const gp = this.ghost.getPos();
    const dx = gp.x - pos.x;
    const dz = gp.z - pos.z;
    const len = Math.hypot(dx, dz) || 1;
    if (len < 6) {
      this.ghost.knockback((dx / len) * 10, (dz / len) * 10, 0.5);
      this.rage.addDrama(12, 'horse');
      this.events.emit('toast', { text: '陆地马把鬼撞飞了！！', ms: 1800 });
    }
  }

  _triggerChain(pos) {
    this.scene.spawnParticles(pos, '#ffb86b');
    this.scene.spawnHitRing(pos, '#ffb86b');
    this.events.emit('camera.shake', { amount: 0.25 });
    this.audio?.play('hit');
    const gp = this.ghost.getPos();
    const dist = distance2D(gp.x, gp.z, pos.x, pos.z);
    if (dist < 5) {
      const dx = gp.x - pos.x;
      const dz = gp.z - pos.z;
      const len = Math.hypot(dx, dz) || 1;
      this.ghost.knockback((dx / len) * 7, (dz / len) * 7, 0.35);
      this.rage.addDrama(8, 'chain');
      this.events.emit('toast', { text: '环境连锁反应！！鬼被绊了一下！', ms: 1600 });
      this.events.emit('danmaku', { text: '连锁反应哈哈哈' });
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
