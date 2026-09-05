import * as THREE from 'three';
import { PALETTE } from './config/palette.js';
import { textTexture } from './core/PlaceholderAssets.js';
import { GAME_CONFIG } from './config/game.js';
import { LEVEL_CONFIG } from './config/level.js';
import { DETENTION_SLICE_CONFIG } from './config/detentionSlice.js';
import { WEST_WING_CONFIG } from './config/westWing.js';
import { EventBus } from './core/EventBus.js';
import { GameState } from './core/GameState.js';
import { PhysicsWorld } from './core/Physics.js';
import { SchoolScene } from './world/SchoolScene.js';
import { InputSystem } from './systems/InputSystem.js';
import { CameraSystem } from './systems/CameraSystem.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { RageSystem } from './systems/RageSystem.js';
import { GhostSystem } from './systems/GhostSystem.js';
import { ItemSystem } from './systems/ItemSystem.js';
import { PlayerSystem } from './systems/PlayerSystem.js';
import { ClueSystem } from './systems/ClueSystem.js';
import { SettlementSystem } from './systems/SettlementSystem.js';
import { UISystem } from './systems/UISystem.js';
import { ChainDirector } from './systems/ChainDirector.js';
import { EconomySystem } from './systems/EconomySystem.js';
import { RandomEventSystem } from './systems/RandomEventSystem.js';
import { nowSec } from './core/Utils.js';

const URL_PARAMS = new URLSearchParams(window.location.search);
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: URL_PARAMS.get('shot') === '1'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.bg);
scene.fog = new THREE.Fog(PALETTE.bg, 7, 22);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 80);

const events = new EventBus();
const physics = new PhysicsWorld();
const game = new GameState();
const economy = new EconomySystem();
const DETENTION_MODE = URL_PARAMS.get('case') === 'detention';
const DETENTION_AUTO = URL_PARAMS.get('auto') === '1';
const RUN_MODE = URL_PARAMS.get('run') === 'two_pens';
const RUN_STAGE = Number(URL_PARAMS.get('stage') || (DETENTION_MODE ? 2 : 1));
const SHOT_MODE = URL_PARAMS.get('shot') === '1';
const OVERVIEW_SHOT = URL_PARAMS.get('overview') === '1';
const LEVEL_CONFIG_TO_USE = RUN_STAGE === 2 || DETENTION_MODE ? WEST_WING_CONFIG : LEVEL_CONFIG;
const school = new SchoolScene(physics, events, scene, LEVEL_CONFIG_TO_USE);
const refs = school.build();
school.applyCosmetics(economy.unlocks);
scene.add(school.group);

const audio = new AudioSystem();
const ui = new UISystem(game, events, economy);
ui.init();

const input = new InputSystem(renderer.domElement);
input.attach();
input.onLockChange = locked => {
  const hint = document.getElementById('hint');
  if (hint) {
    hint.textContent = locked
      ? '鼠标已锁定：按 Esc 释放'
      : 'WASD 移动 · G 鞭子攻击开关（关=道具模式）· 左键用道具/抽鞭子 · E 互动 · Tab 手机';
  }
  if (locked) events.emit('toast', { text: '鼠标已锁定，按 Esc 释放', ms: 1800 });
};
input.onLockError = () => {
  events.emit('toast', { text: '鼠标锁定不可用，点击画面重试', ms: 2000 });
};
const cameraSys = new CameraSystem(camera, school);
const rage = new RageSystem(game, events, audio);
const ghost = new GhostSystem({ scene: school, physics, events, game, rage, audio, economy });
const player = new PlayerSystem({
  scene: school,
  physics,
  events,
  game,
  input,
  camera: cameraSys,
  itemSystem: null,
  clueSystem: null,
  audio,
  refs,
  rage
});
const clues = new ClueSystem({ game, events, rage, audio });
const items = new ItemSystem({
  scene: school,
  physics,
  events,
  game,
  rage,
  ghost,
  camera,
  audio,
  playerPos: () => player.getPos()
});

