import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.js';
import { ITEM_DEFS, COMBO_DEFS } from '../config/items.js';
import { GROUPS, makeBody, syncMeshToBody, v3 } from '../core/Physics.js';
import {
  makeItemMesh,
  makeItemMarker,
  makeTrapMesh,
  makeGluePuddleMesh
} from '../core/PlaceholderAssets.js';
import { distance2D, nowSec, rand, choice } from '../core/Utils.js';

export class ItemSystem {
  constructor({ scene, physics, events, game, rage, ghost, camera, audio, playerPos }) {
    this.scene = scene;
    this.physics = physics;
    this.events = events;
    this.game = game;
    this.rage = rage;
    this.ghost = ghost;
    this.camera = camera;
    this.audio = audio;
    this.playerPos = playerPos;
    this.pickups = [];
    this.projectiles = [];
    this.pendingPickups = [];
    this.zones = [];
    this._removeQueue = [];
    this.playerHand = null;
    this._handModel = null;
    this._handItemId = null;
    this.cooldown = 0;
    this._trajectory = null;
    this._aiming = false;
    this._comboAim = false;
    this._backupTimer = -1;
    this._backupSpawned = false;
    events.on('aim.changed', p => {
      this._aiming = p.aiming;
      this._comboAim = p.combo;
      if (this._trajectory) this._trajectory.group.visible = p.aiming;
    });
    this._ensureTrajectory();
  }

