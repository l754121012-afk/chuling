import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GROUPS, makeBody, syncMeshToBody, v3 } from '../core/Physics.js';
import {
  material,
  makePropMesh,
  makeFootprintMesh
} from '../core/PlaceholderAssets.js';
import { PALETTE } from '../config/palette.js';
import { LEVEL_CONFIG } from '../config/level.js';

export class SchoolScene {
  constructor(physics, events) {
    this.physics = physics;
    this.events = events;
    this.group = new THREE.Group();
    this.flickerLights = [];
    this.footprints = [];
    this.refs = null;
  }

  build() {
    const refs = {
      playerStart: { ...LEVEL_CONFIG.playerStart },
      ghostSpawn: { ...LEVEL_CONFIG.ghostSpawn },
      exit: null,
      locker: null,
      clues: [],
      props: [],
      itemSpawns: LEVEL_CONFIG.itemSpawns.map(s => ({ ...s }))
    };

    this._addFloor();
    this._addWalls();
    this._addProps(refs);
    this._addClues(refs);
    this._addExit(refs);
    this._addLights();

    this.refs = refs;
    return refs;
  }

  _addFloor() {
    this._box(26, 0.4, 20, { x: 0, y: -0.2, z: 4 }, PALETTE.floor);
    const darkFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 9),
      new THREE.MeshStandardMaterial({ color: PALETTE.floorDark, roughness: 0.95 })
    );
    darkFloor.rotation.x = -Math.PI / 2;
    darkFloor.position.set(0, 0.01, -1);
    this.group.add(darkFloor);
  }

  _addWalls() {
    const wallColor = PALETTE.wall;
    const wallTrim = PALETTE.wallTrim;

    this._box(14, 3.5, 0.25, { x: 0, y: 1.75, z: -5 }, wallColor);
    this._box(0.25, 3.5, 8.5, { x: 7, y: 1.75, z: -1 }, wallColor);
    this._box(0.25, 3.5, 8.5, { x: -7, y: 1.75, z: -1 }, wallColor);
    this._box(5.5, 3.5, 0.25, { x: -4.25, y: 1.75, z: 3 }, wallColor);
    this._box(5.5, 3.5, 0.25, { x: 4.25, y: 1.75, z: 3 }, wallColor);
    this._box(0.25, 3.5, 8.5, { x: -3, y: 1.75, z: 7 }, wallColor);
    this._box(0.25, 3.5, 8.5, { x: 3, y: 1.75, z: 7 }, wallColor);
    this._box(6, 3.5, 0.25, { x: 0, y: 1.75, z: 11 }, wallColor);
    this._box(3, 0.7, 0.25, { x: 0, y: 3.15, z: 3 }, wallTrim);

    const base = this._box(14, 0.22, 0.3, { x: 0, y: 0.11, z: -4.88 }, wallTrim);
    base.mesh.visible = false;
  }

  _addProps(refs) {
    for (const desk of LEVEL_CONFIG.desks) {
      const mesh = makePropMesh('desk');
      mesh.position.set(desk.x, 0, desk.z);
      mesh.rotation.y = desk.rotY;
      this.group.add(mesh);
      const body = makeBody({
        shape: new CANNON.Box(v3(0.4, 0.38, 0.28)),
        position: { x: desk.x, y: 0.38, z: desk.z },
        group: GROUPS.WORLD,
        mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
      });
      this.physics.add(body);
    }

    const teacher = LEVEL_CONFIG.teacherDesk;
    const teacherMesh = makePropMesh('teacherDesk');
    teacherMesh.position.set(teacher.x, 0, teacher.z);
    teacherMesh.rotation.y = teacher.rotY;
    this.group.add(teacherMesh);
    const teacherBody = makeBody({
      shape: new CANNON.Box(v3(0.58, 0.48, 0.33)),
      position: { x: teacher.x, y: 0.48, z: teacher.z },
      group: GROUPS.WORLD,
      mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
    });
    this.physics.add(teacherBody);

    const shelf = LEVEL_CONFIG.bookshelf;
    const shelfMesh = makePropMesh('bookshelf');
    shelfMesh.position.set(shelf.x, 0, shelf.z);
    shelfMesh.rotation.y = shelf.rotY;
    this.group.add(shelfMesh);
    const shelfBody = makeBody({
      shape: new CANNON.Box(v3(0.55, 1.0, 0.25)),
      position: { x: shelf.x, y: 1.0, z: shelf.z },
      mass: 45,
      group: GROUPS.PROP,
      mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
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
      used: false
    });

    const lockerPos = LEVEL_CONFIG.lockers;
    const lockerMesh = makePropMesh('lockers');
    lockerMesh.position.set(lockerPos.x, 0, lockerPos.z);
    lockerMesh.rotation.y = lockerPos.rotY;
    this.group.add(lockerMesh);
    const lockerBody = makeBody({
      shape: new CANNON.Box(v3(0.78, 1.0, 0.28)),
      position: { x: lockerPos.x, y: 1.0, z: lockerPos.z },
      group: GROUPS.WORLD,
      mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
    });
    this.physics.add(lockerBody);
    refs.locker = {
      mesh: lockerMesh,
      body: lockerBody,
      pos: { x: lockerPos.x, z: lockerPos.z }
    };

    const trash = LEVEL_CONFIG.trashCan;
    const trashMesh = makePropMesh('trashCan');
    trashMesh.position.set(trash.x, 0, trash.z);
    this.group.add(trashMesh);
    const trashBody = new CANNON.Body({
      mass: 6,
      shape: new CANNON.Cylinder(0.28, 0.22, 0.72, 12),
      position: v3(trash.x, 0.55, trash.z),
      collisionFilterGroup: GROUPS.PROP,
      collisionFilterMask: GROUPS.WORLD | GROUPS.GHOST | GROUPS.PROP | GROUPS.ITEM
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
      used: false
    });
  }

  _addClues(refs) {
    const board = LEVEL_CONFIG.blackboard;
    const boardMesh = makePropMesh('blackboard');
    boardMesh.position.set(board.x, board.y, board.z);
    boardMesh.rotation.y = Math.PI;
    this.group.add(boardMesh);
    const boardBody = makeBody({
      shape: new CANNON.Box(v3(2.2, 0.62, 0.05)),
      position: { x: board.x, y: board.y, z: board.z },
      group: GROUPS.WORLD,
      mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST
    });
    this.physics.add(boardBody);
    refs.clues.push({
      id: 'blackboard',
      mesh: boardMesh,
      body: boardBody,
      pos: { x: board.x, z: board.z }
    });

    const note = LEVEL_CONFIG.note;
    const noteMesh = makePropMesh('note');
    noteMesh.position.set(note.x, note.y, note.z);
    noteMesh.rotation.y = -0.4;
    noteMesh.rotation.x = -0.15;
    this.group.add(noteMesh);
    const noteBody = makeBody({
      shape: new CANNON.Box(v3(0.36, 0.25, 0.02)),
      position: { x: note.x, y: note.y, z: note.z },
      group: GROUPS.WORLD,
      mask: GROUPS.WORLD | GROUPS.PLAYER | GROUPS.GHOST
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
    const exit = LEVEL_CONFIG.exit;
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

    refs.exit = {
      mesh,
      body,
      lockMesh,
      pos: { x: exit.x, z: exit.z },
      locked: true
    };
  }

  _addLights() {
    this.group.add(new THREE.HemisphereLight('#f7f3ea', '#2b3245', 0.95));
    const sun = new THREE.DirectionalLight('#fff4dc', 1.25);
    sun.position.set(5, 10, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -8;
    this.group.add(sun);

    const flicker = [
      { x: -5, z: -3.5, color: '#ffe9c4' },
      { x: 4, z: -2, color: '#ffd9a0' },
      { x: -2, z: 2.2, color: '#d9f0ff' },
      { x: 0, z: 6, color: '#ffe9c4' }
    ];
    for (const f of flicker) {
      const light = new THREE.PointLight(f.color, 0.7, 11, 1.8);
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

  update(dt, game) {
    for (const prop of this.refs?.props || []) {
      if (prop.body && prop.mesh) syncMeshToBody(prop.mesh, prop.body);
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
    for (const light of this.flickerLights) {
      if (insane) {
        light.intensity = 0.25 + Math.random() * 0.95;
      } else {
        light.intensity = 0.7;
      }
    }
  }
}
