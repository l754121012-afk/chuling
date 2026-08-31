import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GROUPS, makeBody, syncMeshToBody, v3 } from '../core/Physics.js';
import {
  material,
  makePropMesh,
  makeFootprintMesh,
  textTexture
} from '../core/PlaceholderAssets.js';
import { PALETTE } from '../config/palette.js';
import { LEVEL_CONFIG } from '../config/level.js';
import { nowSec, rand } from '../core/Utils.js';

function scaleLevelConfig(cfg, s = 1.25) {
  const out = structuredClone(cfg);
  const keys = new Set(['x', 'z', 'minX', 'maxX', 'minZ', 'maxZ', 'w', 'd', 'length']);
  const visit = obj => {
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val && typeof val === 'object') visit(val);
      else if (keys.has(key) && typeof val === 'number') obj[key] = Math.round(val * s * 100) / 100;
    }
  };
  visit(out);
  return out;
}

export class SchoolScene {
  constructor(physics, events) {
    this.physics = physics;
    this.events = events;
    this.L = scaleLevelConfig(LEVEL_CONFIG);
    this.group = new THREE.Group();
    this.flickerLights = [];
    this.footprints = [];
    this.particles = [];
    this._deskShakeUntil = 0;
    this._lockerShakeUntil = 0;
    this.refs = null;
  }

  build() {
    const refs = {
      playerStart: { ...this.L.playerStart },
      ghostSpawn: { ...this.L.ghostSpawn },
      exit: null,
      locker: null,
      clues: [],
      props: [],
      pillars: [],
      clutter: [],
      desks: [],
      platform: null,
      itemSpawns: this.L.itemSpawns.map(s => ({ ...s }))
    };

    this._addFloor();
    this._addWalls();
    this._addProps(refs);
    this._addClues(refs);
    this._addExit(refs);
    this._addLights();
    this._addVerticalProps(refs);
    this._addRouteClutter(refs);

    this.refs = refs;
    return refs;
  }

