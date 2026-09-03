import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.js';
import { ITEM_DEFS } from '../config/items.js';
import { makeTrapMesh, textTexture } from '../core/PlaceholderAssets.js';
import { distance2D, nowSec, rand } from '../core/Utils.js';

const EVENTS = ['blackout', 'red_zone', 'desk_rampage', 'supply_drop', 'tape_revival', 'mimic'];

export class RandomEventSystem {
  constructor({ scene, events, game, ghost, player, rage, audio, items, economy }) {
    this.scene = scene;
    this.events = events;
    this.game = game;
    this.ghost = ghost;
    this.player = player;
    this.rage = rage;
    this.audio = audio;
    this.items = items;
    this.economy = economy;
    this._blackoutPending = false;
    this._redZone = null;
    this._supplyTimer = 0;
    this._artifactTempts = [];
    this._artifactTemptTimer = 0;
    this._artifactRingPulseAt = 0;
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
    if (this.game.artifactActive || this.game.artifactCircle || this.game.artifactLockoutZones?.length || this.game.artifactClearance?.length) {
      this._clearArtifactPhase();
    }
    this.game.artifactActive = false;
    this.game.artifactUntil = 0;
    this.game.artifactCircle = null;
    this.game.artifactDefendTime = 0;
    this.game.artifactDefendUntil = 0;
    this.game.artifactStage = 0;
    this.game.artifactStageUntil = 0;
    this.game.artifactGhostGrabAt = 0;
    this.game.artifactSecured = false;
    this.game.artifactPenalty = false;
    this.game.artifactGhostBoostUntil = 0;
    this.game.artifactPhaseIndex = 0;
    this.game.artifactPending = null;
    this._artifactTempts.forEach(t => this.scene.group.remove(t.mesh));
    this._artifactTempts = [];
    this._artifactRingPulseAt = 0;
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
    if (this.game.detentionMode) return;
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

    if (
      !this.game.artifactActive &&
      !this.game.bellPhaseActive &&
      this.game.artifactPhaseIndex < GAME_CONFIG.artifactPhaseTimes.length &&
      nowSec() - this.game.runStart >= GAME_CONFIG.artifactPhaseTimes[this.game.artifactPhaseIndex]
    ) {
      this._startArtifactPhase();
    }
    if (this.game.artifactActive) {
      this._updateArtifactPhase(dt);
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
  _startArtifactPhase() {
    this.game.artifactActive = true;
    this.game.artifactStage = 0;
    this.game.artifactStageUntil = nowSec() + GAME_CONFIG.artifactBroadcastDuration;
    this.game.artifactDefendTime = 0;
    this.game.artifactSecured = false;
    this.game.artifactPenalty = false;
    this._artifactTemptTimer = 0;
    this.events.emit('artifact.start');
    this.events.emit('artifact.stage', { stage: 0 });
    this.events.emit('act.card', {
      title: '全场广播！！百元店直播促销开始！',
      line: '警戒封锁落下，老板说要搞个大场面！'
    });
    this.events.emit('beat.flash', { color: '#e63946' });
    this.audio?.play('phone');
    this.audio?.play('shake');
    this.events.emit('camera.shake', { amount: 0.3 });
    this.game.artifactPending = this._pickTreasureSpot();
    this._spawnArtifactLockouts();
  }

  _spawnArtifactLockouts() {
    const pending = this.game.artifactPending || this._pickTreasureSpot();
    this.game.artifactPending = pending;
    const c = this.scene.L.classroom;
    const co = this.scene.L.corridor;
    const corners = [
      { x: c.minX, z: c.minZ },
      { x: c.maxX, z: c.minZ },
      { x: c.minX, z: c.maxZ },
      { x: c.maxX, z: c.maxZ },
      { x: co.minX, z: co.maxZ },
      { x: co.maxX, z: co.maxZ },
      { x: co.minX, z: co.minZ },
      { x: co.maxX, z: co.minZ }
    ];
    let coverRadius = 8;
    for (const p of corners) {
      coverRadius = Math.max(coverRadius, distance2D(p.x, p.z, pending.x, pending.z) + 3);
    }
    const startRadius = Math.max(GAME_CONFIG.artifactRingStartRadius, coverRadius);
    const group = new THREE.Group();
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xff4d4d,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const boundaryMat = new THREE.MeshBasicMaterial({
      color: 0xff6b6b,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const wallMat = new THREE.MeshBasicMaterial({
      color: 0xff4d4d,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const outer = new THREE.Mesh(new THREE.RingGeometry(1, 70, 72), outerMat);
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = 0.03;
    group.add(outer);
    const boundary = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.08, 72), boundaryMat);
    boundary.rotation.x = -Math.PI / 2;
    boundary.position.y = 0.06;
    group.add(boundary);
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 2.6, 64, 1, true),
      wallMat
    );
    wall.position.y = 1.3;
    group.add(wall);
    group.position.set(pending.x, 0, pending.z);
    this.scene.group.add(group);
    const zone = {
      type: 'ring',
      x: pending.x,
      z: pending.z,
      group,
      outer,
      boundary,
      wall,
      startAt: nowSec(),
      dangerAt: nowSec() + 2,
      startRadius,
      endRadius: GAME_CONFIG.artifactRingEndRadius,
      radius: GAME_CONFIG.artifactRingStartRadius,
      pushed: false
    };
    this.game.artifactLockoutZones = [zone];
    this._setArtifactRingRadius(zone, startRadius);
    this.events.emit('toast', {
      text: '红幕警戒区出现：会向镇店之宝方向收缩！',
      ms: 2400
    });
  }

  _setArtifactRingRadius(zone, radius) {
    zone.radius = Math.max(0.5, radius);
    zone.outer.scale.set(zone.radius, zone.radius, 1);
    zone.boundary.scale.set(zone.radius, zone.radius, 1);
    zone.wall.scale.set(zone.radius, zone.radius, 1);
  }

  _pickTreasureSpot() {
    const c = this.scene.L.classroom;
    for (let i = 0; i < 30; i++) {
      const x = rand(c.minX + 5, c.maxX - 5);
      const z = rand(c.minZ + 3.5, c.maxZ - 3.5);
      if (!this._insideLockout(x, z)) return { x, z };
    }
    return { x: rand(c.minX + 4, c.maxX - 4), z: rand(c.minZ + 3, c.maxZ - 3) };
  }

  _insideLockout(x, z) {
    const zone = (this.game.artifactLockoutZones || [])[0];
    if (zone && zone.type === 'ring') {
      return distance2D(x, z, zone.x, zone.z) > zone.radius + 0.2;
    }
    return false;
  }

  _startArtifactClearance() {
    this.game.artifactStage = 1;
    this.game.artifactStageUntil = nowSec() + GAME_CONFIG.artifactClearanceDuration;
    this.game.artifactClearance = [];
    this.events.emit('artifact.stage', { stage: 1 });
    this.events.emit('act.card', {
      title: '警戒落下 · 限时清仓！！',
      line: '红区别踩，满地道具随便抢，抢完等镇店之宝！'
    });
    this.events.emit('beat.flash', { color: '#8ef0c8' });
    this.audio?.play('gate');
    this._spawnClearanceItems();
  }

  _spawnClearanceItems() {
    const count = GAME_CONFIG.artifactClearanceCount || 8;
    const ids = ['pen', 'glue', 'tape', 'mine', 'crossbow', 'coffee', 'battery'];
    for (let i = 0; i < count; i++) {
      const id = ids[Math.floor(Math.random() * ids.length)];
      const spot = this._pickClearanceSpot(id);
      const color = id === 'coffee' ? '#b76e2a' : id === 'battery' ? '#5ad1ff' : '#ffd166';
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.34, 0.34),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
      );
      mesh.position.y = 0.25;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 6, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42 })
      );
      beam.position.y = 3;
      const group = new THREE.Group();
      group.add(mesh);
      group.add(beam);
      group.position.set(spot.x, 0, spot.z);
      this.scene.group.add(group);
      const label = this._makeLabel(ITEM_DEFS[id]?.name || (id === 'coffee' ? '特浓咖啡' : '移动电源'), color);
      label.position.y = 1.0;
      group.add(label);
      this.game.artifactClearance.push({ id, x: spot.x, z: spot.z, group, until: nowSec() + GAME_CONFIG.artifactClearanceDuration + 2, phase: 1 });
    }
  }

  _pickClearanceSpot(id) {
    const c = this.scene.L.classroom;
    const minX = c.minX + 2.4;
    const maxX = c.maxX - 2.4;
    const minZ = c.minZ + 2.4;
    const maxZ = c.maxZ - 2.4;
    for (let i = 0; i < 35; i++) {
      const x = rand(minX, maxX);
      const z = rand(minZ, maxZ);
      if (this._insideLockout(x, z)) continue;
      if (this.game.artifactPending && distance2D(x, z, this.game.artifactPending.x, this.game.artifactPending.z) < GAME_CONFIG.artifactCircleRadius + 1) continue;
      if (this._nearClutter(x, z)) continue;
      return { x, z };
    }
    return { x: rand(c.minX + 3, c.maxX - 3), z: rand(c.minZ + 2, c.maxZ - 2) };
  }

  _nearClutter(x, z) {
    const p = this.scene.refs?.props || [];
    for (const prop of p) {
      if (!prop || typeof prop.pos?.x !== 'number') continue;
      if (distance2D(x, z, prop.pos.x, prop.pos.z) < 1.4) return true;
    }
    const desks = this.scene.refs?.desks || [];
    for (const desk of desks) {
      const bx = desk?.base?.x ?? desk?.body?.position?.x;
      const bz = desk?.base?.z ?? desk?.body?.position?.z;
      if (typeof bx === 'number' && distance2D(x, z, bx, bz) < 1.3) return true;
    }
    const platform = this.scene.refs?.platform;
    if (platform && distance2D(x, z, platform.x, platform.z) < 2.2) return true;
    return false;
  }

  _makeLabel(text, color = '#ffd166') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(25,20,10,0.88)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    ctx.fillStyle = '#fff3d1';
    ctx.font = 'bold 38px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(text).slice(0, 6), canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
    );
    sprite.scale.set(1.35, 0.5, 1);
    return sprite;
  }

  _updateClearancePickup() {
    const p = this.player.getPos();
    const list = this.game.artifactClearance || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i];
      if (!item) {
        list.splice(i, 1);
        continue;
      }
      item.group.rotation.y += 0.035;
      item.group.position.y = Math.sin(nowSec() * 2.4 + i) * 0.06;
      const d = distance2D(p.x, p.z, item.x, item.z);
      if (d < 1.05) {
        this._applyClearanceReward(item.id, item.x, item.z);
        this.scene.group.remove(item.group);
        list.splice(i, 1);
        continue;
      }
      if (nowSec() >= item.until) {
        this.scene.group.remove(item.group);
        list.splice(i, 1);
      }
    }
  }

  _applyClearanceReward(id, x, z) {
    if (id === 'coffee') {
      this.game.stamina = this.game.staminaMax;
      this.events.emit('toast', { text: '特浓咖啡到手！体力直接拉满！', ms: 1500 });
      this.audio?.play('paper');
      return;
    }
    if (id === 'battery') {
      this.game.battery = this.game.batteryMax;
      this.events.emit('toast', { text: '移动电源到手！手机满电！', ms: 1500 });
      this.audio?.play('paper');
      return;
    }
    this.game.addItem(id, 1);
    this.events.emit('item.picked');
    this.events.emit('toast', { text: `清仓特价：${ITEM_DEFS[id]?.name || id} 到手！`, ms: 1400 });
    this.audio?.play('paper');
    this.events.emit('noise', { pos: { x, z }, radius: 13, rage: 2 });
    this.scene.spawnParticles({ x, y: 0.4, z }, '#ffd166');
    this.scene.spawnHitRing({ x, y: 0.3, z }, '#ffd166');
  }

  _startArtifactDefense() {
    for (const zone of this.game.artifactLockoutZones || []) {
      if (zone.group) this.scene.group.remove(zone.group);
    }
    this.game.artifactLockoutZones = [];
    this.game.artifactStage = 2;
    this.game.artifactStageUntil = 0;
    this.game.artifactGhostGrabAt = 0;
    this.game.artifactUntil = nowSec() + GAME_CONFIG.artifactDefendGrace + GAME_CONFIG.artifactDefendDuration;
    this.game.artifactDefendTime = 0;
    this.game.artifactDefendUntil = nowSec() + GAME_CONFIG.artifactDefendGrace;
    const { x, z } = this.game.artifactPending;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(GAME_CONFIG.artifactCircleRadius - 0.35, GAME_CONFIG.artifactCircleRadius, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.06, z);
    this.scene.group.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.5 })
    );
    beam.position.set(x, 6, z);
    this.scene.group.add(beam);
    const progress = [];
    for (let i = 0; i < 24; i++) {
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.03, 0.42),
        new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.2, depthWrite: false })
      );
      const ang = (i / 24) * Math.PI * 2;
      seg.position.set(x + Math.cos(ang) * (GAME_CONFIG.artifactCircleRadius - 0.7), 0.14, z + Math.sin(ang) * (GAME_CONFIG.artifactCircleRadius - 0.7));
      seg.rotation.y = -ang;
      this.scene.group.add(seg);
      progress.push(seg);
    }
    const treasure = this._createTreasureVisual(x, z);
    this.scene.group.add(treasure);
    this.game.artifactCircle = { x, z, ring, beam, treasure, progress };
    this.events.emit('artifact.stage', { stage: 2 });
    this.events.emit('act.card', {
      title: '镇店之宝现形！！',
      line: `守 ${GAME_CONFIG.artifactDefendDuration} 秒！鬼拿到就完蛋！`
    });
    this.events.emit('beat.flash', { color: '#ffd700' });
    this.audio?.play('gate');
    this.audio?.play('ghost');
  }

  _createTreasureVisual(x, z) {
    const group = new THREE.Group();
    const spin = new THREE.Group();
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x6b4a00, emissiveIntensity: 0.35 });
    const goldMat2 = new THREE.MeshStandardMaterial({ color: 0xffb703 });
    const pad = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 1.5), new THREE.MeshStandardMaterial({ color: 0x8a6d3b }));
    pad.position.y = 0.09;
    group.add(pad);
    const towerBase = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), goldMat);
    towerBase.position.y = 0.4;
    spin.add(towerBase);
    const towerMid = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.6), goldMat);
    towerMid.position.y = 0.82;
    spin.add(towerMid);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.45, 8), goldMat2);
    crown.position.y = 1.2;
    spin.add(crown);
    for (let i = 0; i < 5; i++) {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 12), goldMat2);
      coin.position.set(0.55 - i * 0.25, 0.22, 0.45);
      coin.rotation.x = Math.PI / 2;
      spin.add(coin);
    }
    const label = this._makeLabel('镇店之宝', '#ffd700');
    label.position.set(0, 1.75, 0);
    spin.add(label);
    group.add(spin);
    group.position.set(x, 0, z);
    group.userData.spin = spin;
    return group;
  }

  _updateArtifactPhase(dt) {
    if (this.game.artifactStage === 0) {
      if (nowSec() >= this.game.artifactStageUntil) {
        this._startArtifactClearance();
      }
      this._updateLockoutZones(dt);
      return;
    }
    if (this.game.artifactStage === 1) {
      if (nowSec() >= this.game.artifactStageUntil) {
        this._startArtifactDefense();
      }
      this._updateLockoutZones(dt);
      this._updateClearancePickup();
      return;
    }
    const circle = this.game.artifactCircle;
    if (!circle) return;
    if (this.game.artifactDefendTime >= GAME_CONFIG.artifactDefendDuration) {
      this._secureArtifact();
      return;
    }
    const p = this.player.getPos();
    const inCircle = distance2D(p.x, p.z, circle.x, circle.z) < GAME_CONFIG.artifactCircleRadius;
    const defending = nowSec() >= this.game.artifactDefendUntil;
    if (defending && inCircle) {
      this.game.artifactDefendTime += dt;
    } else if (!inCircle) {
      this.game.artifactDefendTime = Math.max(0, this.game.artifactDefendTime - dt * 0.5);
    }
    const touching = this.ghost.canTouchPoint(
      circle.x,
      circle.z,
      GAME_CONFIG.artifactGrabRadius
    );
    const grabbing = this.game.artifactGhostGrabAt > 0;
    if (grabbing && touching && nowSec() - this.game.artifactGhostGrabAt >= GAME_CONFIG.artifactGrabDuration) {
      this._ghostGotArtifact();
      return;
    }
    if (nowSec() >= this.game.artifactUntil) {
      this._artifactTimeout(circle);
      return;
    }
    if (grabbing && !touching) {
      this.game.artifactGhostGrabAt = 0;
      this.events.emit('toast', { text: '抢宝被打断了！它没来得及举起来！', ms: 1800 });
      this.events.emit('danmaku', { text: '抢宝中断！！守住了！' });
      this.audio?.play('whoosh');
    } else if (!grabbing && touching) {
      this.game.artifactGhostGrabAt = nowSec();
      this.events.emit('toast', {
        text: '鬼抓住了镇店之宝！！快打断它的举宝动作！',
        ms: 2200
      });
      this.events.emit('camera.shake', { amount: 0.4 });
      this.audio?.play('ghost');
    }
    if (grabbing && this.game.artifactGhostGrabAt > 0 && Math.random() < dt * 10) {
      this.scene.spawnParticles(
        { x: circle.x + rand(-0.5, 0.5), y: 1.2, z: circle.z + rand(-0.5, 0.5) },
        '#ff4d6d'
      );
    }
    this._animateTreasure(circle, dt);
    if (this._artifactTemptTimer > 0) {
      this._artifactTemptTimer -= dt;
    } else {
      this._artifactTemptTimer = GAME_CONFIG.artifactTemptInterval;
      if (this._artifactTempts.length < 2) this._spawnArtifactTempt(circle);
    }
    for (let i = this._artifactTempts.length - 1; i >= 0; i--) {
      const t = this._artifactTempts[i];
      t.mesh.rotation.y += dt * 3;
      if (nowSec() >= t.until || distance2D(p.x, p.z, t.x, t.z) < 1.15) {
        if (distance2D(p.x, p.z, t.x, t.z) < 1.15) {
          this._applyClearanceReward(t.id, t.x, t.z);
        }
        this.scene.group.remove(t.mesh);
        this._artifactTempts.splice(i, 1);
      }
    }
  }

  _animateTreasure(circle, dt = 0.016) {
    if (!circle.treasure) return;
    const spin = circle.treasure.userData.spin;
    const grabAt = this.game.artifactGhostGrabAt;
    if (spin) {
      spin.rotation.y += 0.018;
      if (grabAt > 0) {
        const t = Math.min(1, (nowSec() - grabAt) / GAME_CONFIG.artifactGrabDuration);
        spin.rotation.y += dt * 3.5;
        spin.position.y = Math.sin(nowSec() * 3) * 0.06 + t * 0.2;
        circle.treasure.position.y = Math.min(1.6, t * 1.7);
      } else {
        spin.position.y = Math.sin(nowSec() * 1.7) * 0.08;
        circle.treasure.position.y = Math.max(0, circle.treasure.position.y - dt * 2.2);
      }
    }
    if (!circle.progress) return;
    const t = Math.min(1, this.game.artifactDefendTime / GAME_CONFIG.artifactDefendDuration);
    circle.progress.forEach((seg, i) => {
      seg.material.opacity = i / 24 < t ? 0.95 : 0.18;
    });
  }

  _updateLockoutZones(dt) {
    const p = this.player.getPos();
    const zone = (this.game.artifactLockoutZones || [])[0];
    if (!zone || zone.type !== 'ring') return;
    const total = GAME_CONFIG.artifactShrinkDuration;
    const t = Math.min(1, Math.max(0, (nowSec() - zone.startAt) / total));
    const nextRadius = zone.startRadius + (zone.endRadius - zone.startRadius) * t;
    this._setArtifactRingRadius(zone, nextRadius);
    const danger = nowSec() >= zone.dangerAt;
    const pulse = 0.5 + Math.sin(nowSec() * (danger ? 2.4 : 8)) * 0.2;
    zone.outer.material.opacity = 0.12 + (1 - t) * 0.05;
    zone.boundary.material.opacity = 0.7 + pulse * 0.2;
    zone.wall.material.opacity = 0.18 + pulse * 0.15;
    const distToCenter = distance2D(p.x, p.z, zone.x, zone.z);
    if (!danger || distToCenter <= zone.radius + 0.2) return;
    if (nowSec() >= this._artifactRingPulseAt) {
      this._artifactRingPulseAt = nowSec() + 1.2;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        this.scene.spawnParticles(
          {
            x: zone.x + Math.cos(a) * zone.radius,
            y: 0.4,
            z: zone.z + Math.sin(a) * zone.radius
          },
          '#ff6b6b'
        );
      }
    }
    this.game.stamina = Math.max(0, this.game.stamina - GAME_CONFIG.artifactLockoutDrain * dt);
    if (this.game.stamina <= 0 && !zone.pushed) {
      zone.pushed = true;
      const dist = Math.max(0.2, distToCenter);
      const dirX = (zone.x - p.x) / dist;
      const dirZ = (zone.z - p.z) / dist;
      this.player.pawn.body.velocity.set(dirX * 9, 2.5, dirZ * 9);
      this.game.playerStunUntil = nowSec() + 0.5;
      this.events.emit('camera.shake', { amount: 0.3 });
      this.events.emit('toast', { text: '红幕收圈！你被推向镇店之宝的位置！', ms: 1800 });
      this.audio?.play('slap');
    }
  }

  _spawnArtifactTempt(circle) {
    const c = this.scene.L.classroom;
    for (let i = 0; i < 20; i++) {
      const x = rand(c.minX + 2, c.maxX - 2);
      const z = rand(c.minZ + 2, c.maxZ - 2);
      if (distance2D(x, z, circle.x, circle.z) < GAME_CONFIG.artifactCircleRadius + 1) continue;
      const id = ['pen', 'glue', 'tape', 'mine'][Math.floor(Math.random() * 4)];
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.3),
        new THREE.MeshBasicMaterial({ color: 0x8ef0c8, transparent: true, opacity: 0.95 })
      );
      mesh.position.set(x, 0.32, z);
      this.scene.group.add(mesh);
      this._artifactTempts.push({ x, z, id, mesh, until: nowSec() + 7 });
      return;
    }
  }

  _secureArtifact() {
    this.game.artifactSecured = true;
    this.events.emit('artifact.secure');
    this.rage.addDrama(25, 'artifact');
    this.game.speedBoostUntil = nowSec() + 5;
    if (this.economy) {
      this.economy.state.relics += 1;
      this.economy.state.points += 800;
      this.economy.save();
    }
    this.events.emit('hitstop', { ms: 140 });
    this.events.emit('slowmo', { ms: 450 });
    this.events.emit('camera.shake', { amount: 0.6 });
    this.events.emit('danmaku.burst');
    this.events.emit('act.card', {
      title: '守卫成功！！镇店之宝到手！',
      line: '纪念品+1 · 积分+800 · 守卫奖金！'
    });
    this._clearArtifactPhase();
  }

  _artifactTimeout(circle) {
    const grabAt = this.game.artifactGhostGrabAt;
    if (
      grabAt > 0 &&
      nowSec() - grabAt >= GAME_CONFIG.artifactGrabDuration &&
      this.ghost.canTouchPoint(circle.x, circle.z, GAME_CONFIG.artifactGrabRadius)
    ) {
      this._ghostGotArtifact();
      return;
    }
    this.events.emit('act.card', {
      title: '守卫超时！镇店之宝被主管收回！',
      line: '鬼没摸到宝贝，你也守漏了 15 秒窗口。'
    });
    this.events.emit('toast', { text: '守卫超时：没有额外奖金。', ms: 2200 });
    this._clearArtifactPhase();
  }

  _ghostGotArtifact() {
    this.game.artifactPenalty = true;
    this.game.ghostScore = (this.game.ghostScore || 0) + 200;
    this.game.artifactGhostBoostUntil = nowSec() + GAME_CONFIG.artifactGhostBoostDuration;
    this.rage.add(12, 'artifactLost');
    this.events.emit('act.card', {
      title: '鬼抢走了镇店之宝！！',
      line: '它能力大涨 30 秒，结算会被扣钱！'
    });
    this.events.emit('beat.flash', { color: '#ff4d4d' });
    this.audio?.play('ghost');
    this.events.emit('camera.shake', { amount: 0.5 });
    this._clearArtifactPhase();
  }

  _clearArtifactPhase() {
    this.game.artifactActive = false;
    this.game.artifactStage = -1;
    const circle = this.game.artifactCircle;
    if (circle) {
      this.scene.group.remove(circle.ring);
      this.scene.group.remove(circle.beam);
      if (circle.treasure) this.scene.group.remove(circle.treasure);
      for (const seg of circle.progress || []) this.scene.group.remove(seg);
    }
    this.game.artifactCircle = null;
    this.game.artifactPending = null;
    this.game.artifactDefendTime = 0;
    this.game.artifactGhostGrabAt = 0;
    this.game.artifactPhaseIndex += 1;
    this._artifactTempts.forEach(t => this.scene.group.remove(t.mesh));
    this._artifactTempts = [];
    for (const item of this.game.artifactClearance || []) {
      if (item.group) this.scene.group.remove(item.group);
    }
    this.game.artifactClearance = [];
    for (const zone of this.game.artifactLockoutZones || []) {
      if (zone.group) this.scene.group.remove(zone.group);
    }
    this.game.artifactLockoutZones = [];
    this.events.emit('artifact.end');
  }
}
