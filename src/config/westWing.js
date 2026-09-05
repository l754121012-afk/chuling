import { LEVEL_CONFIG } from './level.js';

function westWingConfig() {
  const cfg = structuredClone(LEVEL_CONFIG);
  cfg.mode = 'westwing';

  cfg.classroom = { minX: -24, maxX: 24, minZ: -12, maxZ: 24 };
  cfg.corridor = { minX: -24, maxX: 24, minZ: 2, maxZ: 8 };
  cfg.playerStart = { x: -19, z: -6 };
  cfg.ghostSpawn = { x: 15, z: -8 };
  cfg.exit = { x: 0, z: 23.4 };
  cfg.teacherDesk = { x: 0, z: 5.5, rotY: 0.1 };
  cfg.note = { x: 0.7, y: 1.95, z: 5.5 };
  cfg.record = { x: 4, y: 4.7, z: 12.5 };
  cfg.platform = { x: 0, z: 5.5, w: 5, h: 1, d: 4 };
  cfg.secondFloor = { x: 0, z: 12.5, w: 22, d: 7, topY: 4.25, h: 0.5 };
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
    { x: 13, z: 16, text: '办公室/档案阁' },
    { x: 0, z: 12.8, text: '档案阁高架 2F', y: 5.4 }
  ];
  cfg.guideLights = [
    { x: -21, z: -2, color: '#ffe9c4', r: 20, y: 4.5, intensity: 2.2 },
    { x: -17, z: 3, color: '#8ef0c8', r: 16, y: 4.6, intensity: 1.8 },
    { x: 0, z: 5.5, color: '#ffe9c4', r: 28, y: 4.9, intensity: 3, important: true },
    { x: 10, z: 4.5, color: '#d9f0ff', r: 18, y: 4.5, intensity: 1.9 },
    { x: 0, z: 12.5, color: '#ffe9b8', r: 30, y: 6.1, intensity: 3.4, important: true },
    { x: -16, z: 15.5, color: '#c9a7ff', r: 20, y: 4.7, intensity: 2 },
    { x: 20, z: -6, color: '#ff9f45', r: 20, y: 4.6, intensity: 2.2 }
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
  cfg.westWingWindows = [
    { x: -15, z: -12, axis: 'z', dir: 1 },
    { x: 8, z: -12, axis: 'z', dir: 1 },
    { x: -24, z: -4, axis: 'x', dir: 1 },
    { x: -24, z: 13, axis: 'x', dir: 1 },
    { x: 24, z: -6, axis: 'x', dir: -1 },
    { x: 24, z: 11, axis: 'x', dir: -1 },
    { x: -12, z: 24, axis: 'z', dir: -1 },
    { x: 12, z: 24, axis: 'z', dir: -1 }
  ];
  cfg.hazardZones = [
    { x: -22, z: -11, w: 3.5, d: 2.4, label: '漏电积水', rate: 16 },
    { x: 0, z: 6.5, w: 2.4, d: 1.6, label: '洒落的修正带', rate: 12 },
    { x: -5, z: 15, w: 3, d: 2.2, label: '碎粉笔灰', rate: 12 }
  ];
  cfg.doors = [
    {
      id: 'start_door',
      x: -18,
      z: 2,
      w: 4,
      d: 0.3,
      label: '值班室大门',
      locked: true,
      openable: true
    },
    {
      id: 'health_door',
      x: -8,
      z: -6,
      w: 0.3,
      d: 4,
      label: '保健室隔断门',
      locked: true,
      requireClue: 'note'
    },
    {
      id: 'right_lower_door',
      x: 18,
      z: 2,
      w: 4,
      d: 0.3,
      label: '右侧下层门',
      locked: true,
      requireClue: 'note'
    },
    {
      id: 'record_door',
      x: 2,
      z: 12.5,
      w: 3,
      d: 0.3,
      label: '档案门',
      locked: true,
      requireClue: 'note',
      levelY: 4.4
    },
    {
      id: 'maze_door',
      x: -18,
      z: 8,
      w: 4,
      d: 0.3,
      label: '迷宫侧门',
      locked: true,
      requireClue: 'note'
    },
    {
      id: 'upper_door',
      x: 2,
      z: 8,
      w: 4,
      d: 0.3,
      label: '二楼楼梯门',
      locked: true,
      requireClue: 'note'
    },
    {
      id: 'right_upper_door',
      x: 18,
      z: 8,
      w: 4,
      d: 0.3,
      label: '档案阁东门',
      locked: true,
      requireClue: 'note'
    }
  ];
  cfg.registrationNpc = { x: -22.5, z: -6, y: 1.1 };
  cfg.minionWaveFirstAt = 18;
  cfg.minionWaveIntervalMin = 26;
  cfg.minionWaveIntervalMax = 36;
  cfg.minionCount = 2;

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
  cfg.desks = [
    { x: -13, z: -9, rotY: 0 },
    { x: -13, z: -4, rotY: 0.2 },
    { x: -18, z: 0, rotY: 0.1 },
    { x: 16, z: -9, rotY: 0 },
    { x: 19, z: -4, rotY: -0.1 },
    { x: 9, z: 12, rotY: 0 },
    { x: 14, z: 12, rotY: 0.1 },
    { x: 9, z: 20, rotY: 0 },
    { x: 14, z: 20, rotY: -0.1 },
    { x: -11, z: 14, rotY: 0.2 },
    { x: -19, z: 18, rotY: 0 }
  ];
  cfg.crates = [];
  cfg.clutter = [
    { x: -15, z: -2 },
    { x: -10, z: 4.5 },
    { x: 7, z: 3.5 },
    { x: 12, z: 13.5 },
    { x: -14, z: 21 }
  ];
  cfg.routeClutter = [
    { x: -15, z: 3, rot: 0.2 },
    { x: 13, z: 5, rot: -0.15 },
    { x: 17, z: 15, rot: 0.12 },
    { x: -18, z: 12, rot: -0.08 }
  ];

  cfg.palletStack = { x: 0, z: 0, tiers: [] };
  cfg.wallLedges = [];
  cfg.slideRamp = { x: 0, z: 0, length: 0, tilt: 0 };
  cfg.rope = { enabled: false, from: { x: 0, z: 0 }, to: { x: 0, z: 0 }, y: 0 };
  cfg.ladders = [];
  cfg.highCatwalk = [];
  cfg.bubbleRoutes = [
    {
      from: { x: -20, z: -6, y: 0.9 },
      to: { x: 0, z: 11.8, y: 4.3 },
      color: '#8ef0c8',
      label: '纸箱泡泡 · 上档案阁',
      requireClue: 'note'
    },
    {
      from: { x: 4, z: 13, y: 4.4 },
      to: { x: 18, z: -7, y: 0.9 },
      color: '#d9f0ff',
      label: '泡泡滑梯 · 回保健区'
    }
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
