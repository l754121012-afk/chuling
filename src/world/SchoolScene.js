import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GROUPS, makeBody, syncMeshToBody, v3 } from '../core/Physics.js';
import {
  material,
  makePropMesh,
  makeFootprintMesh,
  textTexture,
  makeItemMesh
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
  constructor(physics, events, threeScene = null, levelConfig = LEVEL_CONFIG) {
    this.physics = physics;
    this.events = events;
    this.threeScene = threeScene;
    this.L = scaleLevelConfig(levelConfig);
    this.group = new THREE.Group();
    this.flickerLights = [];
    this.guideLights = [];
    this.footprints = [];
    this.particles = [];
    this._deskShakeUntil = 0;
    this._lockerShakeUntil = 0;
    this.ambientLight = null;
    this.sunLight = null;
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
      beacons: [],
      bubbles: [],
      doors: [],
      npc: null,
      wageSlips: [],
      hazards: [],
      platform: null,
      itemSpawns: this.L.itemSpawns.map(s => ({ ...s }))
    };

    if (this.L.mode === 'westwing') {
      this._addWestWingShell(refs);
    } else {
      this._addFloor();
      this._addWalls();
    }
    this._addProps(refs);
    this._addClues(refs);
    this._addExit(refs);
    this._addLights(refs);
    this._addVerticalProps(refs);
    this._addRouteClutter(refs);
    this._addBubbles(refs);
    this._addDoors(refs);
    this._addWestWingGadgets(refs);
    this._addRegistrationNpc(refs);

    this.refs = refs;
    return refs;
  }

  _addWestWingShell(refs) {
    const c = this.L.classroom;
    const floorW = c.maxX - c.minX;
    const floorD = c.maxZ - c.minZ;
    this._box(
      floorW,
      0.4,
      floorD,
      { x: (c.minX + c.maxX) / 2, y: -0.2, z: (c.minZ + c.maxZ) / 2 },
      PALETTE.floor
    );

    const floor2 = this.L.secondFloor;
    if (floor2) {
      this._box(
        floor2.w,
        floor2.h,
        floor2.d,
        { x: floor2.x, y: floor2.topY - floor2.h / 2, z: floor2.z },
        PALETTE.floorDark
      );
      this._addSecondFloorRails(floor2);
    }

    for (const wall of this.L.westWingWalls || []) {
      this._box(wall.w, 5.2, wall.d, { x: wall.x, y: 2.6, z: wall.z }, PALETTE.wall);
    }
    this._addWestWingWindows();
    this._addWestWingHazards(refs);

    for (const room of this.L.westWingLabels || []) {
      const sign = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: textTexture(room.text, {
            bg: '#24303c',
            fg: '#ffe9b8',
            font: 'bold 46px "Microsoft YaHei", sans-serif',
            width: 512,
            height: 112,
            lineHeight: 52,
            pad: 8
          }),
          transparent: true,
          depthWrite: false
        })
      );
      sign.position.set(room.x, room.y ?? 1.55, room.z);
      sign.scale.set(3.4, 0.72, 1);
      this.group.add(sign);
    }
  }

  _addSecondFloorRails(floor) {
    const railH = 3.8;
    const topY = floor.topY;
    const y = topY + railH / 2;
    const t = 0.28;
    const color = '#596a76';
    this._box(floor.w + t * 2, railH, t, { x: floor.x, y, z: floor.z - floor.d / 2 - t / 2 }, color);
    this._box(floor.w + t * 2, railH, t, { x: floor.x, y, z: floor.z + floor.d / 2 + t / 2 }, color);
    this._box(t, railH, floor.d + t * 2, { x: floor.x - floor.w / 2 - t / 2, y, z: floor.z }, color);
    this._box(t, railH, floor.d + t * 2, { x: floor.x + floor.w / 2 + t / 2, y, z: floor.z }, color);
  }

  _addWestWingWindows() {
    for (const win of this.L.westWingWindows || []) {
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(win.axis === 'z' ? 2.8 : 0.12, 1.9, win.axis === 'x' ? 2.8 : 0.12),
        material('#3b4651', 0.4, 0.5)
      );
      frame.position.set(win.x, 2.7, win.z);
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(win.axis === 'z' ? 2.2 : 0.06, 1.4, win.axis === 'x' ? 2.2 : 0.06),
        new THREE.MeshBasicMaterial({
          color: 0xdff7ff,
          transparent: true,
          opacity: 0.75
        })
      );
      glass.position.set(win.x, 2.7, win.z);
      this.group.add(frame, glass);

      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 2.4, 8, 10),
        new THREE.MeshBasicMaterial({
          color: 0xfff2c4,
          transparent: true,
          opacity: 0.05,
          depthWrite: false
        })
      );
      beam.position.set(win.x, 2.75, win.z);
      if (win.axis === 'z') {
        beam.rotation.x = Math.PI / 2;
        beam.position.z += win.dir * 4.2;
      } else {
        beam.rotation.z = -Math.PI / 2 * win.dir;
        beam.position.x += win.dir * 4.2;
      }
      this.group.add(beam);
    }
  }

  _addWestWingHazards(refs) {
    for (const hazard of this.L.hazardZones || []) {
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(hazard.w, hazard.d),
        new THREE.MeshBasicMaterial({
          color: 0xff6b6b,
          transparent: true,
          opacity: 0.24,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(hazard.x, 0.06, hazard.z);
      const sign = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: textTexture(hazard.label || '危险区', {
            bg: '#5a1212',
            fg: '#ffe8d0',
            font: 'bold 32px "Microsoft YaHei", sans-serif',
            width: 320,
            height: 80,
            lineHeight: 36,
            pad: 6
          }),
          transparent: true,
          depthWrite: false
        })
      );
      sign.position.set(hazard.x, hazard.y ?? 0.75, hazard.z);
      sign.scale.set(1.6, 0.45, 1);
      this.group.add(floor, sign);
      refs.hazards.push({
        x: hazard.x,
        z: hazard.z,
        w: hazard.w,
        d: hazard.d,
        rate: hazard.rate || 6,
        mesh: floor,
        sign
      });
    }
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
      const body = makeBody({
        shape: new CANNON.Box(v3(0.4, 0.38, 0.28)),
        position: { x: desk.x, y: 0.38, z: desk.z },
        group: GROUPS.PROP,
        mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
      });
      this.physics.add(body);
      refs.desks.push({ mesh, body, base: { x: desk.x, z: desk.z }, slid: false });
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
    if (refs.locker) refs.locker.light = safeLight;

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
    if (crateTarget) {
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
  }

  _addVerticalProps(refs) {
    const stack = this.L.palletStack;
    let baseY = 0;
    for (const h of stack.tiers || []) {
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
    if (ramp.length > 0.01) {
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
    }

    const rope = this.L.rope;
    if (rope && rope.enabled !== false) {
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
    }

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

    const landingSeg = this.L.highCatwalk?.[1];
    if (landingSeg) {
      const landing = new THREE.Mesh(
        new THREE.BoxGeometry(3, 0.25, 3),
        material('#6b5b4a', 0.8)
      );
      const catEndZ = landingSeg.to.z;
      landing.position.set(0, 3.875, catEndZ);
      this.group.add(landing);
      const landingBody = makeBody({
        shape: new CANNON.Box(v3(2, 0.8, 2)),
        position: { x: 0, y: 3.2, z: catEndZ },
        group: GROUPS.WORLD,
        mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
      });
      this.physics.add(landingBody);
    }

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

    const charger = this.L.charger;
    const chargerGroup = new THREE.Group();
    const chargerBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 1.4, 0.4),
      material('#3f7fa6', 0.9)
    );
    chargerBox.position.y = 0.85;
    const chargerScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.55),
      new THREE.MeshBasicMaterial({ color: 0x7cfc00 })
    );
    chargerScreen.position.set(0, 1.05, 0.21);
    chargerGroup.add(chargerBox, chargerScreen);
    chargerGroup.position.set(charger.x, 0, charger.z);
    this.group.add(chargerGroup);
    const chargerLight = new THREE.PointLight('#7CFC00', 0.9, 4.5, 1.8);
    chargerLight.position.set(charger.x, 1.3, charger.z);
    this.group.add(chargerLight);
    const chargerSign = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: textTexture('充电桩', {
          bg: '#0b3d2e',
          fg: '#c8ffd0',
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
    chargerSign.position.set(charger.x, 2.3, charger.z);
    chargerSign.scale.set(1.5, 0.5, 1);
    this.group.add(chargerSign);
    refs.charger = {
      pos: { x: charger.x, z: charger.z },
      mesh: chargerGroup,
      light: chargerLight
    };

    const tank = this.L.fishTank;
    const tankGroup = new THREE.Group();
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.8, 0.6),
      new THREE.MeshStandardMaterial({
        color: 0x9fd8e8,
        transparent: true,
        opacity: 0.35,
        roughness: 0.2
      })
    );
    glass.position.y = 0.5;
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.25, 0.5),
      material('#6fc3df', 0.8)
    );
    water.position.y = 0.5;
    const seaHorseSign = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: textTexture('海马', {
          bg: '#0b3d4a',
          fg: '#d9f7ff',
          font: 'bold 64px "Microsoft YaHei", sans-serif',
          width: 256,
          height: 160,
          lineHeight: 80,
          pad: 8
        }),
        transparent: true,
        depthWrite: false
      })
    );
    seaHorseSign.position.set(0, 0.5, 0.32);
    seaHorseSign.scale.set(0.5, 0.3, 1);
    tankGroup.add(glass, water, seaHorseSign);
    tankGroup.position.set(tank.x, 0, tank.z);
    this.group.add(tankGroup);
    refs.fishTank = { x: tank.x, z: tank.z, mesh: tankGroup };
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

  _addBubbles(refs) {
    for (const route of this.L.bubbleRoutes || []) {
      const pairs = [
        {
          x: route.from.x,
          z: route.from.z,
          y: route.from.y ?? 0.9,
          to: { x: route.to.x, z: route.to.z, y: route.to.y ?? 0.9 }
        },
        {
          x: route.to.x,
          z: route.to.z,
          y: route.to.y ?? 0.9,
          to: { x: route.from.x, z: route.from.z, y: route.from.y ?? 0.9 }
        }
      ];
      for (const stop of pairs) {
        const color = route.color || '#8ef0c8';
        const group = new THREE.Group();
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.62, 16, 12),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.3,
            depthWrite: false
          })
        );
        sphere.position.y = stop.y + 0.62;
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.62, 0.82, 30),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false
          })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = stop.y - 0.05;
        const label = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: textTexture(route.label || '泡泡 E', {
              bg: '#0d332d',
              fg: '#d8ffe8',
              font: 'bold 34px "Microsoft YaHei", sans-serif',
              width: 420,
              height: 96,
              lineHeight: 42,
              pad: 6
            }),
            transparent: true,
            depthWrite: false
          })
        );
        label.position.set(0, stop.y + 1.55, 0);
        label.scale.set(2.2, 0.55, 1);
        group.add(sphere, ring, label);
        let lockLabel = null;
        if (route.requireClue) {
          lockLabel = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: textTexture('泡泡待机 · 先读值日表', {
                bg: '#4a1f2c',
                fg: '#ffe3a8',
                font: 'bold 30px "Microsoft YaHei", sans-serif',
                width: 420,
                height: 88,
                lineHeight: 38,
                pad: 6
              }),
              transparent: true,
              depthWrite: false
            })
          );
          lockLabel.position.set(0, stop.y + 2.15, 0);
          lockLabel.scale.set(2.1, 0.5, 1);
          group.add(lockLabel);
        }
        group.position.set(stop.x, 0, stop.z);
        this.group.add(group);
        refs.bubbles.push({
          x: stop.x,
          z: stop.z,
          y: stop.y,
          to: stop.to,
          group,
          sphere,
          ring,
          requireClue: route.requireClue || null,
          lockLabel
        });
      }
    }
  }

  _addDoors(refs) {
    for (const doorCfg of this.L.doors || []) {
      const h = doorCfg.levelY ? 1.8 : 5.2;
      const centerY = doorCfg.levelY ? doorCfg.levelY + 0.8 : 2.6;
      const box = this._box(doorCfg.w, h, doorCfg.d, { x: doorCfg.x, y: centerY, z: doorCfg.z }, '#5d6f7a');
      const sign = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: textTexture(doorCfg.label || '门禁', {
            bg: '#2b2118',
            fg: '#ffe9b8',
            font: 'bold 34px "Microsoft YaHei", sans-serif',
            width: 360,
            height: 88,
            lineHeight: 40,
            pad: 6
          }),
          transparent: true,
          depthWrite: false
        })
      );
      sign.position.set(0, h / 2 + 0.35, 0);
      sign.scale.set(2.0, 0.55, 1);
      box.mesh.add(sign);
      const lockSign = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: textTexture('LOCKED', {
            bg: '#7a1515',
            fg: '#fff2d8',
            font: 'bold 40px "Microsoft YaHei", sans-serif',
            width: 320,
            height: 88,
            lineHeight: 40,
            pad: 6
          }),
          transparent: true,
          depthWrite: false
        })
      );
      lockSign.position.set(0, -h / 2 + 0.45, 0.08);
      lockSign.scale.set(1.5, 0.45, 1);
      box.mesh.add(lockSign);
      const doorRef = {
        id: doorCfg.id,
        mesh: box.mesh,
        body: box.body,
        sign,
        lockSign,
        pos: { x: doorCfg.x, z: doorCfg.z },
        levelY: doorCfg.levelY || 0.8,
        locked: !!doorCfg.locked,
        unlockEvent: doorCfg.unlockEvent || null,
        requireClue: doorCfg.requireClue || null,
        openable: !!doorCfg.openable
      };
      this._applyDoorLock(doorRef, doorRef.locked);
      refs.doors.push(doorRef);
    }
  }

  _addWestWingGadgets(refs) {
    if (this.L.mode !== 'westwing') return;
    const bellCfg = this.L.ghostBell;
    if (bellCfg) {
      const bell = new THREE.Group();
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
        material('#ffe08a', 0.85)
      );
      dome.position.y = 0.36;
      const clapper = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 10, 8),
        material('#b83a4b', 0.9)
      );
      clapper.position.y = 0.1;
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.75, 0.12),
        material('#26303c', 0.9)
      );
      handle.position.y = 0.02;
      handle.position.x = 0.42;
      const bellSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: textTexture('值日响铃 E', {
            bg: '#3a2610',
            fg: '#ffe9b8',
            font: 'bold 30px "Microsoft YaHei", sans-serif',
            width: 360,
            height: 88,
            lineHeight: 38,
            pad: 6
          }),
          transparent: true,
          depthWrite: false
        })
      );
      bellSprite.position.y = 1.15;
      bellSprite.scale.set(1.7, 0.46, 1);
      bell.add(dome, clapper, handle, bellSprite);
      bell.position.set(bellCfg.x, bellCfg.y, bellCfg.z);
      this.group.add(bell);
      refs.ghostBell = {
        group: bell,
        pos: { x: bellCfg.x, z: bellCfg.z }
      };
    }

    const doorControlCfg = this.L.rightDoorControl;
    if (doorControlCfg) {
      const ctrl = new THREE.Group();
      const cabinet = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 1.3, 0.55),
        material('#27323c', 0.9)
      );
      cabinet.position.y = 0.65;
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 0.7),
        new THREE.MeshStandardMaterial({
          color: '#ffffff',
          emissive: '#ffffff',
          emissiveIntensity: 0.2
        })
      );
      screen.position.set(0, 0.78, 0.29);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: textTexture('右侧下层门控制台', {
            bg: '#101c24',
            fg: '#e7f4ff',
            font: 'bold 30px "Microsoft YaHei", sans-serif',
            width: 420,
            height: 88,
            lineHeight: 38,
            pad: 6
          }),
          transparent: true,
          depthWrite: false
        })
      );
      sprite.position.y = 1.9;
      sprite.scale.set(1.9, 0.5, 1);
      ctrl.add(cabinet, screen, sprite);
      ctrl.position.set(doorControlCfg.x, doorControlCfg.y, doorControlCfg.z);
      this.group.add(ctrl);
      refs.rightDoorControl = {
        group: ctrl,
        screen,
        pos: { x: doorControlCfg.x, y: doorControlCfg.y, z: doorControlCfg.z }
      };
    }

    const controlCfg = this.L.archiveControl;
    const deviceCfg = this.L.autoDevice;
    if (!controlCfg) return;
    refs.archiveSwitches = [];
    for (const sw of this.L.controlSwitches || []) {
      const group = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.65, 0.42),
        material('#2f3a44', 0.9)
      );
      base.position.y = 0.33;
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 12, 10),
        new THREE.MeshStandardMaterial({ color: sw.color, emissive: sw.color, emissiveIntensity: 0.35 })
      );
      lamp.position.set(0, 0.78, 0);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: textTexture(sw.label, {
            bg: '#201a12',
            fg: '#ffe9b8',
            font: 'bold 30px "Microsoft YaHei", sans-serif',
            width: 360,
            height: 88,
            lineHeight: 38,
            pad: 6
          }),
          transparent: true,
          depthWrite: false
        })
      );
      sprite.position.y = 1.5;
      sprite.scale.set(1.7, 0.46, 1);
      group.add(base, lamp, sprite);
      group.position.set(sw.x, sw.y ?? controlCfg.y, sw.z);
      this.group.add(group);
      refs.archiveSwitches.push({
        id: sw.id,
        index: refs.archiveSwitches.length,
        group,
        lamp,
        label: sw.label,
        color: sw.color,
        pos: { x: sw.x, y: sw.y ?? controlCfg.y, z: sw.z },
        on: false
      });
    }

    if (deviceCfg) {
      const device = new THREE.Group();
      const cabinet = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1.5, 0.7),
        material('#20303c', 0.9)
      );
      cabinet.position.y = 0.75;
      const door = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 1.1),
        new THREE.MeshStandardMaterial({ color: '#57cc99', emissive: '#57cc99', emissiveIntensity: 0.12 })
      );
      door.position.set(0, 0.82, 0.36);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: textTexture('自动门控制台', {
            bg: '#10251f',
            fg: '#b8ffe0',
            font: 'bold 32px "Microsoft YaHei", sans-serif',
            width: 420,
            height: 88,
            lineHeight: 38,
            pad: 6
          }),
          transparent: true,
          depthWrite: false
        })
      );
      sprite.position.y = 2.0;
      sprite.scale.set(1.9, 0.5, 1);
      device.add(cabinet, door, sprite);
      device.position.set(deviceCfg.x, deviceCfg.y, deviceCfg.z);
      device.visible = false;
      this.group.add(device);
      refs.autoDevice = {
        group: device,
        pos: { x: deviceCfg.x, y: deviceCfg.y, z: deviceCfg.z },
        visible: false
      };
    }
  }

  _applyDoorLock(door, locked) {
    if (!door?.body) return;
    door.locked = locked;
    if (locked) {
      door.body.collisionFilterGroup = GROUPS.WORLD;
      door.body.collisionFilterMask = GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM;
      door.mesh.visible = true;
      door.lockSign.visible = true;
    } else {
      door.body.collisionFilterGroup = 0;
      door.body.collisionFilterMask = 0;
      door.mesh.visible = false;
      door.lockSign.visible = false;
    }
    door.body.aabbNeedsUpdate = true;
  }

  setDoor(id, locked, opts = {}) {
    const door = this.refs?.doors?.find(d => d.id === id);
    if (!door) return false;
    this._applyDoorLock(door, locked);
    if (opts.silent !== true) {
      this.spawnParticles({ x: door.pos.x, y: 1.5, z: door.pos.z }, locked ? '#c94f3d' : '#8ef0c8');
      this.spawnHitRing({ x: door.pos.x, y: 0.5, z: door.pos.z }, locked ? '#c94f3d' : '#8ef0c8');
      this.events.emit('audio', { name: 'gate' });
    }
    return true;
  }

  _addRegistrationNpc(refs) {
    const npcCfg = this.L.registrationNpc;
    if (!npcCfg) return;
    const paperMat = material('#fff6e3', 0.85);
    const skinMat = material('#f2c79b', 0.8);
    const darkMat = material('#2b2118', 0.85);
    const redMat = material('#d94f5c', 0.9);
    const npcModel = new THREE.Group();
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.34, 0.14), darkMat);
    legL.position.set(-0.11, 0.17, 0);
    const legR = legL.clone();
    legR.position.x = 0.11;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.72, 10), paperMat);
    body.position.y = 0.74;
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.5, 8), paperMat);
    armL.position.set(-0.31, 0.82, 0);
    armL.rotation.z = 0.18;
    const armR = armL.clone();
    armR.position.x = 0.31;
    armR.rotation.z = -0.18;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), skinMat);
    head.position.y = 1.32;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), darkMat);
    hair.position.set(0, 1.47, -0.02);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.28, 10), redMat);
    hat.position.y = 1.68;
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.05), redMat);
    chest.position.set(0, 0.78, 0.2);
    const armBand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.09), redMat);
    armBand.position.set(0.29, 0.96, 0);
    npcModel.add(legL, legR, body, armL, armR, head, hair, hat, chest, armBand);
    npcModel.position.set(npcCfg.x, 0, npcCfg.z);
    this.group.add(npcModel);

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: textTexture('值日生小满 · 纸人', {
          bg: '#fff3cf',
          fg: '#2b2118',
          font: 'bold 44px "Microsoft YaHei", sans-serif',
          width: 512,
          height: 120,
          lineHeight: 54,
          pad: 8
        }),
        transparent: true,
        depthWrite: false
      })
    );
    sprite.position.set(npcCfg.x, 2.05, npcCfg.z);
    sprite.scale.set(1.8, 0.5, 1);
    this.group.add(sprite);
    const lantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 10),
      new THREE.MeshBasicMaterial({ color: '#ffd166' })
    );
    lantern.position.set(npcCfg.x + 0.4, 1.35, npcCfg.z);
    this.group.add(lantern);
    refs.npc = {
      pos: { x: npcCfg.x, z: npcCfg.z },
      sprite,
      model: npcModel
    };
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
    const boardLabel = this.L.missionLabels?.blackboard;
    if (boardLabel) {
      refs.clues[refs.clues.length - 1].beacon = this._addBeacon(refs, {
        x: board.x,
        y: board.y,
        z: board.z,
        text: boardLabel,
        color: '#f4a261'
      });
    }

    const note = this.L.note;
    const noteMesh = makePropMesh('note');
    noteMesh.traverse(child => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.color.set('#ffe9b8');
      }
    });
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
    const noteLabel = this.L.missionLabels?.note;
    if (noteLabel) {
      refs.clues[refs.clues.length - 1].beacon = this._addBeacon(refs, {
        x: note.x,
        y: note.y,
        z: note.z,
        text: noteLabel,
        color: '#ffd166'
      });
    }

    const record = this.L.record;
    if (record) {
      const recordMesh = makePropMesh('note');
      recordMesh.traverse(child => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.material.color.set('#e8b9ad');
        }
      });
      recordMesh.position.set(record.x, record.y, record.z);
      recordMesh.rotation.set(-0.18, 1.1, 0.08);
      recordMesh.scale.setScalar(1.35);
      this.group.add(recordMesh);
      const recordBody = makeBody({
        shape: new CANNON.Box(v3(0.36, 0.25, 0.02)),
        position: { x: record.x, y: record.y, z: record.z },
        group: GROUPS.PROP,
        mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP
      });
      this.physics.add(recordBody);
      refs.clues.push({
        id: 'record',
        mesh: recordMesh,
        body: recordBody,
        pos: { x: record.x, z: record.z }
      });
      const recordLabel = this.L.missionLabels?.record;
      if (recordLabel) {
        refs.clues[refs.clues.length - 1].beacon = this._addBeacon(refs, {
          x: record.x,
          y: record.y,
          z: record.z,
          text: recordLabel,
          color: '#e08f7a'
        });
      }
    }

    const wishPen = this.L.storyPen === false ? null : makeItemMesh('pen');
    if (wishPen) {
      wishPen.scale.setScalar(3.4);
      wishPen.position.set(note.x + 0.65, note.y + 0.12, note.z - 0.2);
      wishPen.rotation.set(0.15, -0.5, 0.15);
      wishPen.traverse(child => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.material.color.set('#ffd166');
        }
      });
      this.group.add(wishPen);
      refs.wishPen = {
        mesh: wishPen,
        pos: {
          x: wishPen.position.x,
          y: wishPen.position.y,
          z: wishPen.position.z
        },
        neatX: wishPen.position.x,
        neatY: wishPen.position.y,
        neatZ: wishPen.position.z,
        state: 'neat',
        marker: this._addBeacon(refs, {
          x: wishPen.position.x,
          y: wishPen.position.y,
          z: wishPen.position.z,
          text: '任务笔 · 小满的圆珠笔',
          color: '#ffd166'
        })
      };
    }
    const platformText = this.L.platformLabel || '值日台';
    const podiumLabel = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: textTexture(platformText, {
          bg: '#4a3b12',
          fg: '#ffd166',
          font: platformText.length > 4
            ? 'bold 52px "Microsoft YaHei", sans-serif'
            : 'bold 60px "Microsoft YaHei", sans-serif',
          width: platformText.length > 4 ? 512 : 256,
          height: 96,
          lineHeight: 58,
          pad: 8
        }),
        transparent: true,
        depthWrite: false
      })
    );
    podiumLabel.position.set(note.x + 0.7, note.y + 1.25, note.z + 0.25);
    podiumLabel.scale.set(platformText.length > 4 ? 2.1 : 1.6, 0.6, 1);
    this.group.add(podiumLabel);
  }

  _addBeacon(refs, { x, y, z, text, color = '#ffd166' }) {
    const group = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.88, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    const beamMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.16
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 8), beamMat);
    beam.position.y = 1.1;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: textTexture(text, {
          bg: '#221a12',
          fg: '#ffe9b8',
          font: 'bold 42px "Microsoft YaHei", sans-serif',
          width: 640,
          height: 128,
          lineHeight: 54,
          pad: 10
        }),
        transparent: true,
        depthWrite: false
      })
    );
    sprite.position.y = 2.5;
    sprite.scale.set(2.25, 0.62, 1);
    group.add(ring, beam, sprite);
    group.position.set(x, y, z);
    this.group.add(group);
    refs.beacons.push({ group, ring, beam, sprite });
    return group;
  }

  markClueRead(id) {
    const clue = this.refs?.clues?.find(c => c.id === id);
    if (clue?.beacon) clue.beacon.visible = false;
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
      locked: true,
      stage: 0
    };
  }

  _addLights(refs) {
    this.ambientLight = new THREE.HemisphereLight('#3d4a5c', '#10141c', 0.26);
    this.group.add(this.ambientLight);
    const sun = new THREE.DirectionalLight('#fff1c8', 3.6);
    sun.position.set(6, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -12;
    this.group.add(sun);
    this.sunLight = sun;

    const fallbackGuide = [
      { x: -6, z: -4, color: '#ffe9c4', r: 20, y: 4.6, intensity: 4.5 },
      { x: 5, z: -3, color: '#ffd9a0', r: 20, y: 4.6, intensity: 4.5 },
      { x: 0, z: 8, color: '#ffe9c4', r: 24, y: 4.8, intensity: 6, important: true }
    ];
    const spots = this.L.guideLights?.length ? this.L.guideLights : fallbackGuide;
    for (const spot of spots) this._addGuideLight(spot);

    for (const clue of refs?.clues || []) {
      const clueY = clue.mesh?.position?.y ?? 1.85;
      this._addGuideLight({
        x: clue.pos.x,
        z: clue.pos.z,
        color: clue.id === 'record' ? '#ffb4a0' : '#ffe08a',
        r: 22,
        y: clueY + 0.7,
        intensity: 7,
        important: true
      });
    }
    if (refs?.exit) {
      this._addGuideLight({
        x: refs.exit.pos.x,
        z: refs.exit.pos.z,
        color: '#8ef0c8',
        r: 24,
        y: 3.8,
        intensity: 8,
        important: true
      });
    }
    if (refs?.charger?.light) {
      this.guideLights.push({ light: refs.charger.light, bulb: null, lamp: null, base: 6 });
    }
    if (refs?.locker?.light) {
      this.guideLights.push({ light: refs.locker.light, bulb: null, lamp: null, base: 5 });
    }
  }

  _addGuideLight(spot) {
    const x = spot.x;
    const z = spot.z;
    const y = spot.y ?? 2.6;
    const color = spot.color || '#ffe9c4';
    const intensity = spot.intensity ?? 0.9;
    const light = new THREE.PointLight(color, intensity, spot.r || 9, 1.8);
    light.position.set(x, y, z);
    this.group.add(light);

    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.12, 0.12, 8),
      material('#5a6470', 0.35, 0.75)
    );
    shade.position.set(0, 0.02, 0);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshBasicMaterial({ color })
    );
    bulb.position.y = -0.12;
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(spot.important ? 0.9 : 0.55, 12, 8),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: spot.important ? 0.17 : 0.1,
        depthWrite: false
      })
    );
    glow.position.y = -0.08;
    const lamp = new THREE.Group();
    lamp.add(shade, bulb, glow);
    lamp.position.set(x, y, z);
    this.group.add(lamp);
    this.guideLights.push({ light, bulb, lamp, base: intensity });
  }

  setDarkness(dark) {
    const d = Math.max(0, Math.min(1, dark));
    if (this.ambientLight) this.ambientLight.intensity = 0.26 * (1 - d * 0.55);
    if (this.sunLight) this.sunLight.intensity = 3.6 * (1 - d * 0.15);
    if (this.threeScene?.fog) {
      this.threeScene.fog.near = 7 - d * 5;
      this.threeScene.fog.far = 22 - d * 14;
    }
  }

  slideRandomDesk() {
    const desks = this.refs?.desks || [];
    if (!desks.length) return;
    const desk = desks[Math.floor(Math.random() * desks.length)];
    const dx = rand(-3, 3);
    const dz = rand(-3, 3);
    desk.body.position.x = desk.base.x + dx;
    desk.body.position.z = desk.base.z + dz;
    desk.body.aabbNeedsUpdate = true;
    desk.slid = true;
    desk.mesh.position.set(desk.body.position.x, desk.body.position.y - 0.38, desk.body.position.z);
  }

  applyCosmetics(unlocks = {}) {
    if (unlocks.office_plant && !this._plantCosmetic) {
      const x = this.L.charger.x + 1.4;
      const z = this.L.charger.z;
      const group = new THREE.Group();
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
      group.add(pot, leaves);
      group.position.set(x, 0, z);
      this.group.add(group);
      this._plantCosmetic = group;
    }
    if (unlocks.office_vip && !this._vipSign) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: textTexture('VIP 打工人', {
            bg: '#4a1f2c',
            fg: '#ffd166',
            font: 'bold 58px "Microsoft YaHei", sans-serif',
            width: 512,
            height: 160,
            lineHeight: 80,
            pad: 10
          }),
          transparent: true,
          depthWrite: false
        })
      );
      sprite.position.set(this.L.charger.x, 2.8, this.L.charger.z);
      sprite.scale.set(1.8, 0.5, 1);
      this.group.add(sprite);
      this._vipSign = sprite;
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

  setExitGreenLock() {
    const exit = this.refs?.exit;
    if (!exit || exit.stage >= 1) return;
    exit.stage = 1;
    exit.lockMesh.material.color.set(PALETTE.exit);
    exit.lockMesh.material.opacity = 0.42;
    this.spawnHitRing({ x: exit.pos.x, y: 0.5, z: exit.pos.z }, '#57cc99');
    this.spawnParticles({ x: exit.pos.x, y: 1.5, z: exit.pos.z }, '#57cc99');
  }

  openExit() {
    const exit = this.refs?.exit;
    if (!exit || !exit.locked) return;
    exit.locked = false;
    exit.stage = 2;
    exit.lockMesh.visible = false;
    exit.beacon.visible = true;
    this.events.emit('toast', { text: '出口开了！快跑！', ms: 2400 });
    this.events.emit('audio', { name: 'gate' });
  }

  dropWageSlip(x, z) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: textTexture('工资单 · E 捡回', {
          bg: '#fff0c0',
          fg: '#5a4310',
          font: 'bold 36px "Microsoft YaHei", sans-serif',
          width: 380,
          height: 88,
          lineHeight: 40,
          pad: 6
        }),
        transparent: true,
        depthWrite: false
      })
    );
    sprite.position.set(x, 1.35, z);
    sprite.scale.set(1.5, 0.42, 1);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.72, 24),
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
    this.group.add(sprite, ring);
    this.refs.wageSlips.push({ mesh: sprite, ring, x, z });
    this.spawnParticles({ x, y: 0.8, z }, '#ffe08a');
  }

  clearWageSlips() {
    for (const slip of this.refs?.wageSlips || []) {
      this.group.remove(slip.mesh);
      this.group.remove(slip.ring);
    }
    if (this.refs) this.refs.wageSlips = [];
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

  spawnAirSlash(from, to, color = '#ffd166', duration = 0.35) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz) || 0.1;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(len, 0.34, 0.05),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    mesh.position.set((from.x + to.x) / 2, 1.25, (from.z + to.z) / 2);
    mesh.rotation.y = Math.atan2(dx, dz);
    this.group.add(mesh);
    this.particles.push({ mesh, ttl: duration, maxTtl: duration, trail: true });
  }

  spawnClawSwipe(pos, yaw, color = '#9fc0a8', duration = 0.4) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    for (let i = -1; i <= 1; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 8), mat);
      claw.position.set(i * 0.18, 0, 0.22);
      claw.rotation.x = Math.PI / 2;
      group.add(claw);
    }
    group.position.set(pos.x, pos.y, pos.z);
    group.rotation.y = yaw;
    this.group.add(group);
    this.particles.push({ mesh: group, ttl: duration, maxTtl: duration, group: true });
  }

  spawnHorse(pos) {
    const group = new THREE.Group();
    const bodyMat = material('#7c4a2d', 0.9);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 1.1), bodyMat);
    body.position.y = 0.75;
    group.add(body);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.28), bodyMat);
    neck.position.set(0, 1.15, -0.5);
    group.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.5), bodyMat);
    head.position.set(0, 1.45, -0.85);
    group.add(head);
    for (const [x, z] of [[-0.28, 0.45], [0.28, 0.45], [-0.28, -0.45], [0.28, -0.45]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 6), bodyMat);
      leg.position.set(x, 0.28, z);
      group.add(leg);
    }
    group.position.set(pos.x, 0, pos.z);
    group.rotation.y = Math.random() * Math.PI * 2;
    this.group.add(group);
    this.particles.push({ mesh: group, ttl: 2.5, maxTtl: 2.5, group: true });
  }

  update(dt, game) {
    const currentStage = game.currentStage();
    const rampage = game.deskRampageUntil > nowSec();
    if (currentStage.id === 'angry' || currentStage.id === 'furious' || currentStage.id === 'insane') {
      this._deskShakeUntil = nowSec() + 0.15;
    }
    if (currentStage.id === 'furious' || currentStage.id === 'insane') {
      this._lockerShakeUntil = nowSec() + 0.15;
    }
    for (const d of this.refs?.desks || []) {
      if (d.slid) {
        d.mesh.position.set(d.body.position.x, d.body.position.y - 0.38, d.body.position.z);
      } else if (nowSec() < this._deskShakeUntil) {
        d.mesh.position.x = d.base.x + rand(-0.04, 0.04) * (rampage ? 3 : 1);
        d.mesh.position.z = d.base.z + rand(-0.04, 0.04) * (rampage ? 3 : 1);
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
        if (p.group) {
          for (const child of p.mesh.children) child.material?.dispose();
        } else {
          p.mesh.material?.dispose();
        }
        this.particles.splice(i, 1);
      } else if (p.ring) {
        p.mesh.scale.setScalar(1 + (0.45 - p.ttl) * 6);
        p.mesh.material.opacity = Math.max(0, p.ttl / 0.45);
      } else if (p.group) {
        for (const child of p.mesh.children) {
          child.material.opacity = Math.max(0, p.ttl / p.maxTtl);
        }
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
    for (const g of this.guideLights) {
      if (lightsOut) {
        g.light.intensity = 0;
        if (g.lamp) g.lamp.visible = false;
        if (g.bulb) g.bulb.visible = false;
      } else {
        g.light.intensity = g.base ?? 0.9;
        if (g.lamp) g.lamp.visible = true;
        if (g.bulb) g.bulb.visible = true;
      }
    }
    for (const light of this.flickerLights) {
      if (lightsOut) {
        light.intensity = 0;
      } else if (insane) {
        light.intensity = 0.12 + Math.random() * 0.45;
      } else {
        light.intensity = 0.3;
      }
    }

    const beaconT = nowSec();
    for (const b of this.refs?.beacons || []) {
      if (!b.group.visible) continue;
      const pulse = 1 + Math.sin(beaconT * 3.2) * 0.07;
      b.ring.scale.setScalar(pulse);
      b.beam.material.opacity = 0.12 + (Math.sin(beaconT * 3.2) * 0.5 + 0.5) * 0.12;
      b.sprite.material.opacity = 0.82 + Math.sin(beaconT * 2.4) * 0.18;
    }
    for (const bubble of this.refs?.bubbles || []) {
      const pulse = 1 + Math.sin(beaconT * 2.2) * 0.12;
      bubble.sphere.scale.setScalar(pulse);
      const unlocked = !bubble.requireClue || game.hasClue(bubble.requireClue);
      bubble.sphere.material.opacity = unlocked
        ? 0.2 + (Math.sin(beaconT * 2.2) * 0.5 + 0.5) * 0.2
        : 0.08;
      if (bubble.lockLabel) bubble.lockLabel.visible = !unlocked;
      bubble.ring.scale.setScalar(pulse * 1.15);
    }
    const storyPen = this.refs?.wishPen;
    if (storyPen?.marker) {
      storyPen.marker.visible = !game.ghostWishHelped;
      if (storyPen.marker.visible) {
        storyPen.marker.position.set(
          storyPen.mesh.position.x,
          storyPen.mesh.position.y,
          storyPen.mesh.position.z
        );
      }
    }
  }
}