  _addFloor() {
    const c = this.L.classroom;
    const co = this.L.corridor;
    const minX = Math.min(c.minX, co.minX) - 3;
    const maxX = Math.max(c.maxX, co.maxX) + 3;
    const minZ = Math.min(c.minZ, co.minZ) - 3;
    const maxZ = Math.max(c.maxZ, co.maxZ) + 3;
    this._box(
      maxX - minX,
      0.4,
      maxZ - minZ,
      { x: (minX + maxX) / 2, y: -0.2, z: (minZ + maxZ) / 2 },
      PALETTE.floor
    );
    const darkFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(c.maxX - c.minX + 4, c.maxZ - c.minZ + 4),
      new THREE.MeshStandardMaterial({ color: PALETTE.floorDark, roughness: 0.95 })
    );
    darkFloor.rotation.x = -Math.PI / 2;
    darkFloor.position.set((c.minX + c.maxX) / 2, 0.01, (c.minZ + c.maxZ) / 2);
    this.group.add(darkFloor);
  }

  _addWalls() {
    const wallColor = PALETTE.wall;
    const wallTrim = PALETTE.wallTrim;
    const c = this.L.classroom;
    const co = this.L.corridor;
    const H = 7;
    const doorHalf = 3;

    this._box(c.maxX - c.minX, H, 0.25, { x: 0, y: H / 2, z: c.minZ }, wallColor);
    this._box(0.25, H, c.maxZ - c.minZ, { x: c.maxX, y: H / 2, z: (c.minZ + c.maxZ) / 2 }, wallColor);
    this._box(0.25, H, c.maxZ - c.minZ, { x: c.minX, y: H / 2, z: (c.minZ + c.maxZ) / 2 }, wallColor);
    this._box(-doorHalf - c.minX, H, 0.25, { x: (c.minX - doorHalf) / 2, y: H / 2, z: c.maxZ }, wallColor);
    this._box(c.maxX - doorHalf, H, 0.25, { x: (doorHalf + c.maxX) / 2, y: H / 2, z: c.maxZ }, wallColor);
    this._box(0.25, H, co.maxZ - co.minZ, { x: co.minX, y: H / 2, z: (co.minZ + co.maxZ) / 2 }, wallColor);
    this._box(0.25, H, co.maxZ - co.minZ, { x: co.maxX, y: H / 2, z: (co.minZ + co.maxZ) / 2 }, wallColor);
    this._box(co.maxX - co.minX, H, 0.25, { x: 0, y: H / 2, z: co.maxZ }, wallColor);
    this._box(doorHalf * 2, 0.7, 0.25, { x: 0, y: 6.3, z: c.maxZ }, wallTrim);
  }

  _addProps(refs) {
    for (const desk of this.L.desks) {
      const mesh = makePropMesh('desk');
      mesh.position.set(desk.x, 0, desk.z);
      mesh.rotation.y = desk.rotY;
      this.group.add(mesh);
      refs.desks.push({ mesh, base: { x: desk.x, z: desk.z } });
      const body = makeBody({
        shape: new CANNON.Box(v3(0.4, 0.38, 0.28)),
        position: { x: desk.x, y: 0.38, z: desk.z },
        group: GROUPS.PROP,
        mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
      });
      this.physics.add(body);
    }

    const platform = this.L.platform;
    const platformMesh = new THREE.Mesh(
      new THREE.BoxGeometry(platform.w, platform.h, platform.d),
      material('#b9926a', 0.9)
    );
    platformMesh.position.set(platform.x, platform.h / 2, platform.z);
    this.group.add(platformMesh);
    const platformBody = makeBody({
      shape: new CANNON.Box(v3(platform.w / 2, platform.h / 2, platform.d / 2)),
      position: { x: platform.x, y: platform.h / 2, z: platform.z },
      group: GROUPS.PROP,
      mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
    });
    this.physics.add(platformBody);
    refs.platform = {
      x: platform.x,
      z: platform.z,
      topY: platform.h,
      minX: platform.x - platform.w / 2,
      maxX: platform.x + platform.w / 2,
      minZ: platform.z - platform.d / 2,
      maxZ: platform.z + platform.d / 2
    };

    const teacher = this.L.teacherDesk;
    const teacherMesh = makePropMesh('teacherDesk');
    teacherMesh.position.set(teacher.x, 1.0, teacher.z);
    teacherMesh.rotation.y = teacher.rotY;
    this.group.add(teacherMesh);
    const teacherBody = makeBody({
      shape: new CANNON.Box(v3(0.58, 0.48, 0.33)),
      position: { x: teacher.x, y: 1.48, z: teacher.z },
      group: GROUPS.PROP,
      mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
    });
    this.physics.add(teacherBody);

    const shelf = this.L.bookshelf;
    const shelfMesh = makePropMesh('bookshelf');
    shelfMesh.position.set(shelf.x, 0, shelf.z);
    shelfMesh.rotation.y = shelf.rotY;
    this.group.add(shelfMesh);
    const shelfBody = makeBody({
      shape: new CANNON.Box(v3(0.55, 1.0, 0.25)),
      position: { x: shelf.x, y: 1.0, z: shelf.z },
      mass: 45,
      group: GROUPS.PROP,
      mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM,
      type: CANNON.Body.KINEMATIC
    });
    shelfBody.quaternion.setFromEuler(0, shelf.rotY, 0);
    shelfBody.angularDamping = 0.6;
    shelfBody.linearDamping = 0.2;
    this.physics.add(shelfBody);
    refs.props.push({
      type: 'bookshelf',
      mesh: shelfMesh,
      body: shelfBody,
      pos: { x: shelf.x, z: shelf.z },
      cost: 8000,
      used: false,
      offsetY: 1.0
    });

    const chainSpot = this.L.chainTrapSpot;
    const chainSpotMesh = new THREE.Mesh(
      new THREE.RingGeometry(chainSpot.r - 0.3, chainSpot.r, 30),
      new THREE.MeshBasicMaterial({
        color: 0xffe08a,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    chainSpotMesh.rotation.x = -Math.PI / 2;
    chainSpotMesh.position.set(chainSpot.x, 0.04, chainSpot.z);
    chainSpotMesh.visible = false;
    this.group.add(chainSpotMesh);
    refs.chainSpot = {
      x: chainSpot.x,
      z: chainSpot.z,
      r: chainSpot.r,
      mesh: chainSpotMesh
    };

    const shelfMarker = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.3, 30),
      new THREE.MeshBasicMaterial({
        color: 0xf4a261,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    shelfMarker.rotation.x = -Math.PI / 2;
    shelfMarker.position.set(shelf.x, 0.05, shelf.z);
    shelfMarker.visible = false;
    this.group.add(shelfMarker);
    refs.chainShelfMarker = { mesh: shelfMarker };

    const lockerPos = this.L.lockers;
    const lockerMesh = makePropMesh('lockers');
    lockerMesh.position.set(lockerPos.x, 0, lockerPos.z);
    lockerMesh.rotation.y = lockerPos.rotY;
    this.group.add(lockerMesh);
    const lockerBody = makeBody({
      shape: new CANNON.Box(v3(0.78, 0.85, 0.28)),
      position: { x: lockerPos.x, y: 0.85, z: lockerPos.z },
      group: GROUPS.PROP,
      mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
    });
    this.physics.add(lockerBody);
    refs.locker = {
      mesh: lockerMesh,
      body: lockerBody,
      pos: { x: lockerPos.x, z: lockerPos.z },
      topY: 1.7
    };
    refs.lockerShake = { mesh: lockerMesh, base: { x: lockerPos.x, z: lockerPos.z } };
    const safeSign = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: textTexture('安全屋', {
          bg: '#14532d',
          fg: '#eaffea',
          font: 'bold 62px "Microsoft YaHei", sans-serif',
          width: 512,
          height: 160,
          lineHeight: 80,
          pad: 10
        }),
        transparent: true,
        depthWrite: false
      })
    );
    safeSign.position.set(lockerPos.x, 2.25, lockerPos.z);
    safeSign.scale.set(1.5, 0.5, 1);
    this.group.add(safeSign);
    const safeLight = new THREE.PointLight('#7CFC00', 0.8, 4.5, 1.8);
    safeLight.position.set(lockerPos.x, 1.6, lockerPos.z);
    this.group.add(safeLight);

    const step = this.L.lockerStep;
    const stepMesh = new THREE.Mesh(
      new THREE.BoxGeometry(step.w, step.h, step.d),
      material('#7c644d', 0.9)
    );
    stepMesh.position.set(step.x, step.h / 2, step.z);
    this.group.add(stepMesh);
    const stepBody = makeBody({
      shape: new CANNON.Box(v3(step.w / 2, step.h / 2, step.d / 2)),
      position: { x: step.x, y: step.h / 2, z: step.z },
      group: GROUPS.PROP,
      mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
    });
    this.physics.add(stepBody);
    refs.lockerStep = { x: step.x, z: step.z };

    const trash = this.L.trashCan;
    const trashMesh = makePropMesh('trashCan');
    trashMesh.position.set(trash.x, 0, trash.z);
    this.group.add(trashMesh);
    const trashBody = new CANNON.Body({
      mass: 6,
      shape: new CANNON.Cylinder(0.28, 0.22, 0.72, 12),
      position: v3(trash.x, 0.36, trash.z),
      collisionFilterGroup: GROUPS.PROP,
      collisionFilterMask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
    });
    trashBody.angularDamping = 0.4;
    trashBody.linearDamping = 0.1;
    this.physics.add(trashBody);
    refs.props.push({
      type: 'trash',
      mesh: trashMesh,
      body: trashBody,
      pos: { x: trash.x, z: trash.z },
      cost: 1000,
      used: false,
      offsetY: 0.36
    });

    for (const pillar of this.L.pillars) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(pillar.r, pillar.r, 3, 14),
        material('#8a7f6d', 0.85)
      );
      mesh.position.set(pillar.x, 1.5, pillar.z);
      this.group.add(mesh);
      const body = makeBody({
        shape: new CANNON.Cylinder(pillar.r, pillar.r, 3, 14),
        position: { x: pillar.x, y: 1.5, z: pillar.z },
        group: GROUPS.PROP,
        mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
      });
      this.physics.add(body);
      refs.pillars.push({ mesh, body, pos: { x: pillar.x, z: pillar.z }, r: pillar.r });
    }

    const plant = this.L.plant;
    const plantMesh = new THREE.Group();
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.2, 0.7, 10),
      material('#a0522d', 0.8)
    );
    pot.position.y = 0.35;
    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 10, 8),
      material('#4d7c4d', 0.8)
    );
    leaves.position.y = 0.9;
    plantMesh.add(pot, leaves);
    plantMesh.position.set(plant.x, 0, plant.z);
    this.group.add(plantMesh);
    const plantBody = makeBody({
      shape: new CANNON.Cylinder(0.25, 0.2, 0.8, 10),
      position: { x: plant.x, y: 0.4, z: plant.z },
      mass: 8,
      group: GROUPS.PROP,
      mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
    });
    this.physics.add(plantBody);
    refs.props.push({
      type: 'plant',
      mesh: plantMesh,
      body: plantBody,
      pos: { x: plant.x, z: plant.z },
      cost: 2000,
      used: false,
      offsetY: 0.4
    });

    for (const c of this.L.clutter) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.08, 0.3),
        material('#f4efe4', 0.9)
      );
      mesh.position.set(c.x, 0.04, c.z);
      mesh.rotation.y = Math.random() * Math.PI;
      this.group.add(mesh);
      refs.clutter.push({ x: c.x, z: c.z, used: false });
    }

    for (const crate of this.L.crates) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.8, 0.8),
        material('#a9744f', 0.85)
      );
      mesh.position.set(crate.x, 0.4, crate.z);
      this.group.add(mesh);
      const body = makeBody({
        shape: new CANNON.Box(v3(0.4, 0.4, 0.4)),
        position: { x: crate.x, y: 0.4, z: crate.z },
        mass: 20,
        group: GROUPS.WORLD,
        mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
      });
      body.type = CANNON.Body.STATIC;
      this.physics.add(body);
      refs.props.push({
        type: 'crate',
        mesh,
        body,
        pos: { x: crate.x, z: crate.z },
        cost: 0,
        used: false,
        offsetY: 0
      });
    }

    const crateTarget = this.L.crateTarget;
    const targetMarker = new THREE.Group();
    const side = crateTarget.r * 2;
    const barMat = new THREE.MeshBasicMaterial({
      color: 0xd8c39a,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const barW = 0.14;
    const barH = 0.02;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(side, barH, barW), barMat);
    const barTop = bar.clone();
    barTop.position.z = side / 2 - barW / 2;
    const barBottom = bar.clone();
    barBottom.position.z = -side / 2 + barW / 2;
    const barLeft = bar.clone();
    barLeft.rotation.y = Math.PI / 2;
    barLeft.position.x = -side / 2 + barW / 2;
    const barRight = bar.clone();
    barRight.rotation.y = Math.PI / 2;
    barRight.position.x = side / 2 - barW / 2;
    targetMarker.add(barTop, barBottom, barLeft, barRight);
    targetMarker.position.set(crateTarget.x, 0.03, crateTarget.z);
    this.group.add(targetMarker);
    refs.crateTarget = { x: crateTarget.x, z: crateTarget.z, r: crateTarget.r, mesh: targetMarker };
  }

  _addVerticalProps(refs) {
    const stack = this.L.palletStack;
    let baseY = 0;
    for (const h of stack.tiers) {
      const size = 1.1;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, h, size),
        material('#8a6240', 0.85)
      );
      const centerY = baseY + h / 2;
      mesh.position.set(stack.x, centerY, stack.z);
      this.group.add(mesh);
      const body = makeBody({
        shape: new CANNON.Box(v3(size / 2, h / 2, size / 2)),
        position: { x: stack.x, y: centerY, z: stack.z },
        group: GROUPS.PROP,
        mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
      });
      this.physics.add(body);
      baseY += h;
    }

    for (const ledge of this.L.wallLedges) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.18, 0.65),
        material('#7c644d', 0.85)
      );
      mesh.position.set(ledge.x, ledge.y, ledge.z);
      this.group.add(mesh);
      const body = makeBody({
        shape: new CANNON.Box(v3(0.75, 0.09, 0.325)),
        position: { x: ledge.x, y: ledge.y, z: ledge.z },
        group: GROUPS.WORLD,
        mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
      });
      this.physics.add(body);
    }

    const ramp = this.L.slideRamp;
    const rampMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.15, ramp.length),
      material('#a9744f', 0.85)
    );
    rampMesh.position.set(ramp.x, 2.0, ramp.z);
    rampMesh.rotation.x = ramp.tilt;
    this.group.add(rampMesh);
    const rampBody = makeBody({
      shape: new CANNON.Box(v3(0.6, 0.075, ramp.length / 2)),
      position: { x: ramp.x, y: 2.0, z: ramp.z },
      group: GROUPS.PROP,
      mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
    });
    rampBody.quaternion.setFromEuler(ramp.tilt, 0, 0);
    this.physics.add(rampBody);

    const rope = this.L.rope;
    const rdx = rope.to.x - rope.from.x;
    const rdz = rope.to.z - rope.from.z;
    const ropeLen = Math.hypot(rdx, rdz);
    const ropeMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, ropeLen, 8),
      material('#6b4f2f', 0.7)
    );
    ropeMesh.position.set(
      (rope.from.x + rope.to.x) / 2,
      rope.y,
      (rope.from.z + rope.to.z) / 2
    );
    const ropeDir = new THREE.Vector3(rdx, 0, rdz).normalize();
    ropeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ropeDir);
    this.group.add(ropeMesh);
    refs.rope = { from: { ...rope.from }, to: { ...rope.to }, y: rope.y };

    refs.ladders = [];
    for (const ladder of this.L.ladders) {
      const railMat = material('#8a6240', 0.75);
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, ladder.topY, 6),
          railMat
        );
        rail.position.set(ladder.x + side * 0.25, ladder.topY / 2, ladder.z);
        this.group.add(rail);
      }
      for (let y = 0.4; y < ladder.topY - 0.2; y += 0.45) {
        const rung = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.022, 0.5, 5),
          railMat
        );
        rung.rotation.x = Math.PI / 2;
        rung.position.set(ladder.x, y, ladder.z);
        this.group.add(rung);
      }
      refs.ladders.push({ x: ladder.x, z: ladder.z, topY: ladder.topY });
    }

    for (const seg of this.L.highCatwalk) {
      const dx = seg.to.x - seg.from.x;
      const dz = seg.to.z - seg.from.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.1) continue;
      const yaw = Math.atan2(dx, dz);
      const midX = (seg.from.x + seg.to.x) / 2;
      const midZ = (seg.from.z + seg.to.z) / 2;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.3, len),
        material('#6b5b4a', 0.8)
      );
      mesh.position.set(midX, seg.y - 0.15, midZ);
      mesh.rotation.y = yaw;
      this.group.add(mesh);
      const body = makeBody({
        shape: new CANNON.Box(v3(0.6, 0.8, len / 2 + 0.5)),
        position: { x: midX, y: seg.y - 0.8, z: midZ },
        group: GROUPS.WORLD,
        mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
      });
      body.quaternion.setFromEuler(0, yaw, 0);
      this.physics.add(body);
    }

    const landing = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.25, 3),
      material('#6b5b4a', 0.8)
    );
    const catEndZ = this.L.highCatwalk[1].to.z;
    landing.position.set(0, 3.875, catEndZ);
    this.group.add(landing);
    const landingBody = makeBody({
      shape: new CANNON.Box(v3(2, 0.8, 2)),
      position: { x: 0, y: 3.2, z: catEndZ },
      group: GROUPS.WORLD,
      mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
    });
    this.physics.add(landingBody);

    for (const seg of this.L.highCatwalk) {
      const minX = Math.min(seg.from.x, seg.to.x) - 0.5;
      const maxX = Math.max(seg.from.x, seg.to.x) + 0.5;
      const minZ = Math.min(seg.from.z, seg.to.z) - 0.5;
      const maxZ = Math.max(seg.from.z, seg.to.z) + 0.5;
      const slab = makeBody({
        shape: new CANNON.Box(v3((maxX - minX) / 2, 0.8, (maxZ - minZ) / 2)),
        position: { x: (minX + maxX) / 2, y: 3.2, z: (minZ + maxZ) / 2 },
        group: GROUPS.WORLD,
        mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
      });
      this.physics.add(slab);
    }

    for (const ledge of this.L.wallLedges) {
      const block = makeBody({
        shape: new CANNON.Box(v3(1.2, 1.5, 0.9)),
        position: { x: ledge.x, y: 2.7, z: ledge.z },
        group: GROUPS.WORLD,
        mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
      });
      this.physics.add(block);
    }
  }

  _addRouteClutter(refs) {
    for (const c of this.L.routeClutter) {
      const group = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.22, 0.32),
          material(i % 2 ? '#8a6240' : '#b9926a', 0.85)
        );
        box.position.set(i * 0.08, 0.11 + i * 0.22, -i * 0.05);
        box.rotation.z = c.rot * (i + 1) * 0.12;
        group.add(box);
      }
      group.position.set(c.x, 0, c.z);
      group.rotation.y = c.rot;
      this.group.add(group);
      refs.clutter.push({ x: c.x, z: c.z, used: false, mesh: group });
    }
  }

  _addClues(refs) {
    const board = this.L.blackboard;
    const boardMesh = makePropMesh('blackboard');
    boardMesh.position.set(board.x, board.y, board.z);
    boardMesh.rotation.y = Math.PI;
    this.group.add(boardMesh);
    const boardBody = makeBody({
      shape: new CANNON.Box(v3(2.2, 0.62, 0.05)),
      position: { x: board.x, y: board.y, z: board.z },
      group: GROUPS.PROP,
      mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP
    });
    this.physics.add(boardBody);
    refs.clues.push({
      id: 'blackboard',
      mesh: boardMesh,
      body: boardBody,
      pos: { x: board.x, z: board.z }
    });

    const note = this.L.note;
    const noteMesh = makePropMesh('note');
    noteMesh.position.set(note.x, note.y, note.z);
    noteMesh.rotation.y = -0.4;
    noteMesh.rotation.x = -0.15;
    this.group.add(noteMesh);
    const noteBody = makeBody({
      shape: new CANNON.Box(v3(0.36, 0.25, 0.02)),
      position: { x: note.x, y: note.y, z: note.z },
      group: GROUPS.PROP,
      mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP
    });
    this.physics.add(noteBody);
    refs.clues.push({
      id: 'note',
      mesh: noteMesh,
      body: noteBody,
      pos: { x: note.x, z: note.z }
    });
  }

  _addExit(refs) {
    const exit = this.L.exit;
    const mesh = makePropMesh('exitGate');
    mesh.position.set(exit.x, 0, exit.z);
    this.group.add(mesh);
    const body = makeBody({
      shape: new CANNON.Box(v3(1.2, 1.5, 0.09)),
      position: { x: exit.x, y: 1.5, z: exit.z },
      group: GROUPS.WORLD,
      mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
    });
    this.physics.add(body);

    const lockMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 3),
      new THREE.MeshStandardMaterial({
        color: PALETTE.exitLocked,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide
      })
    );
    lockMesh.position.set(exit.x, 1.5, exit.z + 0.1);
    this.group.add(lockMesh);

    const beacon = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 1.6, 8),
      material(PALETTE.exit)
    );
    pole.position.y = 3.2;
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 0.7, 10),
      material(PALETTE.exit)
    );
    arrow.position.y = 4.2;
    beacon.add(pole, arrow);
    beacon.position.set(exit.x, 0, exit.z);
    beacon.visible = false;
    this.group.add(beacon);

    refs.exit = {
      mesh,
      body,
      lockMesh,
      beacon,
      pos: { x: exit.x, z: exit.z },
      locked: true
    };
  }

  _addLights() {
    this.group.add(new THREE.HemisphereLight('#3d4a5c', '#10141c', 0.22));
    const sun = new THREE.DirectionalLight('#5f6a7a', 0.35);
    sun.position.set(6, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -12;
    this.group.add(sun);

    const flicker = [
      { x: -6, z: -4, color: '#ffe9c4' },
      { x: 5, z: -3, color: '#ffd9a0' },
      { x: -3, z: 2, color: '#d9f0ff' },
      { x: 0, z: 8, color: '#ffe9c4' }
    ];
    for (const f of flicker) {
      const light = new THREE.PointLight(f.color, 0.3, 9, 1.8);
      light.position.set(f.x, 2.7, f.z);
      this.group.add(light);
      this.flickerLights.push(light);
    }
  }

  _box(w, h, d, pos, color, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
    mesh.position.set(pos.x, pos.y, pos.z);
    this.group.add(mesh);
    if (opts.body === false) return { mesh };
    const body = makeBody({
      shape: new CANNON.Box(v3(w / 2, h / 2, d / 2)),
      position: pos,
      group: opts.group || GROUPS.WORLD,
      mask: opts.mask ?? (GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM)
    });
    this.physics.add(body);
    return { mesh, body };
  }

  openExit() {
    if (!this.refs?.exit || !this.refs.exit.locked) return;
    this.refs.exit.locked = false;
    this.refs.exit.lockMesh.visible = false;
    this.refs.exit.beacon.visible = true;
    this.events.emit('toast', { text: '出口开了！快跑！', ms: 2400 });
    this.events.emit('audio', { name: 'gate' });
  }

  addFootprint(x, z) {
    const mesh = makeFootprintMesh();
    mesh.position.set(x, 0.03, z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    this.group.add(mesh);
    this.footprints.push({ mesh, ttl: 18, x, z });
  }

  breakClutter(c) {
    const roll = Math.random();
    if (c.mesh && roll < 0.3) {
      this.group.remove(c.mesh);
      const squashed = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.12, 0.6),
        material('#cbb68a', 0.9)
      );
      squashed.position.set(c.x, 0.06, c.z);
      squashed.rotation.set(rand(0, 0.4), rand(0, Math.PI), rand(0, 0.4));
      this.group.add(squashed);
      return;
    }
    if (c.mesh) this.group.remove(c.mesh);
    const kick = roll > 0.75;
    for (let i = 0; i < 5; i++) {
      const scrap = new THREE.Mesh(
        new THREE.PlaneGeometry(0.16, 0.1),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? '#d9c8a0' : '#cbb68a',
          side: THREE.DoubleSide
        })
      );
      scrap.position.set(
        c.x + rand(-0.6, 0.6) * (kick ? 1.8 : 1),
        0.06 + rand(0, 0.25) + (kick ? rand(0.3, 0.8) : 0),
        c.z + rand(-0.6, 0.6) * (kick ? 1.8 : 1)
      );
      scrap.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
      this.group.add(scrap);
    }
  }

  spawnParticles(pos, color = '#ffe08a') {
    for (let i = 0; i < 14; i++) {
      const size = rand(0.05, 0.12);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
      );
      mesh.position.set(
        pos.x + rand(-0.3, 0.3),
        pos.y + rand(0.2, 0.7),
        pos.z + rand(-0.3, 0.3)
      );
      this.group.add(mesh);
      this.particles.push({ mesh, ttl: 0.55 });
    }
  }

  spawnHitRing(pos, color = '#ffe08a') {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.5, 24),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    ring.position.set(pos.x, pos.y, pos.z);
    ring.rotation.x = -Math.PI / 2;
    this.group.add(ring);
    this.particles.push({ mesh: ring, ttl: 0.45, ring: true });
  }

  spawnSlashTrail(from, to, color = '#ffd166', duration = 0.4) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz) || 0.1;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(len, 0.04, 0.32),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      })
    );
    mesh.position.set((from.x + to.x) / 2, 0.12, (from.z + to.z) / 2);
    mesh.rotation.y = Math.atan2(dx, dz);
    this.group.add(mesh);
    this.particles.push({ mesh, ttl: duration, maxTtl: duration, trail: true });
  }

  update(dt, game) {
    const currentStage = game.currentStage();
    if (currentStage.id === 'angry' || currentStage.id === 'furious' || currentStage.id === 'insane') {
      this._deskShakeUntil = nowSec() + 0.15;
    }
    if (currentStage.id === 'furious' || currentStage.id === 'insane') {
      this._lockerShakeUntil = nowSec() + 0.15;
    }
    for (const d of this.refs?.desks || []) {
      if (nowSec() < this._deskShakeUntil) {
        d.mesh.position.x = d.base.x + rand(-0.04, 0.04);
        d.mesh.position.z = d.base.z + rand(-0.04, 0.04);
      } else {
        d.mesh.position.x = d.base.x;
        d.mesh.position.z = d.base.z;
      }
    }
    const locker = this.refs?.lockerShake;
    if (locker) {
      if (nowSec() < this._lockerShakeUntil) {
        locker.mesh.position.x = locker.base.x + rand(-0.03, 0.03);
        locker.mesh.position.z = locker.base.z + rand(-0.03, 0.03);
      } else {
        locker.mesh.position.x = locker.base.x;
        locker.mesh.position.z = locker.base.z;
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.ttl -= dt;
      if (p.ttl <= 0) {
        this.group.remove(p.mesh);
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      } else if (p.ring) {
        p.mesh.scale.setScalar(1 + (0.45 - p.ttl) * 6);
        p.mesh.material.opacity = Math.max(0, p.ttl / 0.45);
      } else if (p.trail) {
        p.mesh.material.opacity = Math.max(0, p.ttl / p.maxTtl);
      }
    }

    for (const prop of this.refs?.props || []) {
      if (prop.body && prop.mesh) {
        syncMeshToBody(prop.mesh, prop.body);
        prop.mesh.position.y = prop.body.position.y - (prop.offsetY || 0);
      }
    }

    for (let i = this.footprints.length - 1; i >= 0; i--) {
      const f = this.footprints[i];
      f.ttl -= dt;
      if (f.ttl <= 0) {
        this.group.remove(f.mesh);
        this.footprints.splice(i, 1);
      }
    }

    const stage = game.currentStage();
    const insane = stage.id === 'furious' || stage.id === 'insane' || game.phase === 'escape';
    const lightsOut = game.lightsOutUntil > nowSec();
    for (const light of this.flickerLights) {
      if (lightsOut) {
        light.intensity = 0;
      } else if (insane) {
        light.intensity = 0.12 + Math.random() * 0.45;
      } else {
        light.intensity = 0.3;
      }
    }
  }
}