player.items = items;
player.clues = clues;
player.ghost = ghost;
ghost.playerPos = () => player.getPos();
ghost.playerCrouching = () => player.crouching;
ghost.playerBody = player.createPawn().body;
items.playerHand = player.pawn.mesh.userData.handSlot;
ghost.createPawn(refs.ghostSpawn);
items.spawnPickups();
if (economy.unlocks.phone_face) {
  const sticker = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: textTexture('XD', {
        bg: '#ffd166',
        fg: '#2b2118',
        font: 'bold 72px "Microsoft YaHei", sans-serif',
        width: 256,
        height: 256,
        lineHeight: 120,
        pad: 12
      }),
      transparent: true,
      depthWrite: false
    })
  );
  sticker.position.set(0, 0.95, -0.42);
  sticker.scale.set(0.24, 0.24, 1);
  player.pawn.mesh.add(sticker);
}

const settlement = new SettlementSystem();
const chain = new ChainDirector({
  scene: school,
  events,
  game,
  ghost,
  items,
  audio
});
const randomEvents = new RandomEventSystem({
  scene: school,
  events,
  game,
  ghost,
  player,
  rage,
  audio,
  items,
  economy
});
let phoneRang = false;
let firstScareAt = 0;
let detentionBellStep = 0;
let detentionBellAt = 0;
const itemGuidesShown = new Set();

