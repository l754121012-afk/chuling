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
    if (game.damages.includes('glass')) push('玻璃赔偿', -5000);

    if (game.phase === 'lost') {
      push('死亡抚恤金', 0);
      push('精神损失费', -20000);
      push('违约金', -10000);
    }

    let finalLine;
    if (game.phase === 'lost') {
      finalLine = '公司表示：合同写得很清楚，死亡抚恤金 0円。';
    } else if (total <= 0) {
      finalLine = '恭喜！你不仅白干一天，还倒欠公司钱。';
    } else if (total < 5000) {
      finalLine = '主管：干得不错，明天还有一单，记得带交通费。';
    } else {
      finalLine = '主管：年轻人就是有活力，明天继续啊！';
    }

    return { rows, total, finalLine };
  }
}
