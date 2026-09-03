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
  cfg.platformLabel = '程老师办公桌';
  cfg.storyPen = false;
  cfg.missionLabels = {
    blackboard: '工具 · 粉笔盒引鬼',
    note: '任务 · 程老师值日表'
  };
  cfg.lockers = { x: 11.2, z: 3.2, rotY: -0.25 };
  cfg.lockerStep = { x: 9.9, z: 3.2, w: 1.2, h: 0.85, d: 0.9 };
  cfg.blackboard = { x: 0, z: -8.8, y: 1.85, w: 4.4, h: 1.25 };
  cfg.bookshelf = { x: -4.6, z: -5.6, rotY: 0.25 };
  cfg.chainTrapSpot = { x: -3.6, z: -4.4, r: 0.9 };
  cfg.trashCan = { x: -7.2, z: -6.8 };
  cfg.plant = { x: 7.2, z: -6.8 };
  cfg.charger = { x: -4.8, z: 16.8 };
  cfg.fishTank = { x: 4.8, z: 16.4 };
  cfg.crateTarget = null;
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
  cfg.crates = [];
  cfg.clutter = [
    { x: -5.2, z: 2.6 },
    { x: 5.2, z: 2.6 },
    { x: -2.4, z: 8.2 },
    { x: 2.4, z: 8.2 }
  ];
  cfg.routeClutter = [
    { x: -5.4, z: 6.2, rot: 0.18 },
    { x: 5.4, z: 6.2, rot: -0.15 },
    { x: -3.6, z: 8.6, rot: 0.05 },
    { x: 3.6, z: 8.6, rot: -0.08 }
  ];
  cfg.palletStack = { x: 0, z: 0, tiers: [] };
  cfg.wallLedges = [];
  cfg.slideRamp = { x: 0, z: 0, length: 0, tilt: 0 };
  cfg.rope = { enabled: false, from: { x: 0, z: 0 }, to: { x: 0, z: 0 }, y: 0 };
  cfg.ladders = [
    { x: -4, z: 9, topY: 3.2 },
    { x: 4, z: 9, topY: 3.2 }
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
