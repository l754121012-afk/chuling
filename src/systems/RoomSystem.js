import { distance2D, nowSec, rand } from '../core/Utils.js';

export class RoomSystem {
  constructor({ scene, events, game, ghost, player, items, audio }) {
    this.scene = scene;
    this.events = events;
    this.game = game;
    this.ghost = ghost;
    this.player = player;
    this.items = items;
    this.audio = audio;
    this._lastRoom = null;
    this._healthEnterAt = 0;
    this._mazeNextShotAt = 0;
    this._mazeLauncherIndex = 0;
    this._volleys = [];
    this._trapHitCooldownUntil = 0;
    this._healthDoorsBefore = [];
  }

  reset() {
    this._lastRoom = null;
    this._healthEnterAt = 0;
    this._mazeNextShotAt = 0;
    this._mazeLauncherIndex = 0;
    this._volleys = [];
    this._trapHitCooldownUntil = 0;
    this._healthDoorsBefore = [];
  }

  _zone(id) {
    return (this.scene.refs?.roomZones || []).find(z => z.id === id) || null;
  }

  onZoneEnter(zone) {
    if (!zone || !this.game.detentionMode || this.game.skillMode) return;
    if (this._lastRoom === zone.id) return;
    this._lastRoom = zone.id;

    if (zone.id === 'health' && this.game.roomStates?.health === 'idle') {
      this.game.roomStates.health = 'entering';
      this._healthEnterAt = nowSec();
    }

    if (zone.id === 'maze') {
      if (this.game.detentionComplete) {
        this.game.roomStates.maze = 'cleared';
        return;
      }
      if (this.game.detentionScheduleRead && this.game.roomStates?.maze === 'idle') {
        this.game.roomStates.maze = 'hazard';
        this._mazeNextShotAt = nowSec() + 3.4;
      }
    }
  }

  update(dt) {
    if (!this.game.detentionMode || !this.game.isPlaying()) return;
    this._updateHealth(dt);
    this._updateMaze(dt);
  }

  _door(id) {
    return (this.scene.refs?.doors || []).find(d => d.id === id) || null;
  }

  _restoreDoorState(wasOpen, id) {
    const door = this._door(id);
    if (!door) return;
    this.scene.setDoor(id, !wasOpen, { silent: true });
  }

  _beginHealthFight() {
    if (!this.game.detentionMode || this.game.roomStates?.health !== 'entering') return;
    this.game.roomStates.health = 'active';
    const zone = this._zone('health');
    if (!zone) return;

    this._healthDoorsBefore = [
      { id: 'health_door', open: !this._door('health_door')?.locked },
      { id: 'right_lower_door', open: !this._door('right_lower_door')?.locked }
    ];
    for (const entry of this._healthDoorsBefore) {
      this.scene.setDoor(entry.id, true, { silent: true });
    }
    this.audio?.play('slam');
    this.events.emit('camera.shake', { amount: 0.2 });
    this.events.emit('toast', { text: '点名开始：门锁上了，2 个巡查影开始点名！', ms: 2400 });
    this.scene.spawnParticles({ x: zone.minX + (zone.maxX - zone.minX) * 0.3, y: 1.1, z: (zone.minZ + zone.maxZ) / 2 }, '#ff6b6b');
    this.ghost.spawnRoomMinions(zone, 2, {
      tag: 'health',
      hp: 6,
      color: '#ff8fa3'
    });
  }

  _finishHealthFight() {
    this.game.roomStates.health = 'cleared';
    for (const entry of this._healthDoorsBefore || []) {
      this._restoreDoorState(entry.open, entry.id);
    }
    this._healthDoorsBefore = [];
    const zone = this._zone('health');
    if (!zone) return;
    const drop = {
      x: (zone.minX + zone.maxX) / 2,
      y: 0.9,
      z: (zone.minZ + zone.maxZ) / 2
    };
    this.items.spawnPickupAt('glue', drop);
    this.scene.spawnParticles(drop, '#8ef0c8');
    this.scene.spawnHitRing({ x: drop.x, y: 0.2, z: drop.z }, '#8ef0c8');
    this.audio?.play('win');
    this.events.emit('toast', { text: '点名结束：保健室安静了，柜上滚出一瓶胶水。', ms: 2400 });
    this.events.emit('danmaku', { text: '清场干净利落！！' });
  }

