import { LEVEL_CONFIG } from './level.js';

function westWingConfig() {
  const cfg = structuredClone(LEVEL_CONFIG);
  cfg.mode = 'westwing';

  cfg.classroom = { minX: -24, maxX: 24, minZ: -12, maxZ: 24 };
  cfg.corridor = { minX: -24, maxX: 24, minZ: 2, maxZ: 8 };
  cfg.playerStart = { x: -19, z: -6 };
  cfg.ghostSpawn = { x: 15, z: -8 };
  cfg.exit = { x: 0, z: 23.4 };
  cfg.teacherDesk = { x: 11, z: 15.5, rotY: 0.2 };
  cfg.note = { x: 12.4, y: 1.95, z: 15.6 };
  cfg.record = { x: 9.2, y: 1.95, z: 15.6 };
  cfg.platform = { x: 11, z: 15.5, w: 5, h: 1, d: 4 };
  cfg.platformLabel = '程老师办公桌';
  cfg.storyPen = false;
  cfg.missionLabels = {
    blackboard: '工具 · 粉笔盒引鬼',
    note: '任务 · 程老师值日表',
    record: '任务 · 程老师处分记录'
  };
  cfg.westWingLabels = [
    { x: -16, z: -7, text: '值班室/入口' },
    { x: 13, z: -7, text: '保健室改造禁闭区' },
    { x: 0, z: 5, text: '中央门禁过道' },
    { x: -16, z: 16, text: '禁闭隔间迷宫' },
    { x: 13, z: 16, text: '办公室/档案阁' }
  ];
  cfg.guideLights = [
    { x: -21, z: -2, color: '#ffe9c4', r: 9, y: 2.6 },
    { x: -17, z: 3, color: '#8ef0c8', r: 7, y: 2.5 },
    { x: 0, z: 5.5, color: '#ffe9c4', r: 11, y: 3.4 },
    { x: 10, z: 4.5, color: '#d9f0ff', r: 8, y: 2.6 },
    { x: 13, z: 16.5, color: '#ffe9b8', r: 12, y: 3.2 },
    { x: -16, z: 15.5, color: '#c9a7ff', r: 9, y: 2.8 },
    { x: 20, z: -6, color: '#ff9f45', r: 9, y: 2.6 }
  ];

  cfg.westWingWalls = [
    // outer shell
    { x: 0, z: -12, w: 48, d: 0.3 },
    { x: -24, z: 6, w: 0.3, d: 36 },
    { x: 24, z: 6, w: 0.3, d: 36 },
    { x: 0, z: 24, w: 48, d: 0.3 },
    // lower floor wall z=2 with three door gaps
    { x: -22, z: 2, w: 4, d: 0.3 },
    { x: -8, z: 2, w: 16, d: 0.3 },
    { x: 10, z: 2, w: 12, d: 0.3 },
    { x: 22, z: 2, w: 4, d: 0.3 },
    // upper floor wall z=8 with three door gaps
    { x: -22, z: 8, w: 4, d: 0.3 },
    { x: -8, z: 8, w: 16, d: 0.3 },
    { x: 10, z: 8, w: 12, d: 0.3 },
    { x: 22, z: 8, w: 4, d: 0.3 },
    // ground-level detention partition with a gap
    { x: -8, z: -10, w: 0.3, d: 4 },
    { x: -8, z: -2, w: 0.3, d: 4 },
    // archive/office partition with a gap
    { x: -8, z: 10.5, w: 0.3, d: 5 },
    { x: -8, z: 21.5, w: 0.3, d: 4 }
  ];

  cfg.blackboard = { x: 15, z: -8.2, y: 1.85, w: 4.4, h: 1.25 };
  cfg.bookshelf = { x: -19, z: -9.5, rotY: 0.3 };
  cfg.chainTrapSpot = { x: 13, z: -5, r: 0.9 };
  cfg.lockers = { x: -21, z: -2, rotY: -0.2 };
  cfg.lockerStep = { x: -19.4, z: -2, w: 1.3, h: 0.85, d: 0.9 };
  cfg.trashCan = { x: 21, z: -6 };
  cfg.plant = { x: -4, z: -7 };
  cfg.charger = { x: -17, z: 15 };
  cfg.fishTank = { x: 4, z: 5.5 };
  cfg.crateTarget = null;
  cfg.pillars = [];
  cfg.desks = [];
  cfg.crates = [];
  cfg.clutter = [];
  cfg.routeClutter = [];

  cfg.palletStack = { x: 0, z: 0, tiers: [] };
  cfg.wallLedges = [];
  cfg.slideRamp = { x: 0, z: 0, length: 0, tilt: 0 };
  cfg.rope = { enabled: false, from: { x: 0, z: 0 }, to: { x: 0, z: 0 }, y: 0 };
  cfg.ladders = [
    { x: -3, z: 5.5, topY: 3.2 },
    { x: 3, z: 5.5, topY: 3.2 }
  ];
  cfg.highCatwalk = [
    { from: { x: -9, z: 5.5 }, to: { x: 9, z: 5.5 }, y: 3.4 },
    { from: { x: 9, z: 5.5 }, to: { x: 0, z: 9 }, y: 3.4 }
  ];

  cfg.itemSpawns = [
    { id: 'pen', x: -16, y: 0.78, z: -9 },
    { id: 'pen', x: -14, y: 0.78, z: -6 },
    { id: 'glue', x: 18, y: 0.78, z: -9 },
    { id: 'tape', x: 19, y: 0.78, z: -4 },
    { id: 'stapler', x: 13.6, y: 1.2, z: 14.8 },
    { id: 'crossbow', x: 8, y: 1.2, z: 17 },
    { id: 'pen', x: -8, y: 0.78, z: 14 },
    { id: 'mine', x: 0, y: 0.06, z: 5.5 }
  ];

  return cfg;
}

export const WEST_WING_CONFIG = westWingConfig();
