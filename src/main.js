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
scene.fog = new THREE.Fog(PALETTE.bg, 18, 34);

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
ghost.playerPos = () => player.getPos();
ghost.playerBody = player.createPawn().body;
items.playerHand = player.pawn.mesh.userData.handSlot;
ghost.createPawn(refs.ghostSpawn);
items.spawnPickups();

const settlement = new SettlementSystem();

events.on('audio', p => audio.play(p.name));
events.on('game.start', () => {
  game.reset();
  game.phase = 'investigate';
  input.allowLock = true;
  game.addItem('pen', 2);
  game.addItem('rubber', 1);
  game.equipped = 'pen';
  items.syncHand();
  audio.init();
  ui.toggleNotebook(false);
  ui.sync(game);
  events.emit('toast', { text: '实习开始：先找线索，别惊动它。', ms: 2400 });
  audio.play('click');
});
events.on('game.win', () => {
  game.phase = 'win';
  input.allowLock = false;
  if (document.pointerLockElement) document.exitPointerLock();
  audio.play('win');
  ui.showWin(settlement.calculate(game));
  ui.sync(game);
});
events.on('game.lost', () => {
  game.phase = 'lost';
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

  if (game.isPlaying()) {
    const pp = player.getPos();
    player.update(dt);
    const p2 = player.getPos();
    ghost.update(dt, p2);
    items.update(dt, p2, ghost.getPos());
    rage.update(dt, p2, ghost.getPos());
    school.update(dt, game);

    const drain = game.notebookOpen
      ? GAME_CONFIG.phoneOpenDrainPerSecond
      : GAME_CONFIG.batteryDrainPerSecond;
    if (!game.hiding) {
      game.battery = Math.max(0, game.battery - drain * dt);
    }
    if (game.battery <= 0 && game.notebookOpen) ui.toggleNotebook(false);
  }
  input.allowLock = game.isPlaying();

  if (input.justPressed('Tab')) ui.toggleNotebook();
  ui.sync(game);
  cameraSys.update(input, player.getPos());
  physics.step(dt);
  renderer.render(scene, camera);
  input.update();
}

ui.sync(game);
tick();
