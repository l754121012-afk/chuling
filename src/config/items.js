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
  scissors: {
    id: 'scissors', name: '剪刀', icon: '✂', type: 'throw',
    count: 1, damage: 25, rage: 12, speed: 14, mass: 0.25,
    desc: '可能插进天花板。', cost: 600
  },
  tape: {
    id: 'tape', name: '修正带', icon: '▤', type: 'trap',
    count: 2, damage: 0, rage: 3, mass: 0.2,
    desc: '在地上画个黏黏的陷阱。', cost: 400
  },
  rubber: {
    id: 'rubber', name: '橡皮筋', icon: '◯', type: 'throw',
    count: 3, damage: 5, rage: 3, speed: 24, mass: 0.03,
    desc: '弹得快，威力小。', cost: 100
  },
  eraser: {
    id: 'eraser', name: '黑板擦', icon: '▦', type: 'throw',
    count: 1, damage: 3, rage: 5, speed: 18, mass: 0.2,
    knockback: 8, desc: '打中会把鬼拍退一截。', cost: 350
  },
  chair: {
    id: 'chair', name: '椅子', icon: '椅', type: 'throw',
    count: 1, damage: 18, rage: 10, speed: 11, mass: 3,
    knockback: 14, stun: 1.0, desc: '重！砸中会把鬼拍飞。', cost: 700
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
