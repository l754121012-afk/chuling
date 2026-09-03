import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GHOST_CONFIG, stageForRage } from '../config/ghost.js';
import { GAME_CONFIG } from '../config/game.js';
import { GROUPS, makeBody, syncMeshToBody, v3 } from '../core/Physics.js';
import { makeGhostMesh, makeWeakPointMarker, makePropMesh } from '../core/PlaceholderAssets.js';
import { choice, clamp, distance2D, nowSec, rand } from '../core/Utils.js';

const GHOST_VISUALS = {
  calm: {
    color: 0xf3efe7, emissive: 0x000000, intensity: 0,
    aura: 0x9fb8ad, auraOpacity: 0.08, flames: false, danger: 0
  },
  annoyed: {
    color: 0xf5e8c8, emissive: 0x4a3600, intensity: 0.08,
    aura: 0xd9a94e, auraOpacity: 0.18, flames: false, danger: 0.12
  },
  angry: {
    color: 0xf0c3a0, emissive: 0x7a2418, intensity: 0.18,
    aura: 0xe76f51, auraOpacity: 0.3, flames: false, danger: 0.3
  },
  furious: {
    color: 0xd99090, emissive: 0xa01225, intensity: 0.45,
    aura: 0xd7263d, auraOpacity: 0.45, flames: true, danger: 0.5
  },
  insane: {
    color: 0xb58fd6, emissive: 0x5d1fa8, intensity: 0.8,
    aura: 0x9b5de5, auraOpacity: 0.6, flames: true, danger: 0.72
  }
};

export class GhostSystem {
  constructor({ scene, physics, events, game, rage, audio, economy }) {
    this.scene = scene;
    this.physics = physics;
    this.events = events;
    this.game = game;
    this.rage = rage;
    this.audio = audio;
    this.economy = economy;
    this.pawn = null;
    this.playerPos = () => ({ x: 0, y: 0, z: 0 });
    this.playerBody = null;
    this.playerCrouching = null;
    this._waypoint = null;
    this._lastNoise = null;
    this._lastSeen = null;
    this._searchTimer = 0;
    this._slapCooldown = 0;
    this._footprintTimer = 0;
    this._speechTimer = 0;
    this._flash = 0;
    this._facing = 0;
    this._caught = false;
    this._visualStage = null;
    this._flameTime = 0;
    this._hiddenTimer = 0;
    this._dashTimer = 0;
    this._dashCooldown = 0;
    this._dashDirX = 0;
    this._dashDirZ = 0;
    this._dashSpeed = 0;
    this._dashFlash = 0;
    this._spinTimer = 0;
    this._spinDir = 1;
    this._knockbackTimer = 0;
    this._knockbackVX = 0;
    this._knockbackVZ = 0;
    this._stuckTime = 0;
    this._lastStuckPos = { x: 0, z: 0 };
    this._skillCooldown = rand(8, 14);
    this._ambushUntil = 0;
    this._ambushActive = false;
    this._ambushSpeed = 0;
    this._disguiseActive = false;
    this._disguiseMesh = null;
    this._disguiseUntil = 0;
    this._disguiseCooldown = rand(20, 30);
    this._attackCooldown = rand(
      GAME_CONFIG.ghostAttackCooldownMin,
      GAME_CONFIG.ghostAttackCooldownMax
    );
    this._telegraphActive = false;
    this._telegraphUntil = 0;
    this._attackUntil = 0;
    this._attackFired = false;
    this._chargeActive = false;
    this._chargeWindupUntil = 0;
    this._chargeUntil = 0;
    this._chargeDirX = 0;
    this._chargeDirZ = 0;
    this._chargeSpeed = 0;
    this._chargeHitDone = false;
    this._scareActive = false;
    this._scareUntil = 0;
    this._lastScareAt = -20;
    this._throwActive = false;
    this._throwTelegraphUntil = 0;
    this._throwComboUntil = 0;
    this._throwHits = 0;
    this._throwHitCooldownUntil = 0;
    this._throwSpeed = 0;
    this._kiteCooldown = 0;
    this._pressureTime = 0;
    this._attackAnimTimer = 0;
    this._telegraphRing = null;
    this._telegraphRingMat = null;
    this._parryRangeRing = null;
    this._parryRangeMat = null;
    this._weakPoint = null;
    this._rangeRing = null;
    this._rangeRingMat = null;
    this._wallHugDir = 1;
    this._wallHugUntil = 0;
    this._comboCount = 0;
    this._lastAttackKind = null;
    this._lookBackCooldown = rand(12, 20);
    this._lookBackUntil = 0;
    this._lookBackActive = false;
    this._lookBackAngle = 0;
    this._wishNextAt = 0;
    this._wishActive = false;
    this._wishPhase = 'idle';
    this._wishUntil = 0;
    this._wishKnockAt = 0;
    this._wishLeaveAt = 0;
    this._wishAckUntil = 0;
    this._wishAckPos = null;
    this._minions = [];
    this._ghostWebs = [];
    this._minionNextAt = 0;

    events.on('noise', payload => this._onNoise(payload));
    events.on('game.lost', () => this._clearMinions());
    events.on('game.win', () => this._clearMinions());
  }