  _ensureTrajectory() {
    if (this._trajectory) return;
    const positions = new Float32Array(26 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineDashedMaterial({
      color: 0xffe08a,
      dashSize: 0.18,
      gapSize: 0.12,
      transparent: true,
      opacity: 0.85
    });
    const line = new THREE.Line(geometry, material);
    const end = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 })
    );
    const group = new THREE.Group();
    group.add(line, end);
    group.visible = false;
    this.scene.group.add(group);
    this._trajectory = { group, line, end, positions };
  }

  _updateTrajectory() {
    const tr = this._trajectory;
    if (!tr) return;
    const def = this.game.equippedDef();
    const show = this._aiming && this.game.isPlaying() && def?.type === 'throw';
    tr.group.visible = show;
    if (!show) return;

    const speed = this._comboAim ? 30 : (def.speed || 15);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = Math.max(-0.1, dir.y);
    dir.normalize();
    const p = this.playerPos();
    const start = new THREE.Vector3(
      p.x + dir.x * 0.8,
      p.y + 1.3 + dir.y * 0.8,
      p.z + dir.z * 0.8
    );
    const gravity = -9.82;
    const step = 0.06;
    const last = start.clone();
    let lastIndex = 0;
    for (let i = 0; i < 26; i++) {
      const t = Math.min(i * step, 1.5);
      const x = start.x + dir.x * speed * t;
      const rawY = start.y + dir.y * speed * t + 0.5 * gravity * t * t;
      const y = Math.max(rawY, 0.06);
      const z = start.z + dir.z * speed * t;
      tr.positions[i * 3] = x;
      tr.positions[i * 3 + 1] = y;
      tr.positions[i * 3 + 2] = z;
      last.set(x, y, z);
      lastIndex = i;
      if (rawY < 0.06) break;
    }
    for (let i = lastIndex + 1; i < 26; i++) {
      tr.positions[i * 3] = last.x;
      tr.positions[i * 3 + 1] = last.y;
      tr.positions[i * 3 + 2] = last.z;
    }
    tr.line.geometry.attributes.position.needsUpdate = true;
    tr.line.computeLineDistances();
    tr.end.position.copy(last);
  }

  spawnPickups() {
    for (const s of this.scene.refs.itemSpawns) {
      const mesh = makeItemMesh(s.id);
      mesh.position.set(s.x, s.y || 1.0, s.z);
      mesh.rotation.y = rand(0, Math.PI * 2);
      const marker = makeItemMarker(s.id);
      marker.position.set(0, 0.08, 0);
      mesh.add(marker);
      mesh.userData.marker = marker.userData.marker;
      this.scene.group.add(mesh);
      this.pickups.push({
        id: s.id,
        mesh,
        pos: { x: s.x, z: s.z },
        picked: false
      });
    }
  }

  pickup(pickup) {
    if (pickup.picked || !this.game.isPlaying()) return;
    pickup.picked = true;
    this.scene.group.remove(pickup.mesh);
    this.game.addItem(pickup.id, 1);
    this.syncHand();
    const def = ITEM_DEFS[pickup.id];
    this.events.emit('item.picked', { id: pickup.id, def });
    this.audio?.play('paper');
    this.events.emit('toast', { text: `${def.name} 到手了`, ms: 1300 });
  }

  useEquipped() {
    if (!this.game.isPlaying() || this.game.notebookOpen || this.cooldown > 0) return;
    const def = this.game.equippedDef();
    if (!def) return;
    if (def.type === 'throw') {
      this._throwItem(def, null);
    } else if (def.type === 'seal') {
      this._useStapler();
    } else if (def.type === 'trap') {
      this._placeTrap();
    } else if (def.type === 'mine') {
      this._placeMine();
    }
    this.cooldown = GAME_CONFIG.throwCooldown;
  }

  comboSlingshot() {
    if (!this.game.isPlaying() || this.cooldown > 0) return;
    if (!this.game.hasItem('pen') || !this.game.hasItem('rubber')) {
      this.events.emit('toast', { text: '需要圆珠笔+橡皮筋', ms: 1500 });
      return;
    }
    this.game.consumeItem('rubber');
    this.game.usedItems.push('rubber');
    this._throwItem(ITEM_DEFS.pen, COMBO_DEFS.slingshot);
    this.cooldown = GAME_CONFIG.throwCooldown;
  }

  _throwItem(def, combo) {
    if (!this.game.consumeItem(def.id, 1)) return;
    if (combo) {
      this.game.usedItems.push(def.id);
      this.events.emit('toast', { text: `${combo.name}！飞出去了！`, ms: 1400 });
    } else {
      this.game.usedItems.push(def.id);
      this.events.emit('toast', { text: `${def.name} 飞出去了！`, ms: 900 });
    }

    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = Math.max(-0.1, dir.y);
    dir.normalize();
    const origin = this.playerPos();
    const start = new THREE.Vector3(
      origin.x + dir.x * 1.1,
      origin.y + 1.35 + dir.y * 1.1,
      origin.z + dir.z * 1.1
    );

    const mesh = makeItemMesh(def.id);
    mesh.position.copy(start);
    this.scene.group.add(mesh);

    const body = makeBody({
      shape: new CANNON.Sphere(0.12),
      position: start,
      mass: def.mass || 0.1,
      group: GROUPS.ITEM,
      mask: GROUPS.WORLD | GROUPS.GHOST | GROUPS.PROP,
      fixedRotation: false
    });
    body.linearDamping = 0.05;
    body.angularDamping = 0.02;
    this.physics.add(body);

    const speed = combo?.speed || def.speed;
    body.velocity.set(dir.x * speed, dir.y * speed + 0.8, dir.z * speed);
    body.angularVelocity.set(rand(-12, 12), rand(-12, 12), rand(-12, 12));

    const proj = {
      id: def.id,
      def,
      combo,
      mesh,
      body,
      impacted: false,
      ttl: 9
    };
    body.addEventListener('collide', ev => this._onProjectileHit(proj, ev));
    this.projectiles.push(proj);
    this.audio?.play('whoosh');
    this.events.emit('noise', {
      pos: origin,
      radius: GAME_CONFIG.noiseThrowRadius,
      rage: 3
    });
  }

  _onProjectileHit(proj, ev) {
    if (proj.impacted) return;
    const other = ev.body;
    if (other === proj.body) return;
    proj.impacted = true;
    const hitPos = { x: proj.body.position.x, z: proj.body.position.z };

    if ((other.collisionFilterGroup & GROUPS.GHOST) !== 0) {
      this._hitGhost(proj, hitPos);
      return;
    }
    this._hitWorld(proj, hitPos);
  }

  _hitGhost(proj, hitPos) {
    if (proj.def.id === 'glue') {
      this.game.slowedUntil = nowSec() + (proj.def.slow || 3);
      this.rage.add(proj.def.rage, 'glue');
      this.audio?.play('splat');
      this.events.emit('toast', { text: '胶水糊了它一脸！速度变慢了', ms: 1800 });
      this.scene.spawnParticles(hitPos, '#8fd3c7');
      this.scene.spawnHitRing(hitPos, '#8fd3c7');
      this.ghost._speak('黏糊糊的！！', 1600);
      this._removeProjectile(proj);
      return;
    }
    if (proj.def.id === 'eraser') {
      const gb = this.ghost.pawn.body;
      const dx = gb.position.x - hitPos.x;
      const dz = gb.position.z - hitPos.z;
      const len = Math.hypot(dx, dz) || 1;
      const power = proj.def.knockback || 8;
      this.ghost.knockback((dx / len) * power, (dz / len) * power, 0.45);
      this.ghost.damage(proj.def.damage || 1, proj.def);
      this.audio?.play('hit');
      this.events.emit('toast', { text: '黑板擦把它拍退了！', ms: 1500 });
      this.events.emit('camera.shake', { amount: 0.25 });
      this.scene.spawnParticles(hitPos, '#cbb68a');
      this.scene.spawnHitRing(hitPos, '#cbb68a');
      this._removeProjectile(proj);
      return;
    }
    if (proj.def.id === 'crossbow') {
      const gb = this.ghost.pawn.body;
      const dx = gb.position.x - hitPos.x;
      const dz = gb.position.z - hitPos.z;
      const len = Math.hypot(dx, dz) || 1;
      const power = proj.def.knockback || 12;
      this.ghost.knockback((dx / len) * power, (dz / len) * power, 0.7);
      this.game.stunnedUntil = nowSec() + (proj.def.stun || 0.8);
      this.ghost.damage(proj.def.damage || 10, proj.def);
      this.audio?.play('hit');
      this.events.emit('toast', { text: '玩具弩把它顶飞了！', ms: 1500 });
      this.events.emit('hitstop', { ms: 70 });
      this.events.emit('camera.shake', { amount: 0.35 });
      this.scene.spawnParticles(hitPos, '#ffb86b');
      this.scene.spawnHitRing(hitPos, '#ffb86b');
      this._removeProjectile(proj);
      return;
    }
    if (proj.def.id === 'chair') {
      const gb = this.ghost.pawn.body;
      const dx = gb.position.x - hitPos.x;
      const dz = gb.position.z - hitPos.z;
      const len = Math.hypot(dx, dz) || 1;
      const power = proj.def.knockback || 12;
      this.ghost.knockback((dx / len) * power, (dz / len) * power, 0.7);
      this.game.stunnedUntil = nowSec() + (proj.def.stun || 1);
      this.ghost.damage(proj.def.damage || 10, proj.def);
      this.audio?.play('hit');
      this.events.emit('toast', { text: '椅子把它砸飞了！', ms: 1500 });
      this.events.emit('camera.shake', { amount: 0.4 });
      this._removeProjectile(proj);
      return;
    }
    this.ghost.damage(proj.def.damage || 1, proj.def);
    this.events.emit('noise', { pos: hitPos, radius: 10, rage: 0 });
    this.events.emit('hitstop', { ms: 50 });
    this.scene.spawnParticles(hitPos, '#ffe08a');
    this.scene.spawnHitRing(hitPos, '#ffe08a');
    this.events.emit('toast', {
      text: `${proj.def.name} 命中了！灵体值 -${proj.def.damage || 0}`,
      ms: 1300
    });
    this._removeProjectile(proj);
  }

  _hitWorld(proj, hitPos) {
    if (proj.def.id === 'glue') {
      this._createGluePuddle(hitPos);
      this._removeProjectile(proj);
      return;
    }
    if (proj.def.id === 'scissors' && Math.random() < 0.55) {
      this._removeProjectile(proj);
      this.events.emit('toast', { text: '剪刀插进天花板了！', ms: 1800 });
      this.audio?.play('hit');
      return;
    }
    this._schedulePickup(proj.def.id, hitPos, 0.65);
    this._removeProjectile(proj);
  }

  _removeProjectile(proj) {
    const idx = this.projectiles.indexOf(proj);
    if (idx >= 0) this.projectiles.splice(idx, 1);
    this._removeQueue.push(proj);
  }

  _processRemovals() {
    for (const proj of this._removeQueue) {
      if (proj.body?.world) this.physics.remove(proj.body);
      if (proj.mesh) this.scene.group.remove(proj.mesh);
    }
    this._removeQueue.length = 0;
  }

  _schedulePickup(id, pos, delay) {
    this.pendingPickups.push({
      id,
      pos: { x: pos.x, z: pos.z },
      at: nowSec() + delay
    });
  }

  _createGluePuddle(pos) {
    const mesh = makeGluePuddleMesh();
    mesh.position.set(pos.x, 0.02, pos.z);
    this.scene.group.add(mesh);
    this.zones.push({
      type: 'glue',
      mesh,
      pos: { x: pos.x, z: pos.z },
      radius: 0.75,
      until: nowSec() + 10,
      used: false
    });
    this.audio?.play('splat');
  }

  _placeTrap() {
    if (!this.game.consumeItem('tape')) return;
    this.game.usedItems.push('tape');
    const p = this.playerPos();
    const mesh = makeTrapMesh();
    mesh.position.set(p.x, 0.02, p.z);
    this.scene.group.add(mesh);
    this.zones.push({
      type: 'trap',
      mesh,
      pos: { x: p.x, z: p.z },
      radius: 0.9,
      until: nowSec() + 60,
      used: false
    });
    this.events.emit('toast', { text: '陷阱放好了：鬼踩中时推倒书架能压住它', ms: 2200 });
    this.audio?.play('click');
  }

  _placeMine() {
    if (!this.game.consumeItem('mine')) return;
    this.game.usedItems.push('mine');
    const p = this.playerPos();
    const mesh = makeItemMesh('mine');
    mesh.position.set(p.x, 0.05, p.z);
    this.scene.group.add(mesh);
    this.zones.push({
      type: 'mine',
      mesh,
      pos: { x: p.x, z: p.z },
      radius: 0.8,
      until: nowSec() + 120,
      used: false
    });
    this.events.emit('toast', { text: '尖叫地雷放好了！鬼踩到会被弹飞！', ms: 2000 });
    this.audio?.play('click');
  }

  _useStapler() {
    const result = this.ghost.sealAttempt();
    if (result === 'miss') {
      this.events.emit('toast', { text: '太远了，够不着。', ms: 1200 });
    } else if (result === 'blocked') {
      // ChainDirector already delivered the tutorial prompt.
    } else if (result === 'wrong' && !this._backupSpawned && !this._hasWorldStapler()) {
      this._backupTimer = nowSec() + 20;
      this.events.emit('toast', { text: '备用订书机将在 20 秒后刷新', ms: 2200 });
    }
  }

  resetBackup() {
    this._backupTimer = -1;
    this._backupSpawned = false;
  }

  _hasWorldStapler() {
    return this.pickups.some(p => p.id === 'stapler' && !p.picked);
  }

  spawnPickupAt(id, pos) {
    const mesh = makeItemMesh(id);
    mesh.position.set(pos.x, pos.y ?? 1.02, pos.z);
    mesh.rotation.y = rand(0, Math.PI * 2);
    const marker = makeItemMarker(id);
    marker.position.set(0, 0.08, 0);
    mesh.add(marker);
    mesh.userData.marker = marker.userData.marker;
    this.scene.group.add(mesh);
    this.pickups.push({ id, mesh, pos: { x: pos.x, z: pos.z }, picked: false });
  }

  giveItem(id, n = 1) {
    this.game.addItem(id, n);
    this.syncHand();
    this.events.emit('item.picked', { id, def: ITEM_DEFS[id] });
  }

  syncHand() {
    const slot = this.playerHand;
    if (!slot) return;

    let equipped = this.game.equipped;
    if (!this.game.hasItem(equipped)) {
      const owned = Object.keys(ITEM_DEFS).filter(id => this.game.hasItem(id));
      equipped = owned[0] || null;
      if (equipped) this.game.equipped = equipped;
    }

    if (!equipped || !this.game.isPlaying()) {
      if (this._handModel) {
        slot.remove(this._handModel);
        this._handModel = null;
      }
      this._handItemId = null;
      return;
    }

    if (this._handItemId === equipped && this._handModel) return;

    if (this._handModel) slot.remove(this._handModel);
    const mesh = makeItemMesh(equipped);
    mesh.scale.setScalar(1.15);
    mesh.position.set(0, -0.02, 0.12);
    mesh.rotation.set(0.15, 0.35, 0);
    slot.add(mesh);
    this._handModel = mesh;
    this._handItemId = equipped;
  }

  update(dt, playerPos, ghostPos) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this._processRemovals();
    this.syncHand();
    this._updateTrajectory();

    if (
      this._backupTimer > 0 &&
      nowSec() >= this._backupTimer &&
      !this._backupSpawned &&
      this.game.isPlaying() &&
      this.game.phase === 'investigate' &&
      !this.game.hasItem('stapler') &&
      !this._hasWorldStapler()
    ) {
      this._backupSpawned = true;
      this._backupTimer = -1;
      this.spawnPickupAt('stapler', { x: 5.2, y: 1.02, z: -3.4 });
      this.events.emit('toast', { text: '备用订书机出现在讲台上！', ms: 2400 });
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.ttl -= dt;
      syncMeshToBody(proj.mesh, proj.body);
      if (proj.ttl <= 0) {
        if (!proj.impacted && proj.def.id !== 'scissors') {
          this._schedulePickup(proj.def.id, { x: proj.body.position.x, z: proj.body.position.z }, 0.2);
        }
        this._removeProjectile(proj);
      }
    }

    for (let i = this.pendingPickups.length - 1; i >= 0; i--) {
      const p = this.pendingPickups[i];
      if (nowSec() < p.at) continue;
      const mesh = makeItemMesh(p.id);
      mesh.position.set(p.pos.x, 0.06, p.pos.z);
      mesh.rotation.y = rand(0, Math.PI * 2);
      const marker = makeItemMarker(p.id);
      marker.position.set(0, 0.08, 0);
      mesh.add(marker);
      mesh.userData.marker = marker.userData.marker;
      this.scene.group.add(mesh);
      this.pickups.push({
        id: p.id,
        mesh,
        pos: { x: p.pos.x, z: p.pos.z },
        picked: false
      });
      this.pendingPickups.splice(i, 1);
    }

    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zone = this.zones[i];
      if (nowSec() > zone.until || zone.used) {
        this.scene.group.remove(zone.mesh);
        this.zones.splice(i, 1);
        continue;
      }
      const ghostDist = distance2D(ghostPos.x, ghostPos.z, zone.pos.x, zone.pos.z);
      const playerDist = distance2D(playerPos.x, playerPos.z, zone.pos.x, zone.pos.z);
      if (zone.type === 'trap' && ghostDist < zone.radius && !zone.used) {
        zone.used = true;
        this.game.stunnedUntil = nowSec() + 3.2;
        this.rage.add(3, 'trap');
        this.audio?.play('splat');
        this.events.emit('toast', { text: '鬼被修正带黏住了！', ms: 1800 });
        this.ghost._speak('这是什么？！', 1600);
      }
      if (zone.type === 'mine' && ghostDist < zone.radius && !zone.used) {
        zone.used = true;
        this.scene.group.remove(zone.mesh);
        this.game.stunnedUntil = nowSec() + 2.5;
        const dx = ghostPos.x - playerPos.x;
        const dz = ghostPos.z - playerPos.z;
        const len = Math.hypot(dx, dz) || 1;
        this.ghost.knockback((dx / len) * 10, (dz / len) * 10, 0.6);
        this.rage.add(3, 'mine');
        this.audio?.play('slam');
        this.events.emit('hitstop', { ms: 90 });
        this.events.emit('camera.shake', { amount: 0.4 });
        this.scene.spawnParticles({ x: zone.pos.x, y: 0.6, z: zone.pos.z }, '#ff6b6b');
        this.scene.spawnHitRing({ x: zone.pos.x, y: 0.5, z: zone.pos.z }, '#ff6b6b');
        this.events.emit('toast', { text: '地雷炸了！鬼被弹飞了！', ms: 1800 });
        this.ghost._speak('咩————？！', 1500);
      }
      if (zone.type === 'glue') {
        if (ghostDist < zone.radius) {
          this.game.slowedUntil = nowSec() + 1.8;
        }
        if (playerDist < zone.radius * 0.85) {
          this.game.stickyUntil = nowSec() + 1.4;
          this.events.emit('toast', { text: '你踩到自己的胶水了！', ms: 1400 });
        }
      }
    }

    for (const pickup of this.pickups) {
      if (pickup.picked || !pickup.mesh.userData.marker) continue;
      const marker = pickup.mesh.userData.marker;
      marker.t += dt;
      const pulse = 1 + Math.sin(marker.t * 3) * 0.08;
      marker.ring.scale.setScalar(pulse);
      marker.ring.material.opacity = 0.6 + Math.sin(marker.t * 2.4) * 0.3;
      marker.sprite.material.opacity = 0.7 + Math.sin(marker.t * 2) * 0.25;
      marker.sprite.position.y = 0.62 + Math.sin(marker.t * 2) * 0.06;
    }
  }
}
