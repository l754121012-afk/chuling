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

const DETENTION_CLUE_TEXT = {
  blackboard: {
    title: '粉笔盒使用记录',
    text: '粉笔声会把程老师引向它上一次检查的位置。'
  },
  note: {
    title: '程老师值日表',
    text: '08:10 粉笔声 -> 禁闭区；08:40 电话响 -> 办公室。值日表归档后，档案区与迷宫开放：处分记录被锁在禁闭隔间迷宫的旧记录台。'
  },
  record: {
    title: '程老师处分记录',
    text: '旧保健室失火的处分写着“学生小满”，签字栏却被划掉重写：“我签。这个学生不该背锅。”你替程老师把最后一笔写正。出口门禁只完成第一重解锁，还要去档案区操作自动门控制台。'
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
    const textMap = this.game.detentionMode ? DETENTION_CLUE_TEXT : CLUE_TEXT;
    const entry = textMap[id];
    if (!entry) return;
    this.game.clues.add(id);
    this.game.battery = Math.max(0, this.game.battery - GAME_CONFIG.batteryDrainPerClue);
    this.rage.reduce(GHOST_CONFIG.rage.clueRead, 'clue');
    this.audio?.play('paper');
    this.events.emit('clue.found', { id, clue: entry });
    this.events.emit('toast', { text: `笔记：${entry.title}`, ms: 2200 });

    if (!this.game.detentionMode && this.game.hasClue('blackboard') && this.game.hasClue('note')) {
      this.rage.reduce(GHOST_CONFIG.rage.clueRead, 'clue-complete');
      this.events.emit('toast', {
        text: '你明白了：趁它冷静，从背后用订书机封印！',
        ms: 3200
      });
    }
    if (this.game.detentionMode && id === 'note') {
      this.game.addNote(
        'detention_schedule',
        '日程',
        '程老师值日表',
        '08:10 粉笔声 -> 禁闭区；08:40 电话响 -> 办公室。值日表归档后档案区与迷宫开放，处分记录在禁闭隔间迷宫的旧记录台。'
      );
      this.events.emit('detention.noteRead');
      if (this.game.hasClue('record')) this.events.emit('detention.recordRead');
    }
    if (this.game.detentionMode && id === 'record') {
      this.game.addNote(
        'detention_record',
        '档案',
        '程老师处分记录',
        '处分写着学生小满，签字栏被划掉重写：“我签。这个学生不该背锅。”你替程老师把最后一笔写正。出口第一重绿灯已亮，还差档案区自动门控制台。'
      );
      this.events.emit('detention.recordRead');
    }
  }
}

export { CLUE_TEXT, DETENTION_CLUE_TEXT };
