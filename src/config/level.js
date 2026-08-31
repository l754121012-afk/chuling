export const LEVEL_CONFIG = {
  classroom: { minX: -11, maxX: 11, minZ: -7, maxZ: 5 },
  corridor: { minX: -4.5, maxX: 4.5, minZ: 5, maxZ: 20 },
  playerStart: { x: 0, z: 4.3 },
  ghostSpawn: { x: 0, z: -5.8 },
  desks: [
    { x: -8, z: -4.8, rotY: 0 },
    { x: -4, z: -4.8, rotY: 0 },
    { x: 0, z: -4.8, rotY: 0 },
    { x: 4, z: -4.8, rotY: 0 },
    { x: 8, z: -4.8, rotY: 0 },
    { x: -8, z: -1.8, rotY: 0 },
    { x: -4, z: -1.8, rotY: 0 },
    { x: 0, z: -1.8, rotY: 0 },
    { x: 4, z: -1.8, rotY: 0 },
    { x: 8, z: -1.8, rotY: 0 },
    { x: -6, z: 1.4, rotY: 0 },
    { x: -2, z: 1.4, rotY: 0 },
    { x: 2, z: 1.4, rotY: 0 },
    { x: 6, z: 1.4, rotY: 0 }
  ],
  teacherDesk: { x: 9.2, z: -5.2, rotY: 0.3 },
  bookshelf: { x: -10.4, z: -3.0, rotY: 0.2 },
  lockers: { x: 8.8, z: 2.2, rotY: -0.3 },
  trashCan: { x: 0, z: 3.6 },
  blackboard: { x: 0, z: -6.86, y: 1.85, w: 4.4, h: 1.25 },
  note: { x: 9.2, y: 1.95, z: -5.0 },
  exit: { x: 0, z: 19.5 },
  platform: { x: 9.2, z: -5.2, w: 4.0, h: 1.0, d: 3.2 },
  lockerStep: { x: 7.8, z: 2.2, w: 1.3, h: 0.85, d: 0.9 },
  pillars: [
    { x: -5, z: -2.5, r: 0.55 },
    { x: 5, z: -2.5, r: 0.55 },
    { x: -5, z: 1.5, r: 0.55 },
    { x: 5, z: 1.5, r: 0.55 }
  ],
  plant: { x: 10.3, z: 2.0 },
  crates: [
    { x: 6.4, z: -3.2 },
    { x: -1.5, z: 3.2 }
  ],
  crateTarget: { x: 8.0, z: -1.8, r: 1.3 },
  highCatwalk: [
    { from: { x: 10.2, z: -1.5 }, to: { x: 10.2, z: 4.6 }, y: 4.0 },
    { from: { x: 10.2, z: 4.6 }, to: { x: 0, z: 4.6 }, y: 4.0 }
  ],
  palletStack: { x: -2.5, z: -4.8, tiers: [0.5, 1.1, 1.7] },
  wallLedges: [
    { x: 10.2, z: -1.5, y: 1.6 },
    { x: 10.2, z: -1.5, y: 2.8 },
    { x: 10.2, z: -1.5, y: 4.0 }
  ],
  slideRamp: { x: 8.0, z: -1.5, length: 6.0, tilt: -0.5 },
  rope: { from: { x: -5, z: -2.5 }, to: { x: 5, z: -2.5 }, y: 3.0 },
  ladders: [
    { x: 10.2, z: -1.5, topY: 4.0 }
  ],
  routeClutter: [
    { x: 0, z: 3.8, rot: 0.25 },
    { x: -2, z: 2.4, rot: -0.2 },
    { x: 2, z: 2.4, rot: 0.2 },
    { x: -4, z: 3.2, rot: 0.35 },
    { x: 0, z: 8.0, rot: 0.1 }
  ],
  clutter: [
    { x: -3.5, z: 4.0 },
    { x: 3.5, z: 4.2 },
    { x: -8.0, z: 3.5 },
    { x: 8.0, z: 3.6 }
  ],
  itemSpawns: [
    { id: 'pen', x: -8, y: 0.78, z: -4.8 },
    { id: 'pen', x: -4, y: 0.78, z: -4.8 },
    { id: 'pen', x: 4, y: 0.78, z: -4.8 },
    { id: 'glue', x: 0, y: 0.78, z: -4.8 },
    { id: 'stapler', x: 9.2, y: 1.95, z: -5.15 },
    { id: 'crossbow', x: 8.8, y: 2.0, z: 2.2 },
    { id: 'tape', x: 4, y: 0.78, z: -4.8 },
    { id: 'pen', x: 0, y: 0.06, z: 10.0 },
    { id: 'mine', x: 0, y: 0.06, z: 10.0 }
  ]
};
