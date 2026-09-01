import { GAME_CONFIG } from '../config/game.js';

export class SettlementSystem {
  calculate(game) {
    const rows = [];
    let total = 0;
    const push = (label, amount) => {
      rows.push({ label, amount });
      total += amount;
    };

    push('基本工资', GAME_CONFIG.baseSalary);

    let fee = 0;
    for (const id of game.usedItems) {
      const costs = { pen: 300, glue: 500, stapler: 800, scissors: 600, tape: 400, rubber: 100 };
      fee += costs[id] || 0;
    }
    if (fee > 0) push('器材费（自理）', -fee);
    push('交通费', -800);
    push('手机话费', -500);

    if (game.damages.includes('bookshelf')) push('损坏书架赔偿', -8000);
    if (game.damages.includes('trash')) push('垃圾桶维修费', -1000);
    if (game.damages.includes('plant')) push('盆栽赔偿', -2000);
    if (game.damages.includes('glass')) push('玻璃赔偿', -5000);
    if (game.chainTutorialDone) push('完美连锁演出奖金', 3000);
    if (game.maxWhipCombo >= 10) push('鞭神连击奖金', 8000);
    else if (game.maxWhipCombo >= 5) push('鞭法表演奖金', 3000);
    else if (game.maxWhipCombo >= 3) push('小小抽打奖金', 1000);
    if (game.finisherDone) push('喜剧处决奖金', 5000);
    if (game.parryCount >= 3) push('拼文具表演奖', 2000);
    if (game.kiteCount >= 3) push('溜鬼大师奖', 2000);

    if (game.phase === 'lost') {
      push('死亡抚恤金', 0);
      push('精神损失费', -20000);
      push('违约金', -10000);
    }
    if (game.damageWaiver) {
      for (const row of rows) {
        if (row.amount < 0 && row.label !== '基本工资') {
          row.amount = Math.ceil(row.amount / 2);
        }
      }
      total = rows.reduce((sum, row) => sum + row.amount, 0);
    }

    let finalLine;
    let rating = 'C';
    let title = '摸鱼实习生';
    if (game.phase === 'lost') {
      finalLine = '公司表示：合同写得很清楚，死亡抚恤金 0円。';
      rating = 'D';
      title = '工伤免责声明爱好者';
    } else if (game.resignUnlocked) {
      finalLine = '你递上辞职信，主管追着你喊：你走了谁干活！';
      rating = 'S';
      title = '光荣跑路工';
    } else if (total <= 0) {
      finalLine = '恭喜！你不仅白干一天，还倒欠公司钱。';
    } else if (total < 5000) {
      finalLine = '主管：干得不错，明天还有一单，记得带交通费。';
    } else {
      finalLine = '主管：年轻人就是有活力，明天继续啊！';
    }

    const damages = rows
      .filter(r => r.amount < 0 && r.label !== '基本工资')
      .reduce((sum, r) => sum - r.amount, 0);
    const used = game.usedItems.length;
    if (game.phase !== 'lost') {
      if (damages === 0 && used <= 3) {
        rating = 'S';
        title = '老练跑路工';
      } else if (damages <= 5000 && used <= 6) {
        rating = 'A';
        title = '惊声尖笑实习生';
      } else if (damages <= 12000) {
        rating = 'B';
        title = '还算稳重的打工人';
      } else {
        rating = 'C';
        title = '拆迁队预备役';
      }
    }

    return { rows, total, finalLine, rating, title };
  }
}
