import * as THREE from 'three';
import { PALETTE } from '../config/palette.js';

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

export function makePlayerMesh() {
  const group = new THREE.Group();
  const bodyMat = material(PALETTE.player, 0.7, 0.05);
  const skinMat = material(PALETTE.playerSkin, 0.8, 0);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.85, 12), bodyMat);
  body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 14), skinMat);
  head.position.y = 1.55;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.38, 0.38),
    new THREE.MeshBasicMaterial({ map: faceTexture('player'), transparent: true })
  );
  face.position.set(0, 1.58, 0.27);
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.22), material(PALETTE.wallTrim, 0.85));
  backpack.position.set(0, 0.9, -0.36);
  group.add(body, head, face, backpack);
  group.userData.assetKey = 'player';
  return group;
}

export function makeGhostMesh() {
  const group = new THREE.Group();
  const ghostMat = material(PALETTE.ghost, 0.65, 0.02);
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
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), ghostMat);
  armL.position.set(-0.55, 1.35, 0);
  armL.rotation.z = 0.5;
  const armR = armL.clone();
  armR.position.x = 0.55;
  armR.rotation.z = -0.5;
  group.add(body, tail, head, face, armL, armR);
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
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.55, 0.6), material('#7c644d', 0.9));
    body.position.y = 0.42;
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
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.55, 2.0, 0.55), material('#5d7d8a', 0.65, 0.2));
    box.position.y = 1.0;
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.9, 0.56), material('#31434a'));
    line.position.y = 1.0;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.08), material('#31434a'));
    handle.position.set(0.55, 1.35, 0.3);
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