events.on('audio', p => audio.play(p.name));
events.on('wage.pickup', () => {
  economy.state.coins += 300;
  economy.save();
  events.emit('toast', { text: '工资单捡回来了！+300 円', ms: 1800 });
});
events.on('item.picked', p => {
  const def = p?.def;
  const id = p?.id;
  const classroomTask = !game.detentionMode && (id === 'stapler' || id === 'tape');
  if (!classroomTask || itemGuidesShown.has(id) || !game.isPlaying() || game.guideOpen) return;
  itemGuidesShown.add(id);
  game.guideOpen = true;
  if (document.pointerLockElement) document.exitPointerLock();
  input.allowLock = false;
  ui.showItemGuide(def);
});
events.on('guide.close', () => {
  if (!game.guideOpen) return;
  game.guideOpen = false;
  ui.hideItemGuide();
  input.allowLock = game.isPlaying();
  if (game.isPlaying() && renderer.domElement.requestPointerLock) {
    try {
      renderer.domElement.requestPointerLock();
    } catch {
      // keep cursor hidden via CSS; user can click again if re-lock is refused
    }
  }
});
events.on('npc.talk', () => {
  if (game.detentionComplete) {
    events.emit('speech', {
      text: '纸人点点头：记录改完了，程老师终于能下课了。',
      ms: 2200,
      name: '小满纸人'
    });
  } else if (game.detentionScheduleRead) {
    events.emit('speech', {
      text: '纸人指了指泡泡：泡泡启动了。上 2F 后，档案门会亮起，按 E 开门。',
      ms: 2200,
      name: '小满纸人'
    });
  } else {
    events.emit('speech', {
      text: '纸人指着值班室大门：先按 E 推开大门，值日表就在中央过道桌上。',
      ms: 2400,
      name: '小满纸人'
    });
  }
});
events.on('clue.found', p => {
  school.markClueRead?.(p.id);
  if (game.detentionMode && (p.id === 'note' || p.id === 'record') && !game.guideOpen) {
    itemGuidesShown.add(`task_${p.id}`);
    game.guideOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    input.allowLock = false;
    ui.showItemGuide({
      name: p.clue?.title || (p.id === 'note' ? '程老师值日表' : '程老师处分记录'),
      icon: '🗒',
      taskGuide: true,
      guide: {
        steps: [p.clue?.text || '先记录这条信息，再找下一个任务点。']
      }
    });
  }
});
events.on('detention.noteRead', () => {
  if (!game.detentionMode || game.detentionScheduleRead) return;
  game.detentionScheduleRead = true;
  events.emit('act.card', {
    title: '值日表归档 · 泡泡启动',
    line: '回到入口坐纸箱泡泡上 2F，档案门会亮起；按 E 开门读处分记录。'
  });
  events.emit('toast', { text: '值日表已归档：泡泡启动了，档案门也解锁了。', ms: 2400 });
});
events.on('detention.recordRead', () => {
  if (!game.detentionMode || game.detentionComplete) return;
  if (!game.detentionScheduleRead) {
    events.emit('toast', { text: '处分记录太重：先读值日表，才知道它该在哪一天被重写。', ms: 2400 });
    return;
  }
  game.detentionComplete = true;
  school.openExit();
  events.emit('act.card', {
    title: '第二幕完成 · 下课铃响了',
    line: '处分记录被重写：该受罚的人不是程老师。出口门禁亮了。'
  });
  events.emit('audio', { name: 'phone' });
  events.emit('toast', { text: '你替程老师写正了最后一笔，出口开了！', ms: 2600 });
});
events.on('camera.shake', p => cameraSys.addShake(p?.amount ?? 0.3));
events.on('hitstop', p => {
  game.hitstopUntil = Math.max(game.hitstopUntil, nowSec() + (p?.ms ?? 80) / 1000);
});
events.on('slowmo', p => {
  game.slowmoUntil = Math.max(game.slowmoUntil, nowSec() + (p?.ms ?? 400) / 1000);
});
events.on('escape.start', () => {
  events.emit('act.card', { title: '第 4 幕 · 逃出生天', line: '它被钉住了！跑！！' });
});
events.on('ghost.stage', p => {
  const beats = {
    annoyed: { audio: 'chalk', text: '粉笔在黑板上划出刺耳声！它猛地转头！！', color: '#f4d35e', card: '第 2 幕 · 不悦' },
    angry: { audio: 'shake', text: '课桌全部震动起来，它开始砸东西了！！', color: '#f4a261', card: '第 3 幕 · 愤怒' },
    furious: { audio: 'slam', text: '所有柜门同时炸响！它彻底暴怒了！！', color: '#e63946', card: '第 3 幕 · 暴怒' },
    insane: { audio: 'heartbeat', text: '心跳声震耳欲聋……它已经疯了！拼刀能把它打回暴怒！', color: '#9b5de5', card: '第 3 幕 · 狂乱' }
  };
  const beat = beats[p.stage.id];
  if (beat) {
    audio.play(beat.audio);
    events.emit('camera.shake', { amount: 0.18 });
    events.emit('beat.flash', { color: beat.color });
    events.emit('act.card', { title: beat.card, line: beat.text });
    events.emit('toast', { text: beat.text, ms: 2000 });
  }
  if (
    !phoneRang &&
    game.phase === 'investigate' &&
    game.hasClue('blackboard') &&
    (p.stage.id === 'annoyed' || p.stage.id === 'angry')
  ) {
    phoneRang = true;
    audio.play('phone');
    events.emit('toast', { text: '电话响了！主管催你干活，鬼也听见了！', ms: 2200 });
    events.emit('noise', { pos: { x: 7.2, z: -4.4 }, radius: 14, rage: 5 });
  }
});
events.on('game.start', () => {
  game.reset();
  itemGuidesShown.clear();
  school.clearWageSlips();
  game.detentionMode = DETENTION_MODE || RUN_STAGE === 2;
  game.runMode = RUN_MODE;
  game.runStage = RUN_STAGE;
  game.phase = 'investigate';
  game.runStart = nowSec();
  input.allowLock = true;
  if (renderer.domElement.requestPointerLock) {
    try {
      renderer.domElement.requestPointerLock();
    } catch {
      // fallback: cursor hidden and edge look remains available
    }
  }
  phoneRang = false;
  firstScareAt = nowSec() + 8;
  detentionBellStep = 0;
  detentionBellAt = nowSec() + 10;
  document.body.classList.add('playing');
  player.resetHiding();
  game.addItem('pen', 2);
  economy.applyRunMods(game);
  game.equipped = 'pen';
  items.resetBackup();
  items.syncHand();
  chain.reset();
  randomEvents.reset();
  ghost.onRunStart();
  audio.init();
  ui.toggleNotebook(false);
  ui.closeShop();
  ui.toggleBackpack(false);
  ui.sync(game);
  sessionStorage.removeItem('exorcist_auto_ok');
  const startToast = RUN_MODE && RUN_STAGE === 1
    ? '第一幕：值日台有支金色任务笔，先站远看小满碰倒它。按 G 开启鞭子攻击，关掉 G 后左键照常使用道具。'
    : RUN_MODE && RUN_STAGE === 2
      ? '第二幕：先读值日表，再趁程老师被引开去读处分记录。'
      : RUN_MODE && RUN_STAGE === 3
        ? '第三幕：去旧仓库找失火那晚的真相。'
        : '按 G 切换鞭子攻击模式；关闭 G 后左键照常使用道具。先找线索，别惊动它。';
  events.emit('toast', { text: startToast, ms: 3200 });
  if (RUN_MODE) {
    const intro = RUN_STAGE === 1
      ? { title: '第一幕 · 两支笔', line: '值日鬼小满总想把桌上那支笔摆正。留意金色任务笔，等它碰倒后帮它摆好。' }
      : RUN_STAGE === 2
        ? { title: '第二幕 · 禁闭室', line: '读程老师值日表和处分记录；08:10 粉笔声、08:40 电话响会改变它的位置。' }
        : { title: '第三幕 · 旧仓库', line: '找失火那晚的真相，让两支笔重新并排。' };
    events.emit('act.card', intro);
  }
  if (game.detentionMode) {
    setTimeout(() => {
      events.emit('speech', {
        text: '小满纸人指着值班室大门：先推开大门去中央过道，读完值日表泡泡才会启动。',
        ms: 2600,
        name: '小满纸人'
      });
    }, 2600);
  }
  audio.play('click');
});
events.on('game.win', () => {
  game.phase = 'win';
  game.runTime = Math.round(nowSec() - game.runStart);
  document.body.classList.remove('playing');
  input.allowLock = false;
  if (document.pointerLockElement) document.exitPointerLock();
  audio.play('win');
  const winSettlement = settlement.calculate(game);
  const winEcon = economy.award(game, winSettlement);
  winSettlement.ghostReport = economy.recordGhostEncounter(game, winSettlement);
  winSettlement.debtPaid = economy.payDebt(economy.coins);
  if (!RUN_MODE || RUN_STAGE === 1) economy.completeCase('classroom01');
  winSettlement.rows.push(
    { label: '百元店积分', amount: winEcon.points, currency: 'points' },
    { label: '灵异纪念品', amount: winEcon.relics, currency: 'relic' }
  );
  ui.saveBest(game, winSettlement);
  ui.showBest();
  ui.showWin(winSettlement);
  ui.sync(game);
  if (RUN_MODE && RUN_STAGE < 3) {
    const next = RUN_STAGE === 1
      ? '?case=detention&run=two_pens&stage=2&auto=1'
      : '?run=two_pens&stage=3&auto=1';
    try {
      sessionStorage.setItem('exorcist_auto_ok', '1');
    } catch {
      // storage unavailable; next stage can still be entered manually
    }
    setTimeout(() => { window.location.search = next; }, 3200);
  }
});
events.on('game.lost', () => {
  game.phase = 'lost';
  game.runTime = Math.round(nowSec() - game.runStart);
  document.body.classList.remove('playing');
  input.allowLock = false;
  if (document.pointerLockElement) document.exitPointerLock();
  audio.play('lose');
  const loseSettlement = settlement.calculate(game);
  const loseEcon = economy.award(game, loseSettlement);
  loseSettlement.ghostReport = economy.recordGhostEncounter(game, loseSettlement);
  loseSettlement.debtPaid = economy.payDebt(economy.coins);
  loseSettlement.rows.push(
    { label: '百元店积分', amount: loseEcon.points, currency: 'points' },
    { label: '灵异纪念品', amount: loseEcon.relics, currency: 'relic' }
  );
  ui.saveBest(game, loseSettlement);
  ui.showBest();
  ui.showLose(loseSettlement);
  ui.sync(game);
});

