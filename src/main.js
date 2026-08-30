import * as THREE from 'three';
import { PALETTE } from './config/palette.js';
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
const school = new SchoolScene(physics, events);
const refs = school.build();
scene.add(school.group);

const audio = new AudioSystem();
const ui = new UISystem(game, events);
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
const ghost = new GhostSystem({ scene: school, physics, events, game, rage, audio });
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

const settlement = new SettlementSystem();
let phoneRang = false;

events.on('audio', p => audio.play(p.name));
events.on('camera.shake', p => cameraSys.addShake(p?.amount ?? 0.3));
events.on('hitstop', p => {
  game.hitstopUntil = Math.max(game.hitstopUntil, nowSec() + (p?.ms ?? 80) / 1000);
});
events.on('slowmo', p => {
  game.slowmoUntil = Math.max(game.slowmoUntil, nowSec() + (p?.ms ?? 400) / 1000);
});
events.on('ghost.stage', p => {
  const beats = {
    annoyed: { audio: 'chalk', text: '粉笔在黑板上划出刺耳声！恶灵不悦了' },
    angry: { audio: 'shake', text: '课桌开始震动，恶灵愤怒了！' },
    furious: { audio: 'slam', text: '所有柜门猛地响了一声！暴怒！' },
    insane: { audio: 'heartbeat', text: '心跳声越来越快……狂乱！' }
  };
  const beat = beats[p.stage.id];
  if (beat) {
    audio.play(beat.audio);
    events.emit('camera.shake', { amount: 0.18 });
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
    events.emit('noise', { pos: { x: 7.2, z: -4.4 }, radius: 14 });
  }
});
events.on('game.start', () => {
  game.reset();
  game.phase = 'investigate';
  input.allowLock = true;
  if (renderer.domElement.requestPointerLock) {
    try {
      renderer.domElement.requestPointerLock();
    } catch {
      // fallback: cursor hidden and edge look remains available
    }
  }
  phoneRang = false;
  document.body.classList.add('playing');
  player.resetHiding();
  game.addItem('pen', 2);
  game.addItem('rubber', 1);
  game.equipped = 'pen';
  items.resetBackup();
  items.syncHand();
  audio.init();
  ui.toggleNotebook(false);
  ui.sync(game);
  events.emit('toast', { text: '实习开始：先找线索，别惊动它。主管：这一单预计到手 12 円。', ms: 3200 });
  audio.play('click');
});
events.on('game.win', () => {
  game.phase = 'win';
  document.body.classList.remove('playing');
  input.allowLock = false;
  if (document.pointerLockElement) document.exitPointerLock();
  audio.play('win');
  ui.showWin(settlement.calculate(game));
  ui.sync(game);
});
events.on('game.lost', () => {
  game.phase = 'lost';
  document.body.classList.remove('playing');
  input.allowLock = false;
  if (document.pointerLockElement) document.exitPointerLock();
  audio.play('lose');
  ui.showLose(settlement.calculate(game));
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
  events
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
    rage.update(simDt, p2, ghost.getPos());
    school.update(simDt, game);

    const drain = game.notebookOpen
      ? GAME_CONFIG.phoneOpenDrainPerSecond
      : GAME_CONFIG.batteryDrainPerSecond;
    if (!game.hiding) {
      game.battery = Math.max(0, game.battery - drain * simDt);
    }
    if (game.battery <= 0 && game.notebookOpen) ui.toggleNotebook(false);
  }
  input.allowLock = game.isPlaying();

  if (input.justPressed('Tab')) ui.toggleNotebook();
  ui.sync(game);
  ui.updateSealStatus(player, ghost);
  cameraSys.update(input, player.getPos(), dt);
  physics.step(simDt);
  renderer.render(scene, camera);
  input.update();
}

ui.sync(game);
tick();
