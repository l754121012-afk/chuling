import * as THREE from 'three';
import { PALETTE } from '../config/palette.js';
import { ITEM_DEFS } from '../config/items.js';

const matCache = new Map();

export function material(color, rough = 0.85, metal = 0) {
  const key = `${color}-${rough}-${metal}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: metal
    }));
  }
  return matCache.get(key);
}

function canvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function textTexture(text, opts = {}) {
  const {
    width = 512,
    height = 256,
    bg = PALETTE.paper,
    fg = PALETTE.ink,
    font = 'bold 44px "Microsoft YaHei", sans-serif',
    lineHeight = 56,
    pad = 24
  } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = String(text).split('\n');
  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, height / 2 + (i - (lines.length - 1) / 2) * lineHeight + pad * 0.4);
  });
  return canvasTexture(canvas);
}

function faceTexture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = kind === 'ghost' ? PALETTE.ghostFace : PALETTE.playerSkin;
  ctx.beginPath();
  ctx.arc(128, 128, 108, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = kind === 'ghost' ? '#f3efe7' : '#24303c';
  if (kind === 'ghost') {
    ctx.beginPath();
    ctx.arc(88, 100, 13, 0, Math.PI * 2);
    ctx.arc(168, 100, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(128, 162, 38, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#24303c';
    ctx.beginPath();
    ctx.arc(96, 104, 12, 0, Math.PI * 2);
    ctx.arc(160, 104, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#24303c';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(128, 132, 28, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = '#5d4632';
    ctx.beginPath();
    ctx.arc(120, 30, 58, Math.PI, 0);
    ctx.fill();
  }
  return canvasTexture(canvas);
}

export function iconTexture(char, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = color;
  ctx.font = 'bold 76px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char, 64, 70);
  return canvasTexture(canvas);
}

function makeItemShape(id) {
  const group = new THREE.Group();
  const mat = material(PALETTE[id] || PALETTE.ink, 0.75, 0.15);
  const dark = material(PALETTE.ink, 0.7, 0.1);

  if (id === 'pen') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 10), mat);
    body.rotation.z = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 8), dark);
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 0.21;
    group.add(body, tip);
  } else if (id === 'glue') {
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.26, 12), mat);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.12, 10), dark);
    cap.position.y = 0.19;
    group.add(bottle, cap);
  } else if (id === 'stapler') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.16), mat);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.14), dark);
    top.position.y = 0.07;
    group.add(base, top);
  } else if (id === 'scissors') {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.025, 0.05), mat);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.025, 0.05), dark);
    a.rotation.y = 0.15;
    b.rotation.y = -0.15;
    group.add(a, b);
  } else if (id === 'tape') {
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.12), mat);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.11, 10), dark);
    roll.rotation.z = Math.PI / 2;
    group.add(shell, roll);
  } else if (id === 'rubber') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 8, 18), mat);
    group.add(ring);
  } else if (id === 'eraser') {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.16), mat);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.2), dark);
    handle.position.y = 0.06;
    group.add(pad, handle);
  } else if (id === 'chair') {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), mat);
    seat.position.y = 0.25;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.06), dark);
    back.position.set(0, 0.52, -0.18);
    const legMat = dark;
    for (const [lx, lz] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.24, 6), legMat);
      leg.position.set(lx, 0.12, lz);
      group.add(leg);
    }
    group.add(seat, back);
  } else if (id === 'crossbow') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.34), mat);
    const bow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.05), dark);
    bow.position.set(0, 0.08, -0.14);
    group.add(stock, bow);
  } else if (id === 'mine') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10), mat);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), dark);
    spike.position.y = 0.1;
    group.add(body, spike);
  } else {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.12), mat));
  }
  return group;
}

export function makeItemMesh(id) {
  const mesh = makeItemShape(id);
  mesh.userData.assetKey = `item:${id}`;
  return mesh;
}

export function makeItemMarker(id) {
  const group = new THREE.Group();
  const def = ITEM_DEFS[id] || {};
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.37, 24),
    new THREE.MeshBasicMaterial({
      color: '#ffe08a',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: iconTexture(def.icon || '?', '#ffe08a'),
      transparent: true,
      depthWrite: false
    })
  );
  sprite.position.y = 0.62;
  sprite.scale.set(0.48, 0.48, 1);
  group.add(ring, sprite);
  group.userData.marker = { ring, sprite, t: 0 };
  return group;
}

export function makeWeakPointMarker() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.16, 0.22, 20),
    new THREE.MeshBasicMaterial({
      color: '#7CFC00',
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  ring.rotation.y = Math.PI;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: iconTexture('弱', '#7CFC00'),
      transparent: true,
      depthWrite: false
    })
  );
  sprite.scale.set(0.32, 0.32, 1);
  group.add(ring, sprite);
  return group;
}

function limbMesh(from, to, radius, mat) {
  const a = new THREE.Vector3(from[0], from[1], from[2]);
  const b = new THREE.Vector3(to[0], to[1], to[2]);
  const dir = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 8), mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return mesh;
}

export function makePlayerMesh() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: PALETTE.player, roughness: 0.7, metalness: 0.05 });
  const skinMat = new THREE.MeshStandardMaterial({ color: PALETTE.playerSkin, roughness: 0.8, metalness: 0 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.8, 12), bodyMat);
  body.position.y = 0.85;

  const legL = limbMesh([-0.13, 0.62, 0], [-0.13, 0.08, 0], 0.09, bodyMat);
  const legR = limbMesh([0.13, 0.62, 0], [0.13, 0.08, 0], 0.09, bodyMat);
  const footMat = new THREE.MeshStandardMaterial({ color: PALETTE.ink, roughness: 0.75, metalness: 0.1 });
  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.26), footMat);
  footL.position.set(-0.13, 0.045, 0.03);
  const footR = footL.clone();
  footR.position.x = 0.13;

  const armLGroup = new THREE.Group();
  armLGroup.position.set(-0.28, 1.25, 0);
  const armLMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.58, 8), bodyMat);
  armLMesh.position.set(0, -0.32, 0.08);
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), skinMat);
  handL.position.set(0, -0.56, 0.18);
  armLGroup.add(armLMesh, handL);

  const armRGroup = new THREE.Group();
  armRGroup.position.set(0.28, 1.25, 0);
  const armRMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.58, 8), bodyMat);
  armRMesh.position.set(0, -0.32, 0.08);
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), skinMat);
  handR.position.set(0, -0.56, 0.18);
  const handSlot = new THREE.Group();
  handSlot.position.set(0, -0.56, 0.2);
  armRGroup.add(armRMesh, handR, handSlot);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 14), skinMat);
  head.position.y = 1.55;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.38, 0.38),
    new THREE.MeshBasicMaterial({ map: faceTexture('player'), transparent: true })
  );
  face.position.set(0, 1.58, 0.27);
  const backpackMat = new THREE.MeshStandardMaterial({ color: PALETTE.wallTrim, roughness: 0.85 });
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.22), backpackMat);
  backpack.position.set(0, 0.9, -0.36);

  armLGroup.rotation.z = -0.45;
  armRGroup.rotation.x = -0.55;
  armRGroup.rotation.z = -0.15;

  group.add(body, legL, legR, footL, footR, armLGroup, armRGroup, head, face, backpack);
  group.userData.parts = {
    body,
    head,
    armL: armLGroup,
    armR: armRGroup,
    handSlot
  };
  group.userData.materials = { bodyMat, skinMat, footMat, backpackMat };
  group.userData.handSlot = handSlot;
  group.userData.assetKey = 'player';
  return group;
}

export function makeGhostMesh(hat = false) {
  const group = new THREE.Group();
  const ghostMat = new THREE.MeshStandardMaterial({
    color: PALETTE.ghost,
    roughness: 0.65,
    metalness: 0.02
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 16), ghostMat);
  body.position.y = 1.15;
  body.scale.set(1, 1.18, 0.85);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.55, 14), ghostMat);
  tail.position.y = 0.65;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 14), ghostMat);
  head.position.set(0, 1.72, 0.08);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.42),
    new THREE.MeshBasicMaterial({ map: faceTexture('ghost'), transparent: true })
  );
  face.position.set(0, 1.75, 0.33);
  const handMat = new THREE.MeshStandardMaterial({
    color: 0xe9f2d8,
    emissive: 0x5a7a5a,
    emissiveIntensity: 0.25,
    roughness: 0.7
  });
  const clawMat = new THREE.MeshStandardMaterial({
    color: 0x7c8f82,
    emissive: 0x2c4038,
    emissiveIntensity: 0.2,
    roughness: 0.8
  });
  const makeGhostHand = () => {
    const hand = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), handMat);
    hand.add(palm);
    for (let i = -1; i <= 1; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.36, 8), clawMat);
      claw.position.set(i * 0.12, -0.34, 0);
      claw.rotation.x = Math.PI;
      hand.add(claw);
    }
    return hand;
  };

  const armLGroup = new THREE.Group();
  armLGroup.position.set(-0.75, 1.35, 0);
  armLGroup.rotation.z = 0.75;
  const armLMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8), ghostMat);
  armLMesh.position.y = -0.3;
  const handL = makeGhostHand();
  handL.position.set(0, -0.66, 0);
  armLGroup.add(armLMesh, handL);

  const armRGroup = new THREE.Group();
  armRGroup.position.set(0.75, 1.35, 0);
  armRGroup.rotation.z = -0.75;
  const armRMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8), ghostMat);
  armRMesh.position.y = -0.3;
  const handR = makeGhostHand();
  handR.position.set(0, -0.66, 0);
  armRGroup.add(armRMesh, handR);

  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(1.0, 16, 12),
    new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.BackSide
    })
  );
  aura.position.y = 1.2;

  const flames = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.26, 6),
      new THREE.MeshBasicMaterial({ color: '#9b5de5', transparent: true, opacity: 0.9 })
    );
    flame.userData.offset = {
      angle: (i / 10) * Math.PI * 2,
      speed: 1.2 + Math.random() * 1.5,
      rise: Math.random()
    };
    flame.visible = false;
    flames.add(flame);
  }

  group.add(body, tail, head, face, armLGroup, armRGroup, aura, flames);
  if (hat) {
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x2c2c34, roughness: 0.6 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.04, 12), hatMat);
    brim.position.set(0, 2.02, 0.08);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.22, 12), hatMat);
    crown.position.set(0, 2.15, 0.08);
    group.add(brim, crown);
  }
  group.userData.ghostMat = ghostMat;
  group.userData.aura = aura;
  group.userData.flames = flames;
  group.userData.armL = armLGroup;
  group.userData.armR = armRGroup;
  group.userData.handR = handR;
  group.userData.assetKey = 'ghost';
  return group;
}

export function makePropMesh(type) {
  const group = new THREE.Group();
  if (type === 'desk') {
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.55), material('#b9926a', 0.9));
    top.position.y = 0.72;
    const legs = [new THREE.Vector3(-0.33, 0.35, -0.2), new THREE.Vector3(0.33, 0.35, -0.2),
      new THREE.Vector3(-0.33, 0.35, 0.2), new THREE.Vector3(0.33, 0.35, 0.2)];
    for (const p of legs) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), material('#7c644d'));
      leg.position.copy(p);
      group.add(leg);
    }
    group.add(top);
  } else if (type === 'teacherDesk') {
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.07, 0.65), material('#9a7049', 0.9));
    top.position.y = 0.95;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.95, 0.6), material('#7c644d', 0.9));
    body.position.y = 0.475;
    group.add(top, body);
  } else if (type === 'bookshelf') {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.0, 0.5), material('#8a6240', 0.9));
    frame.position.y = 1.0;
    group.add(frame);
    for (let i = 0; i < 3; i++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.05, 0.42), material('#b9926a'));
      shelf.position.y = 0.55 + i * 0.55;
      group.add(shelf);
    }
  } else if (type === 'lockers') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.7, 0.55), material('#5d7d8a', 0.65, 0.2));
    box.position.y = 0.85;
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.6, 0.56), material('#31434a'));
    line.position.y = 0.85;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.08), material('#31434a'));
    handle.position.set(0.55, 1.2, 0.3);
    group.add(box, line, handle);
  } else if (type === 'trashCan') {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.72, 12), material('#6f8f5f', 0.75));
    can.position.y = 0.36;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 8, 16), material('#4d6843'));
    rim.position.y = 0.72;
    rim.rotation.x = Math.PI / 2;
    group.add(can, rim);
  } else if (type === 'blackboard') {
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 1.25),
      new THREE.MeshBasicMaterial({
        map: textTexture('别踩脚印！！', {
          bg: PALETTE.board, fg: PALETTE.chalk, font: 'bold 92px "Microsoft YaHei", sans-serif',
          width: 1024, height: 256, lineHeight: 120, pad: 0
        })
      })
    );
    const frame = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.45, 0.08), material(PALETTE.wallTrim));
    frame.position.z = 0.05;
    group.add(board, frame);
  } else if (type === 'note') {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.5),
      new THREE.MeshBasicMaterial({
        map: textTexture('它怕订书机的咔嚓声…\n趁它冷静从背后下手。', {
          bg: PALETTE.paper, fg: PALETTE.ink, font: 'bold 30px "Microsoft YaHei", sans-serif',
          width: 512, height: 256, lineHeight: 64, pad: 20
        })
      })
    );
    group.add(plane);
  } else if (type === 'exitGate') {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.0, 0.18), material('#4b5563', 0.6, 0.2));
    frame.position.y = 1.5;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.55),
      new THREE.MeshBasicMaterial({
        map: textTexture('出口', { bg: '#14532d', fg: '#f6f2e8', font: 'bold 70px "Microsoft YaHei", sans-serif', width: 256, height: 96, lineHeight: 80, pad: 4 })
      })
    );
    sign.position.set(0, 2.45, 0.1);
    group.add(frame, sign);
  } else {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), material(PALETTE.accent)));
  }
  return group;
}

export function makeFootprintMesh() {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.28,
    depthWrite: false
  });
  const a = new THREE.Mesh(new THREE.CircleGeometry(0.09, 10), mat);
  a.rotation.x = -Math.PI / 2;
  a.position.x = -0.07;
  const b = a.clone();
  b.position.x = 0.07;
  group.add(a, b);
  return group;
}

export function makeTrapMesh() {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.025, 1.1),
    new THREE.MeshStandardMaterial({
      color: PALETTE.tape,
      transparent: true,
      opacity: 0.85,
      roughness: 0.4
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  return mesh;
}

export function makeGluePuddleMesh() {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.65, 18),
    new THREE.MeshStandardMaterial({
      color: PALETTE.glue,
      transparent: true,
      opacity: 0.75,
      roughness: 0.15,
      metalness: 0
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.015;
  return mesh;
}