  _abortHealthFight() {
    if (this.game.roomStates?.health === 'cleared') return;
    this.game.roomStates.health = 'idle';
    this.ghost.clearRoomMinions('health');
    for (const entry of this._healthDoorsBefore || []) {
      this._restoreDoorState(entry.open, entry.id);
    }
    this._healthDoorsBefore = [];
  }

  _updateHealth(dt) {
    const state = this.game.roomStates?.health;
    if (state === 'entering') {
      if (this.game.currentRoom !== 'health') {
        this.game.roomStates.health = 'idle';
        return;
      }
      const p = this.player.getPos();
      const nearDoor = ['health_door', 'right_lower_door'].some(id => {
        const door = this._door(id);
        return door && distance2D(p.x, p.z, door.pos.x, door.pos.z) < 2.2;
      });
      if (nearDoor) {
        this._healthEnterAt = Math.max(this._healthEnterAt, nowSec() + 0.45);
      }
      if (nowSec() >= this._healthEnterAt + 3.2) {
        this._beginHealthFight();
      }
      return;
    }
    if (state === 'active') {
      if (this.game.currentRoom !== 'health') {
        this._abortHealthFight();
        return;
      }
      if (this.ghost.getMinionCount('health') === 0) {
        this._finishHealthFight();
      }
    }
  }

  _pickLauncher(nearX, nearZ) {
    const launchers = this.scene.refs?.mazeLaunchers || [];
    if (!launchers.length) return null;
    const candidates = launchers
      .map((l, i) => ({ l, i, d: distance2D(l.x, l.z, nearX, nearZ) }))
      .filter(item => item.d > 4)
      .sort((a, b) => b.d - a.d);
    if (!candidates.length) return null;
    const pick = candidates[Math.floor(Math.random() * Math.min(3, candidates.length))];
    this._mazeLauncherIndex = (pick.i + 1) % launchers.length;
    return pick.l;
  }

  _hitPlayerWithTrap(x, z) {
    const now = nowSec();
    if (now < this._trapHitCooldownUntil) return;
    this._trapHitCooldownUntil = now + 1.1;
    this.game.stamina = Math.max(0, this.game.stamina - 9);
    this.audio?.play('hit');
    this.events.emit('camera.shake', { amount: 0.16 });
    this.scene.spawnParticles({ x, y: 0.6, z }, '#f4a261');
    this.events.emit('toast', { text: '纸卷卷到你了！体力被刮掉一截。', ms: 1600 });
  }

  _updateMaze(dt) {
    const state = this.game.roomStates?.maze;
    if (state !== 'hazard') {
      this._volleys = [];
      return;
    }
    if (this.game.currentRoom !== 'maze') {
      this._volleys = [];
      return;
    }
    const now = nowSec();
    if (now >= this._mazeNextShotAt) {
      this._mazeNextShotAt = now + rand(2.8, 4.2);
      const launcher = this._pickLauncher(this.player.getPos().x, this.player.getPos().z);
      const pos = this.player.getPos();
      if (launcher) {
        const from = { x: launcher.x, y: 0.9, z: launcher.z };
        const to = { x: pos.x, y: 0.9, z: pos.z };
        const dist = Math.max(3, distance2D(from.x, from.z, to.x, to.z));
        to.x = from.x + ((to.x - from.x) / dist) * dist;
        to.z = from.z + ((to.z - from.z) / dist) * dist;
        this.scene.spawnLightWave(from, to, '#ff9f45', 0.85);
        this.scene.spawnHitRing({ x: launcher.x, y: 0.1, z: launcher.z }, '#ff9f45');
        this._volleys.push({
          fromX: from.x,
          fromZ: from.z,
          dx: (to.x - from.x) / dist,
          dz: (to.z - from.z) / dist,
          speed: dist / 0.85,
          startedAt: now,
          duration: 0.85,
          hit: false
        });
      }
    }

    const pp = this.player.getPos();
    for (let i = this._volleys.length - 1; i >= 0; i--) {
      const v = this._volleys[i];
      const t = now - v.startedAt;
      if (t >= v.duration) {
        this._volleys.splice(i, 1);
        continue;
      }
      const x = v.fromX + v.dx * v.speed * t;
      const z = v.fromZ + v.dz * v.speed * t;
      if (!v.hit && distance2D(x, z, pp.x, pp.z) < 0.9) {
        v.hit = true;
        this._hitPlayerWithTrap(x, z);
      }
    }
  }
}
