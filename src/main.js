import * as THREE from 'three';
import { PALETTE } from './config/palette.js';
import { textTexture } from './core/PlaceholderAssets.js';
import { GAME_CONFIG } from './config/game.js';
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

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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
const school = new SchoolScene(physics, events, scene);
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
      : 'WASD 移动 · 点击画面锁定鼠标 · 左键使用道具 · E 互动 · Tab 手机';
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

events.on('audio', p => audio.play(p.name));
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
  events.emit('toast', { text: '实习开始：先找线索，别惊动它。主管：这一单预计到手 12 円。', ms: 3200 });
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
  winSettlement.rows.push(
    { label: '百元店积分', amount: winEcon.points, currency: 'points' },
    { label: '灵异纪念品', amount: winEcon.relics, currency: 'relic' }
  );
  ui.saveBest(game, winSettlement);
  ui.showBest();
  ui.showWin(winSettlement);
  ui.sync(game);
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

  if (game.isPlaying()) {
    const pp = player.getPos();
    player.update(simDt);
    const p2 = player.getPos();
    ghost.update(simDt, p2);
    items.update(simDt, p2, ghost.getPos());
    chain.update(simDt);
    randomEvents.update(simDt);
    rage.update(simDt, p2, ghost.getPos());
    school.update(simDt, game);

    const drain = game.notebookOpen
      ? GAME_CONFIG.phoneOpenDrainPerSecond
      : GAME_CONFIG.batteryDrainPerSecond;
    if (!game.hiding && !game.charging) {
      game.battery = Math.min(game.batteryMax, Math.max(0, game.battery - drain * simDt));
    }
    school.setDarkness(1 - game.battery / game.batteryMax);
    if (game.battery <= 0 && game.notebookOpen) ui.toggleNotebook(false);
  }
  if (
    game.isPlaying() &&
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
  cameraSys.update(input, player.getPos(), dt);
  physics.step(simDt);
  renderer.render(scene, camera);
  input.update();
}

ui.sync(game);
tick();
