import { LEVEL_CONFIG } from './level.js';

function detentionConfig() {
  const cfg = structuredClone(LEVEL_CONFIG);
  cfg.classroom = { minX: -13, maxX: 13, minZ: -9, maxZ: 6 };
  cfg.corridor = { minX: -6, maxX: 6, minZ: 6, maxZ: 20 };
  cfg.playerStart = { x: -10, z: 2 };
  cfg.ghostSpawn = { x: 8, z: -7 };
  cfg.exit = { x: 0, z: 19 };
  cfg.teacherDesk = { x: 0, z: 14.2, rotY: 0 };
  cfg.note = { x: 0.8, y: 1.95, z: 14.2 };
  cfg.platform = { x: 0, z: 14.2, w: 3.6, h: 1.0, d: 2.6 };
  cfg.lockers = { x: 11, z: 3.5, rotY: -0.2 };
  cfg.lockerStep = { x: 10, z: 3.5, w: 1.2, h: 0.85, d: 0.9 };
  cfg.blackboard = { x: 0, z: -8.8, y: 1.85, w: 4.4, h: 1.25 };
  cfg.bookshelf = { x: -11.5, z: -4.5, rotY: 0.2 };
  cfg.chainTrapSpot = { x: -7.5, z: -6.2, r: 0.9 };
  cfg.trashCan = { x: -11.5, z: 3 };
  cfg.plant = { x: 11.5, z: -1 };
  cfg.charger = { x: 0, z: 18 };
  cfg.fishTank = { x: -1, z: 17.5 };
  cfg.crateTarget = { x: -6.8, z: 4, r: 1.1 };
  cfg.pillars = [
    { x: -5, z: -2.5, r: 0.55 },
    { x: 5, z: -2.5, r: 0.55 },
    { x: -5, z: 2.2, r: 0.55 },
    { x: 5, z: 2.2, r: 0.55 }
  ];
  cfg.desks = [
    { x: -8, z: -6.4, rotY: 0 },
    { x: -4, z: -6.4, rotY: 0 },
    { x: 0, z: -6.4, rotY: 0 },
    { x: 4, z: -6.4, rotY: 0 },
    { x: 8, z: -6.4, rotY: 0 },
    { x: -8, z: -3.4, rotY: 0 },
    { x: -4, z: -3.4, rotY: 0 },
    { x: 0, z: -3.4, rotY: 0 },
    { x: 4, z: -3.4, rotY: 0 },
    { x: 8, z: -3.4, rotY: 0 },
    { x: -6, z: 0.4, rotY: 0 },
    { x: -2, z: 0.4, rotY: 0 },
    { x: 2, z: 0.4, rotY: 0 },
    { x: 6, z: 0.4, rotY: 0 },
    { x: -4, z: 9.5, rotY: 0 },
    { x: 4, z: 9.5, rotY: 0 },
    { x: -4, z: 12.5, rotY: 0 },
    { x: 4, z: 12.5, rotY: 0 },
    { x: -4, z: 15.5, rotY: 0 },
    { x: 4, z: 15.5, rotY: 0 }
  ];
  cfg.crates = [
    { x: -9, z: -0.5 },
    { x: 9, z: -0.5 }
  ];
  cfg.clutter = [
    { x: -9, z: 2.5 },
    { x: 9, z: 2.5 },
    { x: -2, z: 8.5 },
    { x: 2, z: 8.5 }
  ];
  cfg.routeClutter = [
    { x: -7, z: 4.2, rot: 0.1 },
    { x: 7, z: 4.2, rot: 0.2 }
  ];
  cfg.palletStack = { x: -11, z: -2.4, tiers: [0.5, 1.1, 1.7] };
  cfg.wallLedges = [
    { x: -12, z: -1, y: 1.6 },
    { x: -12, z: -1, y: 2.8 }
  ];
  cfg.slideRamp = { x: -12, z: 1.5, length: 4, tilt: -0.4 };
  cfg.rope = { from: { x: -5, z: -2.5 }, to: { x: 5, z: -2.5 }, y: 3.0 };
  cfg.ladders = [
    { x: -5.5, z: 9, topY: 3.2 },
    { x: 5.5, z: 9, topY: 3.2 }
  ];
  cfg.highCatwalk = [
    { from: { x: -5.5, z: 9 }, to: { x: 5.5, z: 9 }, y: 3.4 },
    { from: { x: 5.5, z: 9 }, to: { x: 5.5, z: 13.5 }, y: 3.4 }
  ];
  cfg.itemSpawns = [
    { id: 'pen', x: -8, y: 0.78, z: -6.4 },
    { id: 'pen', x: 8, y: 0.78, z: -6.4 },
    { id: 'tape', x: 0, y: 0.78, z: -3.4 },
    { id: 'stapler', x: 0, y: 1.2, z: 13.2 },
    { id: 'crossbow', x: 0, y: 1.2, z: 15.2 },
    { id: 'pen', x: 0, y: 0.78, z: 10.5 }
  ];
  return cfg;
}

export const DETENTION_SLICE_CONFIG = detentionConfig();
