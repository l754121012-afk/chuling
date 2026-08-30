import { GAME_CONFIG } from '../config/game.js';
import { GHOST_CONFIG } from '../config/ghost.js';

const CLUE_TEXT = {
  blackboard: {
    title: '黑板留言',
    text: '“别踩脚印！”——它似乎讨厌被打扰，安静时最好对付。'
  },
  note: {
    title: '桌上的纸条',
    text: '“它怕订书机的咔嚓声……趁它冷静，从背后下手。”'
  }
};

export class ClueSystem {
  constructor({ game, events, rage, audio }) {
    this.game = game;
    this.events = events;
    this.rage = rage;
    this.audio = audio;
  }

  readClue(id) {
    if (this.game.hasClue(id)) return;
    if (this.game.battery <= 0) {
      this.events.emit('toast', { text: '手机没电了，看不清线索', ms: 1800 });
      this.audio?.play('click');
      return;
    }
    this.game.clues.add(id);
    this.game.battery = Math.max(0, this.game.battery - GAME_CONFIG.batteryDrainPerClue);
    this.rage.reduce(GHOST_CONFIG.rage.clueRead, 'clue');
    this.audio?.play('paper');
    this.events.emit('clue.found', { id, clue: CLUE_TEXT[id] });
    this.events.emit('toast', { text: `线索：${CLUE_TEXT[id].title}`, ms: 2200 });

    if (this.game.hasClue('blackboard') && this.game.hasClue('note')) {
      this.rage.reduce(GHOST_CONFIG.rage.clueRead, 'clue-complete');
      this.events.emit('toast', {
        text: '你明白了：趁它冷静，从背后用订书机封印！',
        ms: 3200
      });
    }
  }
}

export { CLUE_TEXT };
