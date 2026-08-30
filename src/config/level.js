export const LEVEL_CONFIG = {
  classroom: { minX: -7, maxX: 7, minZ: -5, maxZ: 3 },
  corridor: { minX: -3, maxX: 3, minZ: 3, maxZ: 11 },
  playerStart: { x: 0, z: 2.3 },
  ghostSpawn: { x: 0, z: -3.6 },
  desks: [
    { x: -4.5, z: -2.2, rotY: 0 },
    { x: -1.6, z: -2.4, rotY: 0 },
    { x: 1.6, z: -2.5, rotY: 0 },
    { x: -4.5, z: 0.4, rotY: 0 },
    { x: -1.6, z: 0.5, rotY: 0 },
    { x: 1.6, z: 0.4, rotY: 0 }
  ],
  teacherDesk: { x: 5.2, z: -3.5, rotY: 0.4 },
  bookshelf: { x: -6.4, z: -0.5, rotY: 0.2 },
  lockers: { x: 6.6, z: -3.8, rotY: -0.3 },
  trashCan: { x: 0, z: 1.7 },
  blackboard: { x: 0, z: -4.86, y: 1.85, w: 4.4, h: 1.25 },
  note: { x: 5.2, y: 1.05, z: -3.3 },
  exit: { x: 0, z: 10.55 },
  itemSpawns: [
    { id: 'pen', x: -4.5, y: 0.78, z: -2.2 },
    { id: 'pen', x: -1.6, y: 0.78, z: -2.4 },
    { id: 'pen', x: 1.6, y: 0.78, z: 0.4 },
    { id: 'glue', x: -1.6, y: 0.78, z: 0.5 },
    { id: 'glue', x: 5.2, y: 1.02, z: -3.4 },
    { id: 'stapler', x: 5.2, y: 1.02, z: -3.55 },
    { id: 'scissors', x: -6.4, y: 0.62, z: -0.5 },
    { id: 'tape', x: -4.5, y: 0.78, z: 0.4 },
    { id: 'tape', x: 1.6, y: 0.78, z: -2.5 },
    { id: 'rubber', x: -1.6, y: 0.78, z: -2.2 },
    { id: 'rubber', x: 1.6, y: 0.78, z: -2.3 },
    { id: 'pen', x: 0, y: 0.06, z: 6.2 }
  ]
};