  createPawn(pos) {
    const mesh = makeGhostMesh(!!this.economy?.unlocks?.ghost_hat);
    mesh.position.set(pos.x, 1.2, pos.z);
    this.scene.group.add(mesh);
    const body = makeBody({
      shape: new CANNON.Sphere(0.55),
      position: { x: pos.x, y: 1.2, z: pos.z },
      mass: 20,
      group: GROUPS.GHOST,
      mask: GROUPS.WORLD,
      fixedRotation: true,
      gravityScale: 0
    });
    body.linearDamping = 0.4;
    body.allowSleep = false;
    this.physics.add(body);
    this.pawn = { mesh, body };
    this._lastStuckPos = { x: pos.x, z: pos.z };

    const weak = makeWeakPointMarker();
    weak.position.set(0, 1.4, -0.52);
    weak.visible = false;
    mesh.add(weak);
    this._weakPoint = weak;

    const rangeMat = new THREE.MeshBasicMaterial({
      color: 0xe63946,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const range = new THREE.Mesh(new THREE.RingGeometry(2.25, 2.4, 40), rangeMat);
    range.rotation.x = -Math.PI / 2;
    range.position.y = -1.2;
    range.visible = false;
    mesh.add(range);
    this._rangeRing = range;
    this._rangeRingMat = rangeMat;

    const attackRing = new THREE.Mesh(
      new THREE.RingGeometry(3.15, 3.45, 40),
      new THREE.MeshBasicMaterial({
        color: 0xff6b6b,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    attackRing.rotation.x = -Math.PI / 2;
    attackRing.visible = false;
    this.scene.group.add(attackRing);
    this._telegraphRing = attackRing;
    this._telegraphRingMat = attackRing.material;

    const parryRing = new THREE.Mesh(
      new THREE.RingGeometry(4.0, 4.2, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    parryRing.rotation.x = -Math.PI / 2;
    parryRing.visible = false;
    this.scene.group.add(parryRing);
    this._parryRangeRing = parryRing;
    this._parryRangeMat = parryRing.material;

    return this.pawn;
  }

  getPos() {
    const p = this.pawn.body.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  _isPinned() {
    return this.game.chainPinned || this.game.pinnedUntil > nowSec();
  }

  onRunStart() {
    this._clearMinions();
    this._comboCount = 0;
    this._lookBackCooldown = rand(14, 22);
    this._lookBackActive = false;
    this._lookBackUntil = 0;
    this._wishNextAt = nowSec() + rand(6, 9);
    this._wishActive = false;
    this._wishPhase = 'idle';
    this._wishAckUntil = 0;
    this._wishAckPos = null;
    this._minionNextAt = nowSec() + GAME_CONFIG.minionWaveFirstAt;
    this._wallHugUntil = 0;
  }

  _clearMinions() {
    for (const m of this._minions || []) {
      this.scene.group.remove(m.group);
    }
    for (const w of this._ghostWebs || []) {
      this.scene.group.remove(w.group);
    }
    this._minions = [];
    this._ghostWebs = [];
  }

  _roomRects() {
    const c = this.scene.L.classroom;
    const co = this.scene.L.corridor;
    return [
      {
        minX: c.minX + 1.2,
        maxX: c.maxX - 1.2,
        minZ: c.minZ + 1.2,
        maxZ: c.maxZ - 1.2,
        w: 0.7
      },
      {
        minX: co.minX + 1.2,
        maxX: co.maxX - 1.2,
        minZ: co.minZ + 1.2,
        maxZ: co.maxZ - 1.2,
        w: 0.3
      }
    ];
  }

  _isInsidePlayable(x, z, pad = 0) {
    for (const r of this._roomRects()) {
      if (x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad) return true;
    }
    return false;
  }

  _randomPlayablePoint(margin = 1.6) {
    const rects = this._roomRects();
    const totalW = rects.reduce((sum, r) => sum + r.w, 0);
    let roll = Math.random() * totalW;
    for (const r of rects) {
      roll -= r.w;
      if (roll > 0) continue;
      return {
        x: rand(r.minX + margin, r.maxX - margin),
        z: rand(r.minZ + margin, r.maxZ - margin)
      };
    }
    const r = rects[0];
    return { x: rand(r.minX + margin, r.maxX - margin), z: rand(r.minZ + margin, r.maxZ - margin) };
  }

  _lineBlockedWorld(x1, z1, x2, z2) {
    const from = v3(x1, 1.15, z1);
    const to = v3(x2, 1.15, z2);
    const hit = this.physics.raycastClosest(from, to, GROUPS.WORLD);
    if (!hit) return false;
    const total = Math.max(0.3, Math.hypot(x2 - x1, z2 - z1));
    const hx = hit.hitPointWorld.x;
    const hz = hit.hitPointWorld.z;
    const hitDist = Math.hypot(hx - x1, hz - z1);
    return hitDist < total - 0.4;
  }

  _findValidLanding(nearX, nearZ, minDist = 2.2, maxDist = 4.2) {
    for (let i = 0; i < 26; i++) {
      const angle = Math.random() * Math.PI * 2;
      const d = rand(minDist, maxDist);
      const x = nearX + Math.cos(angle) * d;
      const z = nearZ + Math.sin(angle) * d;
      if (!this._isInsidePlayable(x, z)) continue;
      if (this._lineBlockedWorld(x, z, nearX, nearZ)) continue;
      return { x, z };
    }
    return this._randomPlayablePoint(1.4);
  }

  _enforcePlayable(dt) {
    const b = this.pawn.body.position;
    if (this._isInsidePlayable(b.x, b.z)) return;
    this._boundsFixCooldown = (this._boundsFixCooldown || 0) - dt;
    if (this._boundsFixCooldown > 0) return;
    this._boundsFixCooldown = 1.5;
    const land = this._randomPlayablePoint(1.8);
    this._placeGhost(land.x, land.z, 1.2);
    this._ambushActive = false;
    this._disguiseActive = false;
    if (this._disguiseMesh) {
      this.scene.group.remove(this._disguiseMesh);
      this._disguiseMesh = null;
    }
    this.pawn.mesh.visible = true;
    this.scene.spawnParticles({ x: land.x, y: 1, z: land.z }, '#9b8cff');
  }

  canTouchPoint(x, z, radius) {
    if (!this.pawn) return false;
    const b = this.pawn.body.position;
    if (!this._isInsidePlayable(b.x, b.z)) return false;
    if (this._isPinned() || this.game.chainStuck || this.game.broken) return false;
    if (this.game.weakUntil > nowSec() || this.game.stunnedUntil > nowSec()) return false;
    if (distance2D(b.x, b.z, x, z) >= radius) return false;
    if (this._lineBlockedWorld(b.x, b.z, x, z)) return false;
    return distance2D(b.x, b.z, x, z) < radius;
  }

  _maybeSpawnMinionWave() {
    if (this.game.phase !== 'investigate' || !this.game.isPlaying()) return;
    if (this._minionNextAt <= 0) {
      this._minionNextAt = nowSec() + GAME_CONFIG.minionWaveFirstAt;
      return;
    }
    if (nowSec() < this._minionNextAt) return;
    if (this.game.artifactActive || this.game.bellPhaseActive || this.game.huntActive) return;
    this._minionNextAt = nowSec() + rand(
      GAME_CONFIG.minionWaveIntervalMin,
      GAME_CONFIG.minionWaveIntervalMax
    );
    const count = GAME_CONFIG.minionCount || 3;
    for (let i = 0; i < count; i++) this._spawnMinion();
    this.audio?.play('ghost');
    this.events.emit('toast', {
      text: `${count} 只巡逻幽灵被放出来了！别被围住！`,
      ms: 2400
    });
    this.events.emit('danmaku', { text: '它们开始巡楼了！！' });
  }

  _spawnMinion() {
    const p = this.playerPos();
    let spot = this._randomPlayablePoint(2);
    for (let i = 0; i < 24; i++) {
      const c = this._randomPlayablePoint(2);
      if (distance2D(c.x, c.z, p.x, p.z) > 5.5) {
        spot = c;
        break;
      }
    }
    const mesh = makeGhostMesh(false);
    mesh.scale.setScalar(0.48);
    mesh.position.set(spot.x, 1.0, spot.z);
    this.scene.group.add(mesh);
    const ghostMat = mesh.userData?.ghostMat;
    if (ghostMat) {
      ghostMat.color.setHex(0x73d5cf);
      ghostMat.transparent = true;
      ghostMat.opacity = 0.88;
    }
    const aura = mesh.userData?.aura;
    if (aura) {
      aura.material.color.setHex(0x46d5c5);
      aura.material.opacity = 0.22;
    }
    const minion = {
      group: mesh,
      x: spot.x,
      z: spot.z,
      waypoint: this._randomPlayablePoint(2),
      speed: GAME_CONFIG.minionPatrolSpeed,
      state: 'patrol',
      born: nowSec(),
      lifetime: GAME_CONFIG.minionLifetime,
      bob: Math.random() * Math.PI * 2,
      hp: 6,
      flashUntil: 0,
      hugDir: Math.random() < 0.5 ? -1 : 1,
      hugUntil: 0,
      webUsed: false
    };
    this._minions.push(minion);
    this.scene.spawnParticles({ x: spot.x, y: 1, z: spot.z }, '#46d5c5');
  }

  _damageMinion(m, damage = 1) {
    if (!m || m.hp <= 0 || !this._minions.includes(m)) return false;
    m.hp -= damage;
    m.flashUntil = nowSec() + 0.45;
    if (m.hp <= 0) {
      this.scene.group.remove(m.group);
      this.scene.spawnParticles({ x: m.x, y: 1, z: m.z }, '#9b8cff');
      this._minions = this._minions.filter(x => x !== m);
      this.audio?.play('slap');
      this.events.emit('toast', { text: '巡逻幽灵被打散了！', ms: 1300 });
      this.events.emit('danmaku', { text: choice(['幽灵护卫倒了一个！', '它又少了条腿！']) });
      this.rage?.addDrama?.(6, 'minionKill');
    } else {
      this.scene.spawnParticles({ x: m.x, y: 1, z: m.z }, '#ffd166');
      this.audio?.play('hit');
    }
    return true;
  }

  _updateMinions(dt, playerPos) {
    this._maybeSpawnMinionWave();
    for (let i = this._minions.length - 1; i >= 0; i--) {
      const m = this._minions[i];
      const age = nowSec() - m.born;
      if (age >= m.lifetime || !this.game.isPlaying() || this.game.phase !== 'investigate') {
        this.scene.group.remove(m.group);
        this.scene.spawnParticles({ x: m.x, y: 1, z: m.z }, '#9b8cff');
        this._minions.splice(i, 1);
        continue;
      }
      const dist = distance2D(m.x, m.z, playerPos.x, playerPos.z);
      const sameFloor = playerPos.y - m.group.position.y < 1.25;
      const hidden = this.game.hiding || (this.playerCrouching?.() && dist > 3.2);
      const canSeePlayer =
        !hidden &&
        sameFloor &&
        dist < GAME_CONFIG.minionDetectRadius &&
        !this._lineBlockedWorld(m.x, m.z, playerPos.x, playerPos.z);
      let target = m.waypoint;
      let speed = m.speed;
      let nextState = 'patrol';
      if (canSeePlayer) {
        nextState = 'chase';
        target = playerPos;
        speed = GAME_CONFIG.minionChaseSpeed;
      } else if (m.state === 'chase' && dist > GAME_CONFIG.minionDetectRadius + 4) {
        nextState = 'patrol';
        m.waypoint = this._randomPlayablePoint(2);
        target = m.waypoint;
        speed = GAME_CONFIG.minionPatrolSpeed;
      }
      if (m.state !== nextState) {
        m.state = nextState;
        this._paintMinion(m);
      }
      if (
        m.state === 'chase' &&
        !m.webUsed &&
        dist < GAME_CONFIG.minionScreamRadius &&
        age > 3 &&
        playerPos.y - m.group.position.y < 1.2
      ) {
        m.webUsed = true;
        this._minionAlert(m, playerPos);
      }
      const arrived = this._minionSteer(m, target.x, target.z, speed, dt);
      if (arrived && m.state !== 'chase') {
        m.waypoint = this._randomPlayablePoint(2);
      }
      if (m.flashUntil > nowSec()) {
        const flashScale = 0.62 + Math.sin(nowSec() * 30) * 0.08;
        m.group.scale.setScalar(flashScale);
      } else {
        m.group.scale.setScalar(0.48);
      }
      const bobY = 1.0 + Math.sin(nowSec() * 2.2 + m.bob) * 0.12;
      m.group.position.set(m.x, bobY, m.z);
      m.group.rotation.y += dt * 0.8;
    }
  }

  _paintMinion(m) {
    const ghostMat = m.group.userData?.ghostMat;
    const aura = m.group.userData?.aura;
    if (m.state === 'chase') {
      if (ghostMat) {
        ghostMat.color.setHex(0xff8fa3);
        ghostMat.emissive.setHex(0x8f2233);
        ghostMat.emissiveIntensity = 0.6;
      }
      if (aura) {
        aura.material.color.setHex(0xff5d7a);
        aura.material.opacity = 0.5;
      }
    } else {
      if (ghostMat) {
        ghostMat.color.setHex(0x73d5cf);
        ghostMat.emissive.setHex(0x0f5f5a);
        ghostMat.emissiveIntensity = 0.2;
      }
      if (aura) {
        aura.material.color.setHex(0x46d5c5);
        aura.material.opacity = 0.22;
      }
    }
  }

  _minionSteer(m, tx, tz, speed, dt) {
    const dx = tx - m.x;
    const dz = tz - m.z;
    const dist = Math.hypot(dx, dz);
    if (m.state === 'chase') {
      if (dist < GAME_CONFIG.minionKeepDistance) {
        if (dist < 1.4) {
          const awayX = (m.x - tx) / (dist || 1);
          const awayZ = (m.z - tz) / (dist || 1);
          m.x += awayX * speed * 0.5 * dt;
          m.z += awayZ * speed * 0.5 * dt;
        }
        return false;
      }
    }
    if (dist < 0.55) return true;
    let angle = Math.atan2(dx, dz);
    if (nowSec() < m.hugUntil) {
      angle += m.hugDir * 0.95;
    } else if (this._lineBlockedWorld(m.x, m.z, tx, tz)) {
      m.hugDir = Math.random() < 0.5 ? -1 : 1;
      m.hugUntil = nowSec() + 0.55;
      angle += m.hugDir * 0.95;
    }
    const nx = m.x + Math.sin(angle) * speed * dt;
    const nz = m.z + Math.cos(angle) * speed * dt;
    if (!this._isInsidePlayable(nx, nz, 0.2)) {
      m.waypoint = this._randomPlayablePoint(2);
      m.hugUntil = nowSec() + 0.8;
      return false;
    }
    m.x = nx;
    m.z = nz;
    return false;
  }

  _minionAlert(m, playerPos) {
    this.events.emit('noise', { pos: { x: m.x, z: m.z }, radius: 26, rage: 0 });
    this.audio?.play('ghost');
    this.events.emit('camera.shake', { amount: 0.22 });
    this.events.emit('toast', { text: '巡逻幽灵尖叫了！鬼被引过来了！', ms: 1800 });
    this.events.emit('danmaku', { text: choice(['它叫人了！！', '快去高处甩掉它！']) });
    this._paintMinion({ ...m, state: 'chase' });
    this._throwMinionWeb(m, playerPos);
  }

  _throwMinionWeb(m, playerPos) {
    const travel = 0.38;
    const vel = this.playerBody?.velocity;
    const vx = vel?.x || 0;
    const vz = vel?.z || 0;
    let tx = playerPos.x + vx * travel;
    let tz = playerPos.z + vz * travel;
    const clamped = this._clampToPlayablePoint(tx, tz);
    tx = clamped.x;
    tz = clamped.z;
    const group = new THREE.Group();
    const webMat = new THREE.MeshBasicMaterial({
      color: 0xd7f2ff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, GAME_CONFIG.minionWebRadius, 32), webMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), webMat);
    center.position.y = 0.12;
    group.add(ring, center);
    group.position.set(m.x, 0.08, m.z);
    this.scene.group.add(group);
    const totalDist = Math.max(0.1, Math.hypot(tx - m.x, tz - m.z));
    this._ghostWebs.push({
      group,
      x: m.x,
      z: m.z,
      targetX: tx,
      targetZ: tz,
      speed: Math.max(11, totalDist / 0.38),
      state: 'flying',
      activeUntil: 0,
      startedAt: nowSec(),
      bound: false,
      ring,
      center
    });
    this.audio?.play('whoosh');
    this.events.emit('toast', { text: '幽灵网飞过来了！！快闪！', ms: 1600 });
  }

  _updateGhostWebs(dt, playerPos) {
    if (this.game.phase !== 'investigate') {
      this._clearMinions();
      return;
    }
    for (let i = this._ghostWebs.length - 1; i >= 0; i--) {
      const w = this._ghostWebs[i];
      if (w.state === 'flying') {
        const dx = w.targetX - w.x;
        const dz = w.targetZ - w.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.18 || nowSec() - w.startedAt > 0.9) {
          w.x = w.targetX;
          w.z = w.targetZ;
          w.state = 'active';
          w.activeUntil = nowSec() + GAME_CONFIG.minionWebLifetime;
        } else {
          const step = Math.min(dist, w.speed * dt);
          w.x += (dx / dist) * step;
          w.z += (dz / dist) * step;
        }
        w.group.position.set(w.x, 0.08, w.z);
      } else {
        w.ring.rotation.z += dt * 1.2;
        const pDist = distance2D(w.x, w.z, playerPos.x, playerPos.z);
        const canBind =
          pDist < GAME_CONFIG.minionWebRadius &&
          nowSec() < w.activeUntil &&
          !w.bound &&
          nowSec() >= this.game.dodgingUntil &&
          this.game.phase === 'investigate';
        if (canBind) {
          w.bound = true;
          this.game.playerStunUntil = Math.max(
            this.game.playerStunUntil,
            nowSec() + GAME_CONFIG.minionBindDuration
          );
          this.game.dodgingUntil = 0;
          this.game.stamina = Math.max(0, this.game.stamina - 12);
          this.audio?.play('slap');
          this.events.emit('camera.shake', { amount: 0.28 });
          this.events.emit('toast', {
            text: `幽灵网缠住你了！僵直 ${GAME_CONFIG.minionBindDuration.toFixed(1)} 秒！`,
            ms: 1800
          });
          this.events.emit('danmaku', {
            text: choice(['被网住了！！快挣脱！', '鬼网缠身！', '危险了危险了！'])
          });
          this.scene.spawnParticles({ x: w.x, y: 0.5, z: w.z }, '#d7f2ff');
          this.rage.addDrama(GAME_CONFIG.dramaHurt, 'web');
        }
        if (nowSec() >= w.activeUntil) {
          this.scene.group.remove(w.group);
          this._ghostWebs.splice(i, 1);
        }
      }
    }
  }

  _clampToPlayablePoint(x, z) {
    const c = this.scene.L.classroom;
    const co = this.scene.L.corridor;
    if (z > c.maxZ) {
      return {
        x: clamp(x, co.minX + 1.5, co.maxX - 1.5),
        z: clamp(z, co.minZ + 1.5, co.maxZ - 1.5)
      };
    }
    return {
      x: clamp(x, c.minX + 1.5, c.maxX - 1.5),
      z: clamp(z, c.minZ + 1.5, c.maxZ - 1.5)
    };
  }

  update(dt, playerPos) {
    if (!this.pawn) return;
    this._applyStageVisual(this.game.currentStage(), dt);
    this._updateTargetingUI(playerPos);
    if (!this.game.isPlaying()) return;
    const body = this.pawn.body;
    syncMeshToBody(this.pawn.mesh, body);
    this._slapCooldown = Math.max(0, this._slapCooldown - dt);
    this._speechTimer = Math.max(0, this._speechTimer - dt);
    this._flash = Math.max(0, this._flash - dt);
    const weakNow = this.game.weakUntil > nowSec();
    const baseScale = this._flash > 0 ? 1.22 : this._dashFlash > 0 ? 1.28 : 1;
    const squashed = this._isPinned();
    this.pawn.mesh.scale.set(
      squashed ? baseScale * 1.18 : baseScale,
      squashed ? baseScale * 0.5 : weakNow ? baseScale * 0.72 : baseScale,
      squashed ? baseScale * 1.18 : baseScale
    );
    this._dashFlash = Math.max(0, this._dashFlash - dt);

    if (this._isPinned()) {
      this.pawn.body.velocity.set(0, 0, 0);
    } else if (this.game.chainStuck) {
      this.pawn.body.velocity.set(0, 0, 0);
    } else if (this.game.broken) {
      this.pawn.body.velocity.set(0, 0, 0);
    } else if (weakNow) {
      this.pawn.body.velocity.set(0, 0, 0);
      if (this.game.phase === 'escape') {
        this.game.escapeTimer -= dt;
        if (this.game.escapeTimer <= 0) this._catchPlayer();
      }
    } else if (this._knockbackTimer > 0) {
      this._knockbackTimer -= dt;
      this.pawn.body.velocity.set(this._knockbackVX, 2, this._knockbackVZ);
    } else if (this._dashTimer > 0) {
      this._dashTimer -= dt;
      this._setVelocity(this._dashDirX * this._dashSpeed, this._dashDirZ * this._dashSpeed, dt);
    } else if (this._chargeActive) {
      if (nowSec() < this._chargeWindupUntil) {
        this.pawn.body.velocity.set(0, 0, 0);
      } else {
        this.pawn.body.velocity.set(
          this._chargeDirX * this._chargeSpeed,
          0,
          this._chargeDirZ * this._chargeSpeed
        );
      }
    } else if (this._throwActive) {
      if (nowSec() < this._throwTelegraphUntil) {
        this.pawn.body.velocity.set(0, 0, 0);
      } else {
        const b = this.pawn.body.position;
        const dx = playerPos.x - b.x;
        const dz = playerPos.z - b.z;
        const len = Math.hypot(dx, dz) || 1;
        this.pawn.body.velocity.set(
          (dx / len) * this._throwSpeed,
          0,
          (dz / len) * this._throwSpeed
        );
      }
    } else if (this._lookBackActive || this._wishActive || this._scareActive || this._telegraphActive) {
      this.pawn.body.velocity.set(0, 0, 0);
    } else {
      this._tryDash(dt, playerPos);
      if (this.game.phase === 'escape') {
        this._chase(playerPos, GHOST_CONFIG.finalChaseSpeed, dt);
        this.game.escapeTimer -= dt;
        if (this.game.escapeTimer <= 0) this._catchPlayer();
      } else {
        this._investigateAI(dt, playerPos);
      }
    }
    this._enforcePlayable(dt);

    if (this._spinTimer > 0) {
      this._spinTimer -= dt;
      this.pawn.mesh.rotation.y += dt * 14 * this._spinDir;
    }
    this._updateAttack(dt, playerPos);
    this._kiteCooldown = Math.max(0, this._kiteCooldown - dt);
    const armR = this.pawn.mesh.userData?.armR;
    const handR = this.pawn.mesh.userData?.handR;
    if (this._attackAnimTimer > 0) {
      this._attackAnimTimer -= dt;
      if (armR) {
        const t = 1 - Math.max(0, this._attackAnimTimer) / 0.45;
        armR.rotation.x = Math.sin(t * Math.PI) * 2.2;
        armR.rotation.z = -0.2;
      }
      if (handR) handR.position.set(0, -0.9, 1.0);
    } else if (armR && !this._telegraphActive && Math.abs(armR.rotation.x) > 0.01) {
      armR.rotation.x = 0;
      armR.rotation.z = -0.75;
      if (handR) handR.position.set(0, -0.66, 0);
    }

    const speed = Math.hypot(body.velocity.x, body.velocity.z);
    this._footprintTimer -= dt;
    if (speed > 0.3 && this._footprintTimer <= 0) {
      this.scene.addFootprint(body.position.x, body.position.z);
      this._footprintTimer = this.game.phase === 'escape' ? 0.28 : 0.65;
    }

    this._catchOrSlap(playerPos);
    this._updateMinions(dt, playerPos);
    this._updateGhostWebs(dt, playerPos);

    if (this.game.hiding) {
      this._hiddenTimer += dt;
      const hideThreshold = this.game.lockerHideCount >= 2 ? 6 : 2.5;
      if (this._hiddenTimer > hideThreshold) {
        this._lastSeen = null;
        this._lastNoise = null;
        this._searchTimer = 0;
        this._waypoint = this._pointAwayFromLocker();
      }
    } else {
      this._hiddenTimer = 0;
    }

    const py = playerPos.y;
    const gy = body.position.y;
    const heightDiff = py - gy;
    if (heightDiff > 0.25 && heightDiff < 0.8) {
      body.position.y += heightDiff * Math.min(1, dt * 2.5);
    } else if (heightDiff < -0.2) {
      body.position.y += heightDiff * Math.min(1, dt * 1.2);
    }

    const stage = this.game.currentStage();
    this._updateLookBack(dt, playerPos, stage);
    this._updateHiddenWish(dt, playerPos, stage);
    this._skillCooldown -= dt;
    if (this._ambushActive) {
      if (nowSec() < this._ambushUntil) {
        this.pawn.body.velocity.set(0, 0, 0);
      } else {
        this._ambushActive = false;
        const land = this._findValidLanding(playerPos.x, playerPos.z, 2.1, 4.5);
        this._placeGhost(land.x, land.z, 1.2);
        this.scene.spawnParticles({ x: land.x, y: 1, z: land.z }, '#9b8cff');
        this.scene.spawnHitRing({ x: land.x, y: 0.4, z: land.z }, '#9b8cff');
        this.audio?.play('ghost');
        this.events.emit('toast', { text: '鬼影突袭！它闪到你身边了！', ms: 1500 });
        this.events.emit('camera.shake', { amount: 0.35 });
      }
    } else if (
      this._skillCooldown <= 0 &&
      (stage.id === 'angry' || stage.id === 'furious' || stage.id === 'insane') &&
      this.game.phase === 'investigate' &&
      !this.game.hiding &&
      !this.game.chainActive &&
      !this._throwActive &&
      !this.game.ropeClimbing &&
      !this._disguiseActive
    ) {
      this._skillCooldown = rand(12, 18);
      this._ambushActive = true;
      this._ambushUntil = nowSec() + 0.8;
      const cfg = GHOST_CONFIG.stages.find(s => s.id === stage.id) || GHOST_CONFIG.stages[3];
      this._ambushSpeed = cfg.speed * 2.2;
      this.audio?.play('whoosh');
      this.events.emit('toast', { text: '它消失了……', ms: 1200 });
    }

    this._disguiseCooldown -= dt;
    if (this._disguiseActive) {
      if (this._disguiseMesh) this._disguiseMesh.rotation.y += dt * 1.5;
      const distToPlayer = distance2D(body.position.x, body.position.z, playerPos.x, playerPos.z);
      if (nowSec() >= this._disguiseUntil || distToPlayer < 2.6) {
        this._revealDisguise(playerPos);
      } else {
        body.velocity.set(0, 0, 0);
      }
    } else if (
      this._disguiseCooldown <= 0 &&
      (stage.id === 'angry' || stage.id === 'furious' || stage.id === 'insane') &&
      this.game.phase === 'investigate' &&
      !this.game.hiding &&
      !this.game.chainActive &&
      !this._throwActive &&
      !this.game.ropeClimbing &&
      !this._ambushActive
    ) {
      const distToPlayer = distance2D(body.position.x, body.position.z, playerPos.x, playerPos.z);
      if (distToPlayer > 6) this._startDisguise(playerPos);
    }

    const trying = Math.hypot(body.velocity.x, body.velocity.z) > 0.3;
    const moved = Math.hypot(
      body.position.x - this._lastStuckPos.x,
      body.position.z - this._lastStuckPos.z
    );
    if (trying && moved < 0.02) {
      this._stuckTime += dt;
    } else {
      this._stuckTime = 0;
    }
    this._lastStuckPos = { x: body.position.x, z: body.position.z };
    if (this._stuckTime > 0.6) {
      this._stuckTime = 0;
      this._moveOutOfWall();
      this._waypoint = this._randomPlayablePoint();
      this._lastSeen = null;
      this._lastNoise = null;
      this._searchTimer = 0;
    }
  }

  _moveOutOfWall() {
    const b = this.pawn.body.position;
    if (!this._isInsidePlayable(b.x, b.z)) {
      const land = this._randomPlayablePoint(2);
      this._placeGhost(land.x, land.z, b.y);
      this.scene.spawnParticles({ x: land.x, y: 1, z: land.z }, '#9b8cff');
      return;
    }
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 1.5 + Math.random() * 2.5;
      const tx = clamp(b.x + Math.cos(angle) * r, b.x - 4, b.x + 4);
      const tz = clamp(b.z + Math.sin(angle) * r, b.z - 4, b.z + 4);
      if (!this._isInsidePlayable(tx, tz)) continue;
      const from = v3(b.x, b.y + 0.5, b.z);
      const to = v3(tx, b.y + 0.5, tz);
      const hit = this.physics.raycastClosest(from, to, GROUPS.WORLD);
      if (!hit) {
        this._placeGhost(tx, tz, b.y);
        this.scene.spawnParticles({ x: tx, y: 1, z: tz }, '#9b8cff');
        return;
      }
    }
    const land = this._randomPlayablePoint(2);
    this._placeGhost(land.x, land.z, b.y);
    this.scene.spawnParticles({ x: land.x, y: 1, z: land.z }, '#9b8cff');
  }

  _tryDash(dt, playerPos) {
    if (this.game.hiding) return;
    if (this._isPinned()) return;
    if (this.game.chainStuck) return;
    if (this.game.broken) return;
    if (this._throwActive) return;
    if (this.game.chainActive) return;
    if (this.game.weakUntil > nowSec()) return;
    this._dashCooldown -= dt;
    if (this._dashCooldown > 0) return;
    const stage = this.game.currentStage();
    const idx = GHOST_CONFIG.stages.findIndex(s => s.id === stage.id);
    const b = this.pawn.body.position;
    const dist = distance2D(b.x, b.z, playerPos.x, playerPos.z);
    if (dist < 2.5 || dist > 14) return;
    if (Math.random() > dt * 0.55) return;
    const micro = idx < 2;
    const speed = micro
      ? (GHOST_CONFIG.stages[idx].speed || 1.35) * 1.35
      : (GHOST_CONFIG.stages[idx].speed || 2.6) * 1.8;
    const dx = playerPos.x - b.x;
    const dz = playerPos.z - b.z;
    const len = Math.hypot(dx, dz) || 1;
    this._dashDirX = dx / len;
    this._dashDirZ = dz / len;
    this._dashSpeed = speed;
    this._dashTimer = micro ? 0.22 : 0.38;
    this._dashCooldown = micro ? rand(4, 8) : rand(2.8, 5.5);
    this._dashFlash = micro ? 0.2 : 0.3;
    this.audio?.play('whoosh');
    if (!micro) this.events.emit('toast', { text: '鬼突然加速了！', ms: 1100 });
  }

  knockback(vx, vz, duration = 0.45) {
    this._knockbackVX = vx;
    this._knockbackVZ = vz;
    this._knockbackTimer = duration;
  }

  _updateLookBack(dt, playerPos, stage) {
    if (this.game.phase !== 'investigate') {
      this._lookBackActive = false;
      return;
    }
    if (this._lookBackActive) {
      if (nowSec() >= this._lookBackUntil) {
        this._lookBackActive = false;
        if (this._canSee(playerPos, stage)) {
          this._lastSeen = { x: playerPos.x, z: playerPos.z };
        }
        this._lookBackCooldown = rand(16, 28);
        return;
      }
      let diff = this._lookBackAngle - this._facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this._facing += diff * Math.min(1, dt * 8);
      this.pawn.mesh.rotation.y = this._facing;
      return;
    }
    this._lookBackCooldown -= dt;
    if (this._lookBackCooldown > 0) return;
    if (stage.id !== 'calm' && stage.id !== 'annoyed') return;
    if (
      this.game.hiding ||
      this.game.broken ||
      this.game.chainStuck ||
      this._isPinned() ||
      this.game.ropeClimbing ||
      this.game.ladderClimbing ||
      this._ambushActive ||
      this._disguiseActive ||
      this._wishActive ||
      this._telegraphActive ||
      this._throwActive
    ) return;
    const b = this.pawn.body.position;
    const dist = distance2D(b.x, b.z, playerPos.x, playerPos.z);
    if (dist < 0.5 || dist > stage.viewDist) return;
    if (Math.abs(playerPos.y - b.y) > 1.2) return;
    const dx = playerPos.x - b.x;
    const dz = playerPos.z - b.z;
    const facingX = Math.sin(this._facing);
    const facingZ = Math.cos(this._facing);
    const dot = (dx * facingX + dz * facingZ) / (dist || 1);
    if (dot > -0.25) return;
    this._lookBackActive = true;
    this._lookBackUntil = nowSec() + 0.8;
    this._lookBackAngle = Math.atan2(dx, dz) + rand(-0.3, 0.3);
  }

  _updateHiddenWish(dt, playerPos, stage) {
    if (this.game.phase !== 'investigate' || this.game.ghostWishHelped) return;
    const pen = this.scene.refs?.wishPen;
    if (!pen) return;
    const busy =
      this.game.hiding ||
      this.game.broken ||
      this.game.chainStuck ||
      this._isPinned() ||
      this.game.ropeClimbing ||
      this.game.ladderClimbing ||
      this._ambushActive ||
      this._disguiseActive ||
      this._lookBackActive ||
      this._telegraphActive ||
      this._chargeActive ||
      this._throwActive ||
      this._scareActive;
    if (!this._wishActive) {
      if (nowSec() < this._wishNextAt) return;
      const stageOk =
        stage.id === 'calm' ||
        stage.id === 'annoyed' ||
        (stage.id === 'angry' && !this._lastSeen && !this._lastNoise);
      const distPlayer = distance2D(
        this.pawn.body.position.x,
        this.pawn.body.position.z,
        playerPos.x,
        playerPos.z
      );
      if (busy || !stageOk || distPlayer < 4.5) {
        this._wishNextAt = nowSec() + 5;
        return;
      }
      this._wishActive = true;
      this._wishUntil = nowSec() + 7;
      this.events.emit('speech', {
        text: '……值日台的笔，还是去摆一下吧。',
        ms: 2400,
        name: '值日鬼'
      });
      return;
    }
    if (busy || nowSec() >= this._wishUntil) {
      this._wishActive = false;
      this._wishNextAt = nowSec() + rand(18, 28);
      return;
    }
    const b = this.pawn.body.position;
    const d = distance2D(b.x, b.z, pen.pos.x, pen.pos.z);
    if (d > 0.9) {
      this._goTo(pen.pos, Math.min(GHOST_CONFIG.stages[1].speed, 1.45), dt);
      return;
    }
    this.pawn.body.velocity.set(0, 0, 0);
    const faceAngle = Math.atan2(pen.pos.x - b.x, pen.pos.z - b.z);
    this._facing = faceAngle;
    this.pawn.mesh.rotation.y = faceAngle;
    if (!this.game.ghostWishKnocked) {
      this._knockWishPen();
      this._wishUntil = nowSec() + 2.4;
    }
    if (nowSec() >= this._wishUntil - 0.4) {
      this._wishActive = false;
      this._wishNextAt = nowSec() + rand(30, 50);
      this._waypoint = this._randomPlayablePoint();
    }
  }

  _knockWishPen() {
    const pen = this.scene.refs?.wishPen;
    if (!pen || pen.state === 'knocked') return;
    pen.state = 'knocked';
    pen.mesh.position.set(pen.neatX + 0.42, pen.neatY - 0.03, pen.neatZ + 0.38);
    pen.mesh.rotation.set(0.2, -0.8, 1.1);
    this.game.ghostWishKnocked = true;
    this.scene.spawnParticles({ x: pen.mesh.position.x, y: pen.neatY + 0.3, z: pen.mesh.position.z }, '#f4a261');
    this.scene.spawnHitRing({ x: pen.mesh.position.x, y: 0.3, z: pen.mesh.position.z }, '#f4a261');
    this.audio?.play('paper');
    this.events.emit('speech', { text: '……笔怎么又歪了。', ms: 2000, name: '值日鬼' });
  }

  acknowledgeWish(pos) {
    this._wishAckUntil = nowSec() + 4.5;
    this._wishAckPos = { x: pos.x, z: pos.z };
    this._wishActive = false;
    this._lastSeen = null;
    this._lastNoise = null;
    this._searchTimer = 0;
  }

  _updateAttack(dt, playerPos) {
    if (this.game.phase !== 'investigate') return;
    if (this._lookBackActive || this._wishActive) return;
    if (this.game.artifactGhostGrabAt > 0) return;
    if (
      this.game.hiding ||
      this.game.broken ||
      this.game.chainStuck ||
      this._isPinned()
    ) return;
    if (this._chargeActive) {
      this._updateCharge(dt, playerPos);
      return;
    }
    if (this._scareActive) {
      this._updateScare(dt, playerPos);
      return;
    }
    if (this._throwActive) {
      this._updateThrow(dt, playerPos);
      return;
    }
    const b = this.pawn.body.position;
    const dist = distance2D(b.x, b.z, playerPos.x, playerPos.z);

    if (this._telegraphActive) {
      const remaining = Math.max(0, this._telegraphUntil - nowSec()) / GAME_CONFIG.attackTelegraph;
      if (this._telegraphRing) {
        this._telegraphRing.position.set(b.x, 0.06, b.z);
        this._telegraphRing.visible = true;
        this._telegraphRing.scale.setScalar(0.85 + remaining * 0.3);
        this._telegraphRingMat.opacity = 0.3 + (1 - remaining) * 0.45;
      }
      if (this._parryRangeRing) {
        this._parryRangeRing.position.set(playerPos.x, 0.05, playerPos.z);
        this._parryRangeRing.visible = true;
        this._parryRangeMat.opacity = 0.18 + (1 - remaining) * 0.35;
      }
      const armR = this.pawn.mesh.userData?.armR;
      const armL = this.pawn.mesh.userData?.armL;
      const hand = this.pawn.mesh.userData?.handR;
      const t = 1 - remaining;
      if (armL) armL.rotation.x = -1.6;
      if (armR) {
        armR.rotation.x = -2.6 + t * 4.8;
        armR.rotation.z = -0.9 + t * 0.7;
      }
      if (hand) hand.position.set(0, 0.6 - t * 1.5, -0.6 + t * 1.6);
      if (nowSec() < this._telegraphUntil) {
        this._goTo(
          playerPos,
          GAME_CONFIG.swipeTelegraphSpeed,
          dt,
          GAME_CONFIG.swipeHitRange - 0.7
        );
        return;
      }
      if (!this._attackFired) {
        this._attackFired = true;
        this.audio?.play('whoosh');
        this.events.emit('camera.shake', { amount: 0.18 });
        this._hideAttackRings();
        this.scene.spawnSlashTrail(
          { x: b.x, y: 0, z: b.z },
          { x: playerPos.x, y: 0, z: playerPos.z },
          '#ff6b6b',
          0.45
        );
        this.scene.spawnAirSlash(
          {
            x: b.x + Math.sin(this._facing) * 0.8,
            y: 1.3,
            z: b.z + Math.cos(this._facing) * 0.8
          },
          { x: playerPos.x, y: 1.25, z: playerPos.z },
          '#ff6b6b',
          0.4
        );
        this.scene.spawnClawSwipe(
          {
            x: b.x + Math.sin(this._facing) * 1.0,
            y: 0.95,
            z: b.z + Math.cos(this._facing) * 1.0
          },
          this._facing,
          '#9fc0a8',
          0.45
        );
        this._attackAnimTimer = 0.45;
        const arm = this.pawn.mesh.userData?.armR;
        const hand = this.pawn.mesh.userData?.handR;
        if (arm) {
          arm.rotation.x = 2.2;
          arm.rotation.z = -0.2;
        }
        if (hand) hand.position.set(0, -0.9, 1.0);
        if (
          dist < GAME_CONFIG.swipeHitRange &&
          playerPos.y - b.y < 0.95 &&
          nowSec() >= this.game.dodgingUntil
        ) {
          this._doGhostSwipe(playerPos);
        } else {
          this.rage.addDrama(GAME_CONFIG.dramaPerfectDodge, 'dodgeAttack');
          this.events.emit('toast', { text: '鬼扑空了！！', ms: 1200 });
          this.events.emit('slowmo', { ms: 180 });
          this.events.emit('danmaku', {
            text: choice(['好闪！！', '鬼扑空了哈哈哈', '这走位有点东西'])
          });
          this._speak('人呢？！', 1400);
        }
      }
      if (nowSec() >= this._attackUntil) {
        this._telegraphActive = false;
        this._attackFired = false;
        this._hideAttackRings();
        this._scheduleNextAttack(playerPos);
      }
      return;
    }

    this._pressureTime += dt;
    if (dist < 3) {
      if (this._pressureTime > 1.2) this._attackCooldown = 0;
    } else {
      this._pressureTime = 0;
    }

    const stage = this.game.currentStage();
    const highRage = stage.id === 'furious' || stage.id === 'insane';
    const rangeMap = { calm: 4, annoyed: 4.5, angry: 5.5, furious: 7, insane: 9 };
    const attackRange = rangeMap[stage.id] || 5;
    if (this._attackCooldown > 0) {
      this._attackCooldown -= dt * (highRage ? 3 : 1);
    }
    if (this._attackCooldown > 0) return;
    if (dist > attackRange) return;

    const scareThreshold = stage.id === 'insane'
      ? GAME_CONFIG.scareThresholdInsane
      : stage.id === 'furious'
        ? GAME_CONFIG.scareThresholdFurious
        : stage.id === 'angry'
          ? GAME_CONFIG.scareThresholdAngry
          : 0;
    if (
      scareThreshold > 0 &&
      this.game.stamina < scareThreshold &&
      nowSec() - this._lastScareAt > 10
    ) {
      this._startScare(playerPos);
      return;
    }
    const throwChance = stage.id === 'insane'
      ? 0.2
      : stage.id === 'furious'
        ? 0.15
        : 0;
    if (dist < 4 && Math.random() < throwChance) {
      this._startThrow(playerPos, stage);
      return;
    }
    const chargeChance = {
      calm: 0,
      annoyed: 0,
      angry: 0.3,
      furious: 0.35,
      insane: 0.4
    }[stage.id] || 0;
    const comboChargeChance = this._comboCount > 0
      ? Math.min(0.82, chargeChance * 2.4 + 0.2)
      : chargeChance;
    const preferredCharge = dist > 3.5 && chargeChance > 0 ? 0.65 : chargeChance;
    const finalChargeChance = this._comboCount > 0 && dist > 1.6
      ? comboChargeChance
      : preferredCharge;
    if (dist > 1.6 && Math.random() < finalChargeChance) {
      this._startCharge(playerPos, stage);
      return;
    }
    this._startSwipe(playerPos);
  }

  _scheduleNextAttack(playerPos, allowCombo = true) {
    const stage = this.game.currentStage();
    const rageOk = stage.id === 'angry' || stage.id === 'furious' || stage.id === 'insane';
    const maxed = this._comboCount >= GAME_CONFIG.ghostComboMax;
    const roll = Math.random() < GAME_CONFIG.ghostComboChance;
    if (allowCombo && rageOk && !maxed && roll) {
      this._comboCount += 1;
      this._attackCooldown = GAME_CONFIG.ghostComboRush + Math.random() * 0.12;
      if (this._comboCount >= 2) {
        this.events.emit('toast', {
          text: `鬼开始连招了！！第 ${this._comboCount} 击马上来！`,
          ms: 1300
        });
        this.events.emit('danmaku', {
          text: choice(['它居然会连招？！', '这鬼练过！', '注意下一招！'])
        });
        this._speak('还没完呢！！', 1300);
      }
      return;
    }
    this._comboCount = 0;
    this._attackCooldown = rand(
      GAME_CONFIG.ghostAttackCooldownMin,
      GAME_CONFIG.ghostAttackCooldownMax
    );
  }

  _startSwipe(playerPos) {
    this._telegraphActive = true;
    this._lastAttackKind = 'swipe';
    this._pressureTime = 0;
    this._attackFired = false;
    this._telegraphUntil = nowSec() + GAME_CONFIG.attackTelegraph;
    this._attackUntil = nowSec() + GAME_CONFIG.attackTelegraph + GAME_CONFIG.attackWindup;
    this._dashFlash = 0.3;
    this.audio?.play('ghost');
    this.events.emit('ghost.telegraph', { until: this._telegraphUntil });
    if (this._telegraphRing) this._telegraphRing.visible = true;
    if (this._parryRangeRing) this._parryRangeRing.visible = true;
    this.events.emit('toast', {
      text: this.game.whipMode
        ? '鬼要挥爪了！左键拼文具，或短按 Shift 翻滚闪开！'
        : '鬼要挥爪了！按 G 切鞭子拼文具，或短按 Shift 翻滚闪开！',
      ms: 1400
    });
  }

  _startCharge(playerPos, stage) {
    const b = this.pawn.body.position;
    const dx = playerPos.x - b.x;
    const dz = playerPos.z - b.z;
    const len = Math.hypot(dx, dz) || 1;
    this._chargeActive = true;
    this._lastAttackKind = 'charge';
    this._pressureTime = 0;
    this._chargeWindupUntil = nowSec() + GAME_CONFIG.chargeWindup;
    this._chargeUntil = this._chargeWindupUntil + GAME_CONFIG.chargeDuration;
    this._chargeDirX = dx / len;
    this._chargeDirZ = dz / len;
    this._chargeSpeed = Math.max(
      7,
      (stage.speed || 2.6) * GAME_CONFIG.chargeSpeedMultiplier
    );
    this._chargeHitDone = false;
    this._dashFlash = 0.35;
    this.audio?.play('whoosh');
    if (this._telegraphRing) {
      this._telegraphRing.position.set(b.x, 0.06, b.z);
      this._telegraphRing.visible = true;
    }
    this.events.emit('toast', {
      text: '它在原地蓄力，要撞过来了！短按 Shift 翻滚闪开！',
      ms: 1600
    });
  }

  _updateCharge(dt, playerPos) {
    if (nowSec() < this._chargeWindupUntil) return;
    const b = this.pawn.body.position;
    const dist = distance2D(b.x, b.z, playerPos.x, playerPos.z);
    if (!this._chargeHitDone && dist < 1.25 && nowSec() >= this.game.dodgingUntil) {
      this._chargeHitDone = true;
      this._doGhostChargeHit(playerPos);
    } else if (nowSec() < this.game.dodgingUntil && dist < 1.6) {
      this._chargeHitDone = true;
      this.rage.addDrama(GAME_CONFIG.dramaPerfectDodge, 'dodgeCharge');
      this.events.emit('toast', { text: '你翻滚闪开了撞击！！', ms: 1200 });
      this.events.emit('slowmo', { ms: 220 });
      this.events.emit('danmaku', {
        text: choice(['这翻滚满分！', '撞击被滚开了！！', '主播会玩'])
      });
    }
    if (nowSec() >= this._chargeUntil) {
      this._chargeActive = false;
      this._hideAttackRings();
      this._scheduleNextAttack(playerPos, !this._chargeHitDone);
    }
  }

  _doGhostChargeHit(playerPos) {
    this.game.stamina = Math.max(0, this.game.stamina - GAME_CONFIG.chargeStaminaCost);
    this.game.playerStunUntil = nowSec() + 1.2;
    this.game.ghostScore = (this.game.ghostScore || 0) + 80;
    this.game.dodgingUntil = 0;
    if (this.playerBody) {
      const b = this.pawn.body.position;
      const dx = playerPos.x - b.x;
      const dz = playerPos.z - b.z;
      const len = Math.hypot(dx, dz) || 1;
      this.playerBody.velocity.set((dx / len) * 11, 4, (dz / len) * 11);
    }
    this.audio?.play('slap');
    this.events.emit('toast', {
      text: `被撞飞了！体力-${GAME_CONFIG.chargeStaminaCost}，僵直了！`,
      ms: 1600
    });
    this.events.emit('danmaku', {
      text: choice(['被撞飞了哈哈哈哈', '这一撞值50体力', '主播飞起来了！'])
    });
    this.events.emit('player.hurt');
    this.events.emit('camera.shake', { amount: 0.42 });
    this.events.emit('hitstop', { ms: 80 });
    this.rage.addDrama(GAME_CONFIG.dramaHurt, 'charge');
    this._speak('让开！！', 1400);
  }

  _startThrow(playerPos, stage) {
    this._throwActive = true;
    this._lastAttackKind = 'throw';
    this._pressureTime = 0;
    this._throwTelegraphUntil = nowSec() + 0.8;
    this._throwComboUntil = 0;
    this._throwHits = 0;
    this._throwHitCooldownUntil = 0;
    this._throwSpeed = Math.max(
      7,
      (stage.speed || 2.6) * GAME_CONFIG.throwSpeedMultiplier
    );
    this._dashFlash = 0.35;
    this.audio?.play('ghost');
    if (this._telegraphRing) {
      const b = this.pawn.body.position;
      this._telegraphRing.position.set(b.x, 0.06, b.z);
      this._telegraphRing.visible = true;
    }
    const armL = this.pawn.mesh.userData?.armL;
    const armR = this.pawn.mesh.userData?.armR;
    const hand = this.pawn.mesh.userData?.handR;
    if (armL) armL.rotation.x = -1.8;
    if (armR) {
      armR.rotation.x = -1.8;
      armR.rotation.z = -0.2;
    }
    if (hand) hand.position.set(0, 0.7, 0.4);
    this.events.emit('toast', {
      text: '它要把你抛上天了！！快按方向键躲开！',
      ms: 1800
    });
  }

  _updateThrow(dt, playerPos) {
    if (nowSec() < this._throwTelegraphUntil) return;
    if (this._throwComboUntil === 0) {
      const b = this.pawn.body.position;
      const dist = distance2D(b.x, b.z, playerPos.x, playerPos.z);
      if (dist > 4.5 || nowSec() < this.game.dodgingUntil) {
        this._throwActive = false;
        this._hideAttackRings();
        this.rage.addDrama(GAME_CONFIG.dramaPerfectDodge, 'throwMiss');
        this.events.emit('toast', { text: '它抓空了！！', ms: 1400 });
        this.events.emit('danmaku', {
          text: choice(['抛飞失败哈哈哈', '主播躲开了！！'])
        });
        this._scheduleNextAttack(playerPos, false);
        return;
      }
      this._throwComboUntil = nowSec() + GAME_CONFIG.throwComboDuration;
      this._throwHitCooldownUntil = nowSec() + 0.9;
      this.game.thrownUntil = nowSec() + GAME_CONFIG.thrownDuration;
      this.game.thrownByGhost = true;
      const dx = playerPos.x - b.x;
      const dz = playerPos.z - b.z;
      const len = Math.hypot(dx, dz) || 1;
      if (this.playerBody) {
        this.playerBody.velocity.set(
          (dx / len) * GAME_CONFIG.throwLaunchPower,
          GAME_CONFIG.throwLaunchVy,
          (dz / len) * GAME_CONFIG.throwLaunchPower
        );
      }
      this.events.emit('hitstop', { ms: 90 });
      this.events.emit('camera.shake', { amount: 0.45 });
      this.events.emit('toast', { text: '抛飞了！！空中三连击来了！', ms: 1800 });
      this.events.emit('danmaku', {
        text: choice(['上天了！！', '鬼会飞！！', '快按方向键躲！'])
      });
      return;
    }
    const b = this.pawn.body.position;
    const dist = distance2D(b.x, b.z, playerPos.x, playerPos.z);
    if (
      this._throwHits < 3 &&
      nowSec() >= this._throwHitCooldownUntil &&
      dist < 2.4 &&
      nowSec() >= this.game.dodgingUntil
    ) {
      this._throwHits += 1;
      this._throwHitCooldownUntil = nowSec() + 0.35;
      this._doThrowHit(playerPos);
    }
    if (nowSec() >= this._throwComboUntil || this.game.thrownUntil <= nowSec()) {
      this._throwActive = false;
      this._hideAttackRings();
      this._scheduleNextAttack(playerPos);
    }
  }

  _doThrowHit(playerPos) {
    this.game.stamina = Math.max(0, this.game.stamina - GAME_CONFIG.throwStaminaCostPerHit);
    this.game.ghostScore = (this.game.ghostScore || 0) + 40;
    if (this.playerBody) {
      const b = this.pawn.body.position;
      const dx = playerPos.x - b.x;
      const dz = playerPos.z - b.z;
      const len = Math.hypot(dx, dz) || 1;
      this.playerBody.velocity.set((dx / len) * 6, 5, (dz / len) * 6);
    }
    this.audio?.play('slap');
    this.events.emit('toast', {
      text: `空中三连击 x${this._throwHits}！体力-${GAME_CONFIG.throwStaminaCostPerHit}`,
      ms: 1200
    });
    this.events.emit('camera.shake', { amount: 0.35 });
    this.events.emit('hitstop', { ms: 70 });
    this.rage.addDrama(GAME_CONFIG.dramaHurt, 'throwHit');
    this.events.emit('danmaku', {
      text: choice(['空中三连击！！', '这鬼会飞！', '666 打得好惨'])
    });
  }

  _startScare(playerPos) {
    this._scareActive = true;
    this._pressureTime = 0;
    this._scareUntil = nowSec() + 0.9;
    this._dashFlash = 0.4;
    this.audio?.play('ghost');
    if (this._telegraphRing) {
      const b = this.pawn.body.position;
      this._telegraphRing.position.set(b.x, 0.06, b.z);
      this._telegraphRing.visible = true;
    }
    this.events.emit('toast', {
      text: '它要鬼脸震慑了！快翻滚或用 V 闪光打断！',
      ms: 1800
    });
  }

  _updateScare(dt, playerPos) {
    if (nowSec() < this.game.dodgingUntil || nowSec() < this.game.stunnedUntil) {
      this._scareActive = false;
      this._hideAttackRings();
      this.rage.addDrama(GAME_CONFIG.dramaPerfectDodge, 'scareBreak');
      this.events.emit('toast', { text: '鬼脸震慑被打破了！！', ms: 1400 });
      this.events.emit('danmaku', {
        text: choice(['震慑被打断了！', '观众：好险！！', '闪光灯立大功'])
      });
      this._comboCount = 0;
      this._attackCooldown = rand(
        GAME_CONFIG.ghostAttackCooldownMin,
        GAME_CONFIG.ghostAttackCooldownMax
      );
      return;
    }
    if (nowSec() < this._scareUntil) return;
    const b = this.pawn.body.position;
    const dist = distance2D(b.x, b.z, playerPos.x, playerPos.z);
    this._scareActive = false;
    this._hideAttackRings();
    this._lastScareAt = nowSec();
    this._comboCount = 0;
    this._attackCooldown = rand(
      GAME_CONFIG.ghostAttackCooldownMin,
      GAME_CONFIG.ghostAttackCooldownMax
    );
    if (dist <= 3.0 && playerPos.y - b.y < 0.8 && nowSec() >= this.game.dodgingUntil) {
      this._capturePlayer(playerPos);
    } else {
      this.rage.addDrama(GAME_CONFIG.dramaPerfectDodge, 'scareMiss');
      this.events.emit('toast', { text: '鬼脸扑空了！', ms: 1200 });
    }
  }

  _capturePlayer(playerPos) {
    if (this._caught) return;
    if (this.game.freePass > 0) {
      this.game.freePass -= 1;
      this.game.invincibleUntil = nowSec() + 1.0;
      this.events.emit('toast', { text: '主管免责卡生效！这次不算！', ms: 2000 });
      this.events.emit('danmaku', {
        text: choice(['免责卡救命！！', '主管这次没扣钱！'])
      });
      return;
    }
    if (this.game.lives > 0) {
      this.game.lives -= 1;
      this.game.ghostScore = (this.game.ghostScore || 0) + 150;
      this.game.invincibleUntil = nowSec() + 2.2;
      if (this.playerBody) {
        const b = this.pawn.body.position;
        const dx = playerPos.x - b.x;
        const dz = playerPos.z - b.z;
        const len = Math.hypot(dx, dz) || 1;
        this.playerBody.velocity.set((dx / len) * 9, 4, (dz / len) * 9);
      }
      this._lastSeen = null;
      this._lastNoise = null;
      this._searchTimer = 0;
      this._waypoint = this._pointAwayFromLocker();
      this.audio?.play('slap');
      this.events.emit('player.hurt');
      this.events.emit('camera.shake', { amount: 0.45 });
      this.events.emit('hitstop', { ms: 90 });
      this.rage.addDrama(GAME_CONFIG.dramaHurt, 'caught');
      this.events.emit('danmaku', {
        text: choice(['完蛋，工资没了！', '鬼脸震慑成功！！', '容错-1 悲'])
      });
      if (this.game.lives <= 0) {
        this._catchPlayer();
        return;
      }
      this.events.emit('toast', {
        text: `它把你抓住了！还剩 ${this.game.lives} 次机会`,
        ms: 2200
      });
      this._speak('你跑不掉的……咦，你好臭。', 1800);
      return;
    }
    this._catchPlayer();
  }

  _hideAttackRings() {
    if (this._telegraphRing) this._telegraphRing.visible = false;
    if (this._parryRangeRing) this._parryRangeRing.visible = false;
  }

  _doGhostSwipe(playerPos) {
    this._slapCooldown = GAME_CONFIG.slapCooldown;
    this.game.invincibleUntil = nowSec() + 1.0;
    this.game.ghostScore = (this.game.ghostScore || 0) + 60;
    this.rage.add(GHOST_CONFIG.rage.slap, 'slap');
    this.game.stamina = Math.max(0, this.game.stamina - GAME_CONFIG.swipeStaminaCost);
    if (this.playerBody) {
      const b = this.pawn.body.position;
      const dx = playerPos.x - b.x;
      const dz = playerPos.z - b.z;
      const len = Math.hypot(dx, dz) || 1;
      this.playerBody.velocity.set((dx / len) * 7, 4, (dz / len) * 7);
    }
    this.audio?.play('slap');
    this.events.emit('toast', {
      text: `鬼一巴掌呼过来！体力-${GAME_CONFIG.swipeStaminaCost}`,
      ms: 1800
    });
    this.events.emit('player.hurt');
    this.events.emit('camera.shake', { amount: 0.32 });
    this.rage.addDrama(GAME_CONFIG.dramaHurt, 'hurt');
    this._speak('别在教室里乱跑！', 1800);
  }

  parrySucceeded() {
    if (!this._telegraphActive || nowSec() >= this._telegraphUntil) return false;
    this._telegraphActive = false;
    this._attackFired = false;
    this._hideAttackRings();
    this._comboCount = 0;
    this._attackCooldown = rand(
      GAME_CONFIG.ghostAttackCooldownMin,
      GAME_CONFIG.ghostAttackCooldownMax
    );
    this.game.parryCount += 1;
    this.game.comboWindowUntil = nowSec() + 1.0;
    this.rage.addComposure(GAME_CONFIG.composureParry, 'parry');
    this.rage.addDrama(GAME_CONFIG.dramaParry, 'parry');
    const stage = this.game.currentStage();
    const rageCut = stage.id === 'insane' ? 15 : 8;
    this.rage.reduce(rageCut, 'parry');
    if (stage.id === 'insane') {
      this.events.emit('toast', {
        text: '满怒也能拼！它被你打回暴怒了！',
        ms: 2200
      });
    } else {
      this.events.emit('toast', {
        text: `拼刀成功！怒气 -${rageCut}`,
        ms: 1400
      });
    }
    const p = this.playerPos();
    const b = this.pawn.body.position;
    const dx = b.x - p.x;
    const dz = b.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    this.scene.spawnSlashTrail(
      { x: p.x, y: 0, z: p.z },
      { x: b.x, y: 0, z: b.z },
      '#ffffff',
      0.5
    );
    this.scene.spawnAirSlash(
      { x: p.x, y: 1.25, z: p.z },
      { x: b.x, y: 1.25, z: b.z },
      '#ffffff',
      0.5
    );
    this.scene.spawnHitRing(
      { x: (p.x + b.x) / 2, y: 1, z: (p.z + b.z) / 2 },
      '#ffffff'
    );
    this._attackAnimTimer = 0.3;
    const arm = this.pawn.mesh.userData?.armR;
    const hand = this.pawn.mesh.userData?.handR;
    if (arm) {
      arm.rotation.x = 2.2;
      arm.rotation.z = -0.2;
    }
    if (hand) hand.position.set(0, -0.9, 1.0);
    this.knockback((dx / len) * 9, (dz / len) * 9, 0.5);
    this._spinTimer = 0.8;
    this.game.stunnedUntil = nowSec() + 1.2;
    this.events.emit('hitstop', { ms: 110 });
    this.events.emit('slowmo', { ms: 280 });
    this.events.emit('camera.shake', { amount: 0.4 });
    this.events.emit('act.card', { title: '拼文具成功！！', line: '它的攻击被你弹开了！' });
    this.events.emit('danmaku', {
      text: choice(['这拼刀能上年度集锦！！', '好快的反应！！', '鬼：我裂开了'])
    });
    this.audio?.play('whip');
    this._speak('疼疼疼！！', 1600);
    return true;
  }

  registerKnockdown() {
    if (this.game.broken || !this.game.isPlaying()) return;
    this.rage.addComposure(GAME_CONFIG.composureKnockdown, 'knockdown');
    this.rage.addDrama(GAME_CONFIG.dramaKnockdown, 'knockdown');
  }

  _registerKite() {
    if (this._kiteCooldown > 0 || !this.game.isPlaying()) return;
    this._kiteCooldown = 8;
    this.game.kiteCount += 1;
    this.rage.addComposure(GAME_CONFIG.composureKite, 'kite');
    this.rage.addDrama(GAME_CONFIG.dramaKite, 'kite');
    this.events.emit('toast', { text: '你把它溜傻了！心态大幅下降', ms: 1800 });
    this._speak('人呢？？人呢！！', 1600);
  }

  performFinisher() {
    if (this.game.phase !== 'investigate') return;
    if (!this.game.broken && !this.game.chainPinned) return;
    if (!this.game.hasItem('stapler')) {
      this.events.emit('toast', { text: '订书机都不带，处决个寂寞！', ms: 1800 });
      this.events.emit('danmaku', { text: '没订书机也想处决？' });
      return;
    }
    this.game.broken = false;
    this.game.finisherDone = true;
    this.rage.addDrama(GAME_CONFIG.dramaFinisher, 'finisher');
    this.events.emit('hitstop', { ms: 130 });
    this.events.emit('slowmo', { ms: 500 });
    this.events.emit('act.card', {
      title: '喜剧处决！！',
      line: choice(this._finisherLines())
    });
    this.events.emit('danmaku.burst');
    this.audio?.play('win');
    this._sealSuccess('finisher');
    this.game.stamina = Math.min(
      this.game.staminaMax,
      this.game.stamina + GAME_CONFIG.staminaFinisherReward
    );
  }

  _finisherLines() {
    const lines = ['钉进成绩单！', '塞进垃圾桶！！', '拖去擦黑板！！！'];
    const u = this.economy?.unlocks || {};
    if (u.finisher_toilet) lines.push('塞进马桶冲走！！');
    if (u.finisher_fan) lines.push('挂到吊扇上转圈！！');
    if (u.finisher_report) lines.push('用成绩单扇它脸！！');
    return lines;
  }

  _startDisguise(playerPos) {
    const land = this._findValidLanding(playerPos.x, playerPos.z, 4, 7);
    const x = land.x;
    const z = land.z;
    this._placeGhost(x, z, 1.2);
    this.pawn.mesh.visible = false;
    this._disguiseMesh = makePropMesh('trashCan');
    this._disguiseMesh.position.set(x, 0, z);
    this.scene.group.add(this._disguiseMesh);
    this._disguiseActive = true;
    this._disguiseUntil = nowSec() + 10;
    this._disguiseCooldown = rand(14, 22);
    this.audio?.play('ghost');
    this.events.emit('toast', { text: '它消失了……教室里多了一个垃圾桶？', ms: 2000 });
  }

  _revealDisguise(playerPos) {
    if (this._disguiseMesh) {
      this.scene.group.remove(this._disguiseMesh);
      this._disguiseMesh = null;
    }
    this.pawn.mesh.visible = true;
    this._disguiseActive = false;
    this._placeGhost(playerPos.x, playerPos.z, 1.2);
    this.audio?.play('ghost');
    this.events.emit('camera.shake', { amount: 0.4 });
    this.events.emit('hitstop', { ms: 80 });
    this.events.emit('toast', { text: '那个垃圾桶是鬼！！', ms: 1800 });
  }

  _applyStageVisual(stage, dt) {
    const v = GHOST_VISUALS[stage.id] || GHOST_VISUALS.calm;
    if (this._visualStage !== stage.id) {
      this._visualStage = stage.id;
      this.events.emit('ghost.visual', {
        stage: stage.id,
        label: stage.label,
        danger: v.danger,
        flames: v.flames
      });
    }
    const parts = this.pawn.mesh.userData;
    if (parts.ghostMat) {
      parts.ghostMat.color.setHex(v.color);
      parts.ghostMat.emissive.setHex(v.emissive);
      parts.ghostMat.emissiveIntensity = v.intensity;
      parts.ghostMat.needsUpdate = true;
    }
    if (parts.aura) {
      parts.aura.material.color.setHex(v.aura);
      parts.aura.material.opacity = v.auraOpacity;
    }
    if (this.game.weakUntil > nowSec()) {
      parts.ghostMat.color.setHex(0xa9c6dc);
      parts.ghostMat.emissive.setHex(0x1d4e89);
      parts.ghostMat.emissiveIntensity = 0.35;
      if (parts.aura) {
        parts.aura.material.color.setHex(0x6fa8dc);
        parts.aura.material.opacity = 0.2;
      }
    }
    if (this._ambushActive) {
      parts.ghostMat.transparent = true;
      parts.ghostMat.opacity = 0.25;
    } else {
      parts.ghostMat.transparent = false;
      parts.ghostMat.opacity = 1;
    }
    this._updateFlames(dt, v.flames);
  }

  _updateFlames(dt, active) {
    const flames = this.pawn.mesh.userData.flames;
    if (!flames) return;
    this._flameTime += dt;
    for (const flame of flames.children) {
      flame.visible = active;
      if (!active) continue;
      const o = flame.userData.offset;
      const t = this._flameTime * o.speed + o.angle;
      flame.position.set(
        Math.sin(t) * 0.65,
        1.0 + ((o.rise + this._flameTime * 0.8) % 1) * 0.55,
        Math.cos(t * 0.8) * 0.55
      );
      flame.rotation.z = Math.sin(t * 2) * 0.3;
      flame.scale.setScalar(0.8 + Math.sin(t * 3) * 0.3);
    }
  }

  _investigateAI(dt, playerPos) {
    const stage = this.game.currentStage();
    const cfg = GHOST_CONFIG.stages.find(s => s.id === stage.id) || GHOST_CONFIG.stages[0];
    let speed = cfg.speed;
    if (this.game.weakUntil > nowSec()) speed = 0;
    if (this.game.slowedUntil > nowSec()) speed *= 0.45;
    if (this.game.stunnedUntil > nowSec()) speed = 0;
    if (this._isPinned()) speed = 0;
    if (this.game.chainStuck) speed = 0;
    if (this.game.broken) {
      this._setVelocity(0, 0, 0);
      return;
    }
    if (
      this.game.huntActive ||
      this.game.bellPhaseActive ||
      this.game.artifactGhostBoostUntil > nowSec() ||
      this.game.ghostSpeedBoostUntil > nowSec()
    ) {
      speed *= 1.25;
    }

    if (this._wishAckUntil > nowSec() && this._wishAckPos) {
      const ack = this._wishAckPos;
      const arrived = this._goTo(ack, speed * 0.85, dt);
      if (arrived) {
        this._wishAckUntil = 0;
        this._wishAckPos = null;
        this.events.emit('speech', { text: '……谢了。', ms: 1500, name: '值日鬼' });
        this.audio?.play('paper');
      }
      return;
    }

    if (this.game.artifactGhostGrabAt > 0) {
      this._setVelocity(0, 0, 0);
      return;
    }

    if (
      this.game.artifactActive &&
      this.game.artifactStage >= 2 &&
      this.game.artifactCircle &&
      !this.game.artifactSecured
    ) {
      this._goTo(
        { x: this.game.artifactCircle.x, z: this.game.artifactCircle.z },
        speed,
        dt
      );
      return;
    }

    if (this.game.chainActive && this.game.chainStep === 'lure') {
      const target = this._lastNoise;
      if (target) this._goTo(target, speed, dt);
      return;
    }

    if (stage.id === 'furious' || stage.id === 'insane') {
      this._chase(playerPos, speed, dt);
      return;
    }

    const sees = this._canSee(playerPos, stage);
    if (sees && stage.id === 'angry') {
      this._lastSeen = { x: playerPos.x, z: playerPos.z };
      this._chase(playerPos, speed, dt);
      return;
    }
    if (sees && (stage.id === 'annoyed' || stage.id === 'calm')) {
      this._lastNoise = { x: playerPos.x, z: playerPos.z };
    }

    if (this._lastSeen) {
      const arrived = this._goTo(this._lastSeen, speed, dt);
      if (arrived) {
        this._lastSeen = null;
        this._searchTimer = 2.2;
        const b = this.pawn.body.position;
        const d = distance2D(playerPos.x, playerPos.z, b.x, b.z);
        if (d > 5) this._registerKite();
      }
      return;
    }
    if (this._lastNoise) {
      const arrived = this._goTo(this._lastNoise, speed, dt);
      if (arrived) this._lastNoise = null;
      return;
    }
    if (this._searchTimer > 0) {
      this._searchTimer -= dt;
      this._setVelocity(0, 0, 0);
      return;
    }

    this._patrol(dt, speed);
  }

  _patrol(dt, speed) {
    const b = this.pawn.body.position;
    if (!this._waypoint) {
      this._waypoint = this._randomClassroomPoint();
    }
    const dist = distance2D(b.x, b.z, this._waypoint.x, this._waypoint.z);
    if (dist < 0.7) {
      this._waypoint = this._randomClassroomPoint();
      return;
    }
    this._goTo(this._waypoint, speed, dt);
  }

  _randomClassroomPoint() {
    return this._randomPlayablePoint(1.4);
  }

  _pointAwayFromLocker() {
    const locker = this.scene.refs?.locker;
    for (let i = 0; i < 8; i++) {
      const p = this._randomClassroomPoint();
      if (!locker || distance2D(p.x, p.z, locker.pos.x, locker.pos.z) > 3) return p;
    }
    return this._randomClassroomPoint();
  }

  _goTo(target, speed, dt, stopDist = 0.45) {
    const b = this.pawn.body.position;
    const dx = target.x - b.x;
    const dz = target.z - b.z;
    const dist = Math.hypot(dx, dz);
    if (dist < stopDist) {
      this._setVelocity(0, 0, 0);
      return true;
    }
    let angle = Math.atan2(dx, dz);
    if (nowSec() < this._wallHugUntil) {
      angle += this._wallHugDir * 1.05;
    } else if (this._lineBlockedWorld(b.x, b.z, target.x, target.z)) {
      this._wallHugDir = Math.random() < 0.5 ? -1 : 1;
      this._wallHugUntil = nowSec() + 0.6;
      angle += this._wallHugDir * 1.05;
    }
    const vx = Math.sin(angle) * speed;
    const vz = Math.cos(angle) * speed;
    this._setVelocity(vx, vz, dt);
    const nx = b.x + vx * dt;
    const nz = b.z + vz * dt;
    if (!this._isInsidePlayable(nx, nz, 0.2)) {
      this._setVelocity(0, 0, 0);
      this._wallHugUntil = nowSec() + 0.8;
      this._wallHugDir *= -1;
    }
    return false;
  }

  _chase(playerPos, speed, dt) {
    const b = this.pawn.body.position;
    const dx = playerPos.x - b.x;
    const dz = playerPos.z - b.z;
    const dist = Math.hypot(dx, dz) || 1;
    const keep = GAME_CONFIG.ghostKeepDistance;
    if (dist > keep + 0.1) {
      this._goTo(playerPos, speed, dt, keep);
    } else if (dist < keep - 0.45) {
      const awayX = (b.x - playerPos.x) / dist;
      const awayZ = (b.z - playerPos.z) / dist;
      this._setVelocity(awayX * speed * 0.55, awayZ * speed * 0.55, dt);
    } else {
      this._setVelocity(0, 0, 0);
    }
  }

  _setVelocity(vx, vz, dt) {
    this.pawn.body.velocity.set(vx, 0, vz);
    if (Math.hypot(vx, vz) > 0.1) {
      this._facing = Math.atan2(vx, vz);
      this.pawn.mesh.rotation.y = this._facing;
    }
  }

  _placeGhost(x, z, y = 1.2) {
    const b = this.pawn.body.position;
    b.set(x, y, z);
    b.aabbNeedsUpdate = true;
    this.pawn.body.velocity.set(0, 0, 0);
  }

  _canSee(playerPos, stage) {
    if (this.game.hiding) return false;
    const b = this.pawn.body.position;
    if (playerPos.y - b.y > 0.8) return false;
    const dist = distance2D(b.x, b.z, playerPos.x, playerPos.z);
    if (dist > stage.viewDist) return false;
    if (this.playerCrouching?.() && dist > 1.8) return false;

    const dx = playerPos.x - b.x;
    const dz = playerPos.z - b.z;
    const facingX = Math.sin(this._facing);
    const facingZ = Math.cos(this._facing);
    const dot = (dx * facingX + dz * facingZ) / (Math.hypot(dx, dz) || 1);
    const angle = Math.acos(clamp(dot, -1, 1)) * (180 / Math.PI);
    if (stage.cone < 360 && angle > stage.cone / 2) return false;

    const from = v3(b.x, b.y + 0.8, b.z);
    const to = v3(playerPos.x, playerPos.y + 1.0, playerPos.z);
    const hit = this.physics.raycastClosest(from, to, GROUPS.WORLD | GROUPS.PROP);
    if (!hit) return true;
    const hp = hit.hitPointWorld;
    const hitDist = Math.hypot(hp.x - from.x, hp.y - from.y, hp.z - from.z);
    return hitDist >= dist * 0.9;
  }

  _onNoise({ pos, radius, rage }) {
    if (!this.game.isPlaying() || this.game.phase !== 'investigate') return;
    if (this.game.hiding) return;
    const b = this.pawn.body.position;
    const dist = distance2D(b.x, b.z, pos.x, pos.z);
    if (dist > radius) return;
    const stage = this.game.currentStage();
    if (rage) this.rage.add(rage, 'noise');
    if (!this.game.hiding) this._lastNoise = { x: pos.x, z: pos.z };
    if (stage.id !== 'calm') {
      this._speak(choice(GHOST_CONFIG.speech.annoyed), 1800);
      this.audio?.play('ghost');
    }
  }

  _catchOrSlap(playerPos) {
    if (this._caught) return;
    if (this._telegraphActive) return;
    if (this._throwActive) return;
    if (this.game.hiding) return;
    if (this.game.chainStuck) return;
    if (this.game.broken) return;
    if (this._isPinned()) return;
    if (this.game.ropeClimbing) return;
    if (this.game.ladderClimbing) return;
    if (nowSec() < this.game.dodgingUntil) return;
    if (nowSec() < this.game.weakUntil) return;
    if (nowSec() < this.game.invincibleUntil) return;
    const b = this.pawn.body.position;
    if (playerPos.y - b.y > 0.8) return;
    const dist = distance2D(b.x, b.z, playerPos.x, playerPos.z);
    if (dist > 1.15) return;
    const stage = this.game.currentStage();
    if (
      this.game.phase === 'investigate' &&
      (stage.id === 'furious' || stage.id === 'insane') &&
      !this._telegraphActive &&
      dist <= 5
    ) {
      this._attackCooldown = 0;
      this._updateAttack(0, playerPos);
      return;
    }
    if (this.game.phase === 'escape') {
      this._capturePlayer(playerPos);
    }
  }

  _updateTargetingUI(playerPos) {
    if (!this._weakPoint || !this._rangeRing) return;
    const noteKnown = this.game.hasClue('note');
    const showWeak = noteKnown && this.game.phase === 'investigate' && !this.game.sealed;
    this._weakPoint.visible = showWeak;
    if (showWeak) this._weakPoint.rotation.z = Math.sin(nowSec() * 3) * 0.15;

    const staplerEquipped = this.game.equipped === 'stapler';
    this._rangeRing.visible = showWeak && staplerEquipped;
    if (!this._rangeRing.visible) return;

    const b = this.pawn.body.position;
    const dist = distance2D(b.x, b.z, playerPos.x, playerPos.z);
    const dx = playerPos.x - b.x;
    const dz = playerPos.z - b.z;
    const facingX = Math.sin(this._facing);
    const facingZ = Math.cos(this._facing);
    const dot = (dx * facingX + dz * facingZ) / (Math.hypot(dx, dz) || 1);
    const behind = dot < -0.25;
    const ready = dist <= 2.4 && behind;
    this._rangeRingMat.color.setHex(ready ? 0x4caf50 : 0xe63946);
    this._rangeRingMat.opacity = ready ? 0.85 : 0.4;
    this._rangeRing.scale.setScalar(1 + Math.sin(nowSec() * 4) * 0.03);
  }

  _catchPlayer() {
    if (this._caught) return;
    this._caught = true;
    this.game.ghostScore = (this.game.ghostScore || 0) + 250;
    this.game.phase = 'lost';
    this.audio?.play('lose');
    this.events.emit('toast', { text: '被鬼抓住了……', ms: 2400 });
    this.events.emit('game.lost');
  }

  sealAttempt() {
    if (this.game.phase !== 'investigate') return 'miss';
    const b = this.pawn.body.position;
    const p = this.playerPos();
    const dist = distance2D(b.x, b.z, p.x, p.z);
    if (dist > 2.4) return 'miss';

    if (this.game.chainActive && !this.game.chainPinned) {
      this.events.emit('toast', {
        text: '订书机抖得厉害：主管说的三件套还没做完！',
        ms: 2200
      });
      this._speak('你想干嘛？！', 1600);
      return 'blocked';
    }

    const stage = this.game.currentStage();
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    const facingX = Math.sin(this._facing);
    const facingZ = Math.cos(this._facing);
    const dot = (dx * facingX + dz * facingZ) / (Math.hypot(dx, dz) || 1);
    const behind = dot < -0.25;
    const stealthy = (stage.id === 'calm' || stage.id === 'annoyed') && !this.game.hiding;

    if (this.game.hasClue('note') && ((stealthy && behind) || this._isPinned())) {
      this._sealSuccess();
      return 'success';
    }

    this.game.consumeItem('stapler');
    this.game.usedItems.push('stapler');
    this.game.staplerBroken = true;
    this.game.weakUntil = nowSec() + 1.6;
    this.rage.add(GHOST_CONFIG.rage.wrongSeal, 'wrongSeal');
    this.audio?.play('stapler');
    this.events.emit('toast', { text: '订书机咬住了空气，鬼笑出了声！', ms: 2200 });
    this._speak('你在干嘛？！', 2000);
    return 'wrong';
  }

  _sealSuccess(reason = 'sealed') {
    this.game.sealed = true;
    this.game.rage = 100;
    this.game.phase = 'escape';
    this.game.escapeTimer = GAME_CONFIG.escapeTime;
    this.game.weakUntil = nowSec() + 5.0;
    this.game.pinnedUntil = 0;
    this.scene.openExit();
    this.audio?.play('stapler');
    this.audio?.play('gate');
    this.events.emit('hitstop', { ms: 120 });
    this.events.emit('slowmo', { ms: 450 });
    this.events.emit('escape.start', { reason });
    this.events.emit('toast', { text: '封印成功！它被你钉在空气里了！快跑！', ms: 2600 });
    this._speak('你居然……咩————！！！', 2600);
  }

  damage(amount, def = null) {
    if (this.game.phase !== 'investigate') return false;
    this.game.ghostHp -= amount;
    this._flash = 0.14;
    this.audio?.play('hit');
    if (def?.rage) this.rage.add(def.rage, 'hit');
    if (this.game.ghostHp <= 0) {
      this.game.rage = 100;
      this.game.phase = 'escape';
      this.game.escapeTimer = GAME_CONFIG.escapeTime;
      this.scene.openExit();
      this.events.emit('escape.start', { reason: 'brute' });
      this.events.emit('toast', { text: '它被你砸跑了…也算成功吧？快跑！', ms: 2600 });
      this.audio?.play('bleat');
      return true;
    }
    return true;
  }

  _speak(text, ms) {
    if (this._speechTimer > 0) return;
    this._speechTimer = ms / 1000;
    this.events.emit('speech', { text, ms, name: '值日鬼' });
  }
}
