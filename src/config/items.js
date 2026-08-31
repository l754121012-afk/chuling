export const ITEM_DEFS = {
  pen: {
    id: 'pen', name: '圆珠笔', icon: '✒', type: 'throw',
    count: 6, damage: 8, rage: 9, speed: 17, mass: 0.12,
    desc: '会旋转，不一定笔尖朝前。', cost: 300
  },
  glue: {
    id: 'glue', name: '胶水', icon: '⚗', type: 'throw',
    count: 2, damage: 0, rage: 4, speed: 12, mass: 0.35, slow: 3,
    desc: '粘住鬼，也可能粘住自己。', cost: 500
  },
  stapler: {
    id: 'stapler', name: '订书机', icon: '⛓', type: 'seal',
    count: 1, damage: 0, rage: 30, mass: 0.8,
    desc: '正确时机才能封印。', cost: 800
  },
  tape: {
    id: 'tape', name: '修正带', icon: '▤', type: 'trap',
    count: 2, damage: 0, rage: 3, mass: 0.2,
    desc: '在地上画个黏黏的陷阱。', cost: 400
  },
  crossbow: {
    id: 'crossbow', name: '玩具弩', icon: '弩', type: 'throw',
    count: 1, damage: 12, rage: 7, speed: 20, mass: 0.8,
    knockback: 12, stun: 0.8, desc: '射中会把鬼顶飞。', cost: 900
  },
  mine: {
    id: 'mine', name: '尖叫地雷', icon: '地雷', type: 'mine',
    count: 1, damage: 0, rage: 3, mass: 0.4,
    desc: '鬼踩到会被弹开并僵直。', cost: 500
  }
};

export const COMBO_DEFS = {
  slingshot: {
    id: 'slingshot', name: '自制弹弓', icon: '⚡',
    requires: ['pen', 'rubber'], consumes: 'rubber',
    damage: 20, rage: 7, speed: 30,
    desc: '橡皮筋+圆珠笔，威力一般但很响。'
  }
};
