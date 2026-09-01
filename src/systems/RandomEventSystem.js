import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.js';
import { ITEM_DEFS } from '../config/items.js';
import { makeTrapMesh, textTexture } from '../core/PlaceholderAssets.js';
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
    this.game.bellPhaseActive = false;
    this.game.bellPhaseUntil = 0;
    this.game.bellCircle = null;
    this.game.bellCharge = 0;
    this.game.bellPhaseIndex = 0;
    this.game.rebelItem = Math.random() < 0.6
      ? ['pen', 'glue', 'tape', 'crossbow', 'mine'][Math.floor(Math.random() * 5)]
      : null;
    this.game.ghostSpeedBoostUntil = 0;
    this.game.deskRampageUntil = 0;
    this._clearRedZone();
    this._clearSupplyDrop();
    this._blackoutPending = false;
    this.events.emit('hunt.end');
    this.events.emit('bell.end');
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

    if (
      !this.game.bellPhaseActive &&
      this.game.bellPhaseIndex < GAME_CONFIG.bellPhaseTimes.length &&
      nowSec() - this.game.runStart >= GAME_CONFIG.bellPhaseTimes[this.game.bellPhaseIndex]
    ) {
      this._startBellPhase();
    }
    if (this.game.bellPhaseActive) {
      this._updateBellPhase(dt);
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
      this.events.emit('act.card', { title: '怪谈事件 · 停电', line: '灯灭了，它换了位置！' });
      this.events.emit('beat.flash', { color: '#11141a' });
      const p = this.player.getPos();
      if (this.player.pawn?.body) {
        this.player.pawn.body.velocity.set(rand(-4, 4), 2, rand(-4, 4));
      }
      this.audio?.play('heartbeat');
      this.events.emit('toast', { text: '啪——停电了！！', ms: 1600 });
      return;
    }
    if (type === 'red_zone') {
      const c = this.scene.L.classroom;
      const x = rand(c.minX + 6.5, c.maxX - 6.5);
      const z = rand(c.minZ + 6.5, c.maxZ - 6.5);
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(6.3, 6.6, 48),
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
      this._redZone = { x, z, r: 6.4, until: nowSec() + 8, mesh, toasted: false };
      this.events.emit('act.card', { title: '怪谈事件 · 禁区红线', line: '红线内体力狂掉！' });
      this.events.emit('beat.flash', { color: '#ff4d4d' });
      const p = this.player.getPos();
      if (distance2D(p.x, p.z, x, z) < this._redZone.r) {
        const dx = p.x - x;
        const dz = p.z - z;
        const len = Math.hypot(dx, dz) || 1;
        this.player.pawn?.body?.velocity.set((dx / len) * 9, 3, (dz / len) * 9);
      }
      this.events.emit('toast', { text: '禁区红线出现了！！', ms: 1600 });
      this.audio?.play('chalk');
      return;
    }
    if (type === 'desk_rampage') {
      this.game.deskRampageUntil = nowSec() + 6;
      this.game.ghostSpeedBoostUntil = nowSec() + 6;
      this.scene.slideRandomDesk?.();
      this.events.emit('act.card', { title: '怪谈事件 · 桌椅暴走', line: '路线变了，鬼也快了！' });
      this.events.emit('beat.flash', { color: '#f4a261' });
      const p = this.player.getPos();
      const dx = p.x;
      const dz = p.z;
      const len = Math.hypot(dx, dz) || 1;
      this.player.pawn?.body?.velocity.set((dx / len) * 12, 5, (dz / len) * 12);
      this.game.stamina = Math.max(0, this.game.stamina - 15);
      this.game.playerStunUntil = Math.max(this.game.playerStunUntil, nowSec() + 0.5);
      this.events.emit('hitstop', { ms: 70 });
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
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 6, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.45 })
      );
      beam.position.set(x, 3, z);
      this.scene.group.add(beam);
      const marker = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: textTexture('补给', {
            bg: '#4a3b12',
            fg: '#ffd166',
            font: 'bold 60px "Microsoft YaHei", sans-serif',
            width: 256,
            height: 128,
            lineHeight: 64,
            pad: 8
          }),
          transparent: true,
          depthWrite: false
        })
      );
      marker.position.set(x, 4.4, z);
      marker.scale.set(0.8, 0.4, 1);
      this.scene.group.add(marker);
      this.game.supplyDrop = { x, z, id, until: nowSec() + 12, mesh, beam, marker };
      this.events.emit('act.card', { title: '怪谈事件 · 主管空投', line: '补给来了，也可能是陷阱！' });
      this.events.emit('beat.flash', { color: '#ffd166' });
      this.events.emit('toast', { text: '主管空投了一个补给箱！', ms: 1600 });
      this.audio?.play('gate');
      return;
    }
    if (type === 'tape_revival') {
      const trap = this.items?.zones.find(z => z.type === 'trap');
      if (trap) {
        const c = this.scene.L.classroom;
        const oldX = trap.pos.x;
        const oldZ = trap.pos.z;
        let nx = oldX;
        let nz = oldZ;
        for (let i = 0; i < 8; i++) {
          nx = rand(c.minX + 2, c.maxX - 2);
          nz = rand(c.minZ + 2, c.maxZ - 2);
          if (Math.hypot(nx - oldX, nz - oldZ) > 5) break;
        }
        trap.pos.x = nx;
        trap.pos.z = nz;
        trap.mesh.position.set(trap.pos.x, 0.02, trap.pos.z);
        this.scene.spawnSlashTrail(
          { x: oldX, y: 0, z: oldZ },
          { x: nx, y: 0, z: nz },
          '#f4d35e',
          0.9
        );
        this.scene.spawnParticles({ x: trap.pos.x, y: 0.5, z: trap.pos.z }, '#f4d35e');
        this.events.emit('toast', { text: '修正带活过来了！！自己滚远了！', ms: 2200 });
      } else {
        const c = this.scene.L.classroom;
        const x = rand(c.minX + 2, c.maxX - 2);
        const z = rand(c.minZ + 2, c.maxZ - 2);
        const mesh = makeTrapMesh();
        mesh.position.set(x, 0.02, z);
        this.scene.group.add(mesh);
        this.scene.spawnParticles({ x, y: 0.5, z }, '#f4d35e');
        this.items?.zones.push({
          type: 'trap',
          mesh,
          pos: { x, z },
          radius: 0.9,
          until: nowSec() + 60,
          used: false
        });
        this.events.emit('toast', { text: '修正带自己滚过全场，画了一道陷阱线！', ms: 2200 });
      }
      this.events.emit('act.card', { title: '怪谈事件 · 修正带复活', line: '它自己动了！' });
      this.events.emit('beat.flash', { color: '#f4d35e' });
      this.audio?.play('splat');
      return;
    }
    if (type === 'mimic') {
      const action = this.game.lastPlayerAction;
      const stage = this.game.currentStage();
      if (action === 'whip') {
        this.ghost._startCharge(this.player.getPos(), stage);
        this.events.emit('beat.flash', { color: '#ff6b6b' });
        this.events.emit('toast', { text: '它学你挥鞭，反而撞过来了！！', ms: 1800 });
      } else if (action === 'hide') {
        this.events.emit('toast', { text: '它学你躲进柜子，然后重重关上门！！', ms: 1800 });
        this.events.emit('camera.shake', { amount: 0.45 });
        this.rage.add(6, 'mimic');
      } else {
        this.ghost._startCharge(this.player.getPos(), stage);
        this.events.emit('beat.flash', { color: '#ff6b6b' });
        this.events.emit('toast', { text: '它学会了你的走位，直接冲了过来！！', ms: 1800 });
      }
      this.events.emit('act.card', { title: '怪谈事件 · 鬼学你操作', line: '它记住了你的动作！' });
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
      if (this.game.supplyDrop.beam) this.scene.group.remove(this.game.supplyDrop.beam);
      if (this.game.supplyDrop.marker) this.scene.group.remove(this.game.supplyDrop.marker);
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

  _startBellPhase() {
    this.game.bellPhaseActive = true;
    this.game.bellPhaseUntil = nowSec() + GAME_CONFIG.bellPhaseDuration;
    this.game.bellCharge = 0;
    const c = this.scene.L.classroom;
    const x = rand(c.minX + 2, c.maxX - 2);
    const z = rand(c.minZ + 2, c.maxZ - 2);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(GAME_CONFIG.bellCircleRadius - 0.2, GAME_CONFIG.bellCircleRadius, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    this.scene.group.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.35 })
    );
    beam.position.set(x, 4, z);
    this.scene.group.add(beam);
    this.game.bellCircle = { x, z, ring, beam };
    this.events.emit('bell.start');
    this.events.emit('act.card', {
      title: '下课铃响了！！',
      line: '值日点出现：站进去 2 秒拉响铃声，能反制它！'
    });
    this.events.emit('beat.flash', { color: '#4cc9f0' });
    this.audio?.play('phone');
  }

  _updateBellPhase(dt) {
    if (nowSec() >= this.game.bellPhaseUntil) {
      this._endBellPhase(false);
      return;
    }
    const circle = this.game.bellCircle;
    if (!circle) return;
    const p = this.player.getPos();
    if (distance2D(p.x, p.z, circle.x, circle.z) < GAME_CONFIG.bellCircleRadius) {
      this.game.bellCharge += dt;
      if (this.game.bellCharge >= GAME_CONFIG.bellChargeTime) {
        this._completeBell(circle);
      }
    } else {
      this.game.bellCharge = 0;
    }
  }

  _completeBell(circle) {
    this.ghost.stunnedUntil = nowSec() + 4;
    this.rage.reduce(20, 'bell');
    this.rage.addDrama(20, 'bell');
    this.events.emit('hitstop', { ms: 120 });
    this.events.emit('slowmo', { ms: 300 });
    this.events.emit('camera.shake', { amount: 0.55 });
    this.events.emit('danmaku.burst');
    this.scene.spawnParticles({ x: circle.x, y: 1, z: circle.z }, '#ffd166');
    this.events.emit('toast', { text: '值日铃响了！！鬼被震晕！', ms: 2000 });
    this._endBellPhase(true);
  }

  _endBellPhase(used) {
    this.game.bellPhaseActive = false;
    const circle = this.game.bellCircle;
    if (circle) {
      this.scene.group.remove(circle.ring);
      this.scene.group.remove(circle.beam);
    }
    this.game.bellCircle = null;
    this.game.bellCharge = 0;
    this.game.bellPhaseIndex += 1;
    this.events.emit('bell.end');
    if (!used) {
      this.events.emit('toast', { text: '值日点消失了，危机回落。', ms: 1400 });
    }
  }
}