ui.el.mute.addEventListener('click', () => {
  const muted = audio.toggleMute();
  ui.el.mute.classList.toggle('muted', muted);
});
ui.el.fullscreenBtn.addEventListener('click', () => {
  const el = document.documentElement;
  if (!document.fullscreenElement) {
    const req = el.requestFullscreen?.() || el.webkitRequestFullscreen?.();
    req?.catch?.(() => {});
  } else {
    document.exitFullscreen?.();
  }
});
document.getElementById('detention-btn')?.addEventListener('click', () => {
  try { sessionStorage.setItem('exorcist_auto_ok', '1'); } catch { /* no storage */ }
  window.location.search = DETENTION_MODE ? '' : '?case=detention&auto=1';
});
document.getElementById('run-btn')?.addEventListener('click', () => {
  try { sessionStorage.setItem('exorcist_auto_ok', '1'); } catch { /* no storage */ }
  window.location.search = '?run=two_pens&stage=1&auto=1';
});
if (DETENTION_MODE) {
  const startBtn = document.getElementById('start-btn');
  const toggleBtn = document.getElementById('detention-btn');
  if (startBtn) startBtn.textContent = '开始西翼禁闭室';
  if (toggleBtn) toggleBtn.textContent = '返回值日教室';
}
if (RUN_MODE) {
  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    startBtn.textContent = RUN_STAGE === 1 ? '开始第一幕：值日教室' :
      RUN_STAGE === 2 ? '开始第二幕：禁闭室' : '开始第三幕：旧仓库';
  }
  const startNote = document.querySelector('.start-note');
  if (startNote) {
    startNote.textContent = RUN_STAGE === 1
      ? '第一幕：找到金色任务笔，观察值日鬼的心愿，帮它摆正后再离开。'
      : RUN_STAGE === 2
        ? '第二幕：读程老师值日表和处分记录，趁 08:10/08:40 的空档行动。'
        : '第三幕：去旧仓库找失火那晚的真相。';
  }
}
if (DETENTION_MODE && !RUN_MODE) {
  const startNote = document.querySelector('.start-note');
  if (startNote) startNote.textContent = '西翼骨架：穿过值班室、禁闭迷宫与档案阁，读值日表和处分记录可开门。';
}
window.addEventListener('keydown', e => {
  if (e.code === 'AltLeft' || e.code === 'AltRight') {
    document.body.classList.remove('playing');
    if (document.pointerLockElement) document.exitPointerLock();
    events.emit('toast', { text: '鼠标已唤出，点击右上角全屏按钮', ms: 2500 });
  }
});
window.addEventListener('keyup', e => {
  if (e.code === 'AltLeft' || e.code === 'AltRight') {
    if (game.isPlaying()) {
      document.body.classList.add('playing');
      if (renderer.domElement.requestPointerLock) {
        try {
          renderer.domElement.requestPointerLock();
        } catch {
          // keep cursor hidden via CSS if re-lock is not allowed
        }
      }
    }
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__game = {
  start: () => events.emit('game.start'),
  give: (id, n = 1) => items.giveItem(id, n),
  setRage: n => {
    game.rage = Math.max(0, Math.min(100, n));
    rage._emitChange(rage.stage);
  },
  readClue: id => clues.readClue(id),
  win: () => events.emit('game.win'),
  lose: () => events.emit('game.lost'),
  game,
  ghost,
  items,
  player,
  camera: cameraSys,
  events,
  scene: school,
  chain,
  economy,
  randomEvents,
  debugArtifact: () => {
    if (!game.artifactActive && game.isPlaying()) randomEvents._startArtifactPhase();
  }
};

let last = nowSec();

function tick() {
  requestAnimationFrame(tick);
  const now = nowSec();
  const dt = Math.min(now - last, 0.05);
  last = now;
  let simDt = dt;
  if (nowSec() < game.hitstopUntil) simDt = 0;
  else if (nowSec() < game.slowmoUntil) simDt *= 0.35;

  if (game.guideOpen) {
    renderer.render(scene, camera);
    input.update();
    return;
  }

  if (game.isPlaying()) {
    const pp = player.getPos();
    player.update(simDt);
    const p2 = player.getPos();
    ghost.update(simDt, p2);
    if (game.detentionMode && !game.detentionComplete && game.phase === 'investigate') {
      const elapsed = now - game.runStart;
      const board = school.refs?.clues?.find(c => c.id === 'blackboard')?.pos;
      const record = school.refs?.clues?.find(c => c.id === 'record')?.pos;
      if (detentionBellStep === 0 && now >= detentionBellAt && board) {
        detentionBellStep = 1;
        ghost._lastSeen = null;
        ghost._lastNoise = { x: board.x, z: board.z };
        if (game.detentionScheduleRead) school.setDoor('maze_door', true, { silent: true });
        events.emit('audio', { name: 'chalk' });
        events.emit('act.card', {
          title: '08:10 · 粉笔声',
          line: '程老师被引向禁闭区黑板。办公桌方向现在空了，去读处分记录！'
        });
      } else if (detentionBellStep === 1 && elapsed >= 40 && record) {
        detentionBellStep = 2;
        ghost._lastSeen = null;
        ghost._lastNoise = { x: record.x, z: record.z };
        if (game.detentionScheduleRead) school.setDoor('maze_door', false, { silent: true });
        events.emit('audio', { name: 'phone' });
        events.emit('act.card', {
          title: '08:40 · 电话响',
          line: '程老师冲向办公室！想读记录的话，先用黑板粉笔把它引开。'
        });
      }
    }
    items.update(simDt, p2, ghost.getPos());
    chain.update(simDt);
    randomEvents.update(simDt);
    rage.update(simDt, p2, ghost.getPos());
    school.update(simDt, game);

    const drain = game.notebookOpen
      ? GAME_CONFIG.phoneOpenDrainPerSecond
      : game.phoneLightOn
        ? GAME_CONFIG.phoneLightDrainPerSecond
        : GAME_CONFIG.batteryDrainPerSecond;
    if (!game.hiding && !game.charging) {
      game.battery = Math.min(game.batteryMax, Math.max(0, game.battery - drain * simDt));
    }
    school.setDarkness(0);
    if (game.battery <= 0 && game.notebookOpen) ui.toggleNotebook(false);
    if (game.battery <= 0 && game.phoneLightOn) {
      game.phoneLightOn = false;
      events.emit('toast', { text: '手机没电了，灯灭了！去找充电桩。', ms: 2000 });
    }
  }
  if (
    game.isPlaying() &&
    !game.detentionMode &&
    !game.firstScareDone &&
    nowSec() >= firstScareAt
  ) {
    game.firstScareDone = true;
    const pp = player.getPos();
    const yaw = cameraSys.yaw;
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const gb = ghost.pawn.body;
    gb.position.set(pp.x - fwdX * 3, 1.2, pp.z - fwdZ * 3);
    gb.velocity.set(0, 0, 0);
    ghost._lastNoise = { x: pp.x, z: pp.z };
    ghost._lastSeen = { x: pp.x, z: pp.z };
    rage.add(6, 'firstScare');
    audio.play('slam');
    events.emit('camera.shake', { amount: 0.35 });
    events.emit('toast', {
      text: '灯闪了一下……它出现在你身后！快躲起来！先找线索，再拿订书机。',
      ms: 3200
    });
    events.emit('act.card', { title: '第 2 幕 · 它来了', line: '灯闪了一下，它就在你身后！' });
  }
  if (
    game.isPlaying() &&
    game.firstScareDone &&
    !game.act3Started &&
    nowSec() > firstScareAt + 20
  ) {
    game.act3Started = true;
    rage.add(8, 'act3');
    audio.play('shake');
    events.emit('toast', { text: '主管：别磨蹭了，它越来越不耐烦！', ms: 2200 });
  }
  input.allowLock = game.isPlaying();

  if (input.justPressed('Tab')) ui.toggleNotebook();
  if (input.justPressed('KeyB')) ui.toggleBackpack();
  if (game.voteActive) {
    if (input.justPressed('Digit1')) events.emit('vote.choose', 0);
    if (input.justPressed('Digit2')) events.emit('vote.choose', 1);
  }
  ui.sync(game);
  ui.updateSealStatus(player, ghost);
  if (OVERVIEW_SHOT) {
    const yaw = -0.82;
    const pitch = 0.62;
    const dist = 76;
    const center = { x: 0, y: 0.8, z: 7.5 };
    camera.far = 260;
    camera.updateProjectionMatrix();
    scene.background = new THREE.Color(0x9db2c4);
    scene.fog = null;
    if (SHOT_MODE) {
      school.sunLight.intensity = 12;
      school.ambientLight.intensity = 1.7;
      for (const g of school.guideLights) g.light.intensity = 4.5;
    }
    camera.position.set(
      center.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      center.y + 2 + Math.sin(pitch) * dist,
      center.z + Math.cos(yaw) * Math.cos(pitch) * dist
    );
    camera.lookAt(center.x, center.y + 0.8, center.z);
  } else {
    cameraSys.update(input, player.getPos(), dt);
  }
  physics.step(simDt);
  renderer.render(scene, camera);
  input.update();
}

let allowAutoStart = false;
try {
  allowAutoStart = sessionStorage.getItem('exorcist_auto_ok') === '1';
} catch {
  allowAutoStart = false;
}
if ((DETENTION_MODE || RUN_MODE) && DETENTION_AUTO && allowAutoStart) {
  setTimeout(() => events.emit('game.start'), 180);
}
ui.sync(game);
tick();
