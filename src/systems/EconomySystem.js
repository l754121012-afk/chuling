import { GAME_CONFIG } from '../config/game.js';

const KEY = 'exorcist_progress_v1';

const POINTS_SHOP = {
  start_pen2: { name: '圆珠笔补给（+2）', cost: 300, icon: '✒', category: '补给', rarity: '普通', iconShape: 'square' },
  start_glue: { name: '胶水补给（+1）', cost: 500, icon: '⚗', category: '补给', rarity: '普通', iconShape: 'square' },
  start_tape: { name: '修正带补给（+1）', cost: 400, icon: '▤', category: '补给', rarity: '普通', iconShape: 'square' },
  start_crossbow: { name: '玩具弩补给（+1）', cost: 900, icon: '弩', category: '补给', rarity: '稀有', iconShape: 'diamond' },
  start_mine: { name: '尖叫地雷补给（+1）', cost: 500, icon: '地雷', category: '补给', rarity: '稀有', iconShape: 'diamond' },
  stamina_potion: { name: '体力恢复药（开局+30）', cost: 400, icon: '饭', category: '补给', rarity: '普通', iconShape: 'square' },
  battery_pack: { name: '手机电池扩容', cost: 600, icon: '🔋', category: '身体', rarity: '普通', iconShape: 'circle' },
  stamina_boost: { name: '更结实的鞋', cost: 800, icon: '鞋', category: '身体', rarity: '稀有', iconShape: 'circle' },
  free_pass: { name: '主管免责卡（一次捕获无效）', cost: 1200, icon: '卡', category: '保险', rarity: '稀有', iconShape: 'circle' },
  double_points: { name: '积分双倍券（下一局）', cost: 1000, icon: 'x2', category: '会员', rarity: '稀有', iconShape: 'hex' },
  discount_card: { name: '百元店会员卡', cost: 2000, icon: '卡', category: '会员', rarity: '史诗', iconShape: 'hex' },
  damage_waiver: { name: '赔偿减免券（赔偿减半）', cost: 1500, icon: '券', category: '保险', rarity: '史诗', iconShape: 'hex' }
};

const RELIC_SHOP = {
  finisher_toilet: { name: '新处决：塞进马桶', cost: 2, icon: '🚽', category: '处决', rarity: '普通', iconShape: 'diamond' },
  finisher_fan: { name: '新处决：挂到吊扇', cost: 2, icon: '风扇', category: '处决', rarity: '稀有', iconShape: 'diamond' },
  finisher_report: { name: '新处决：用成绩单扇脸', cost: 2, icon: '成绩单', category: '处决', rarity: '稀有', iconShape: 'diamond' },
  sweat_spray: { name: '止汗喷雾（体力回复+）', cost: 3, icon: '💨', category: '身体', rarity: '稀有', iconShape: 'circle' },
  ghost_hat: { name: '鬼帽子（皮肤）', cost: 2, icon: '帽', category: '装饰', rarity: '史诗', iconShape: 'circle' },
  phone_face: { name: '手机表情包（皮肤）', cost: 2, icon: '表情', category: '装饰', rarity: '稀有', iconShape: 'circle' },
  office_plant: { name: '办公室盆栽', cost: 3, icon: '盆栽', category: '办公室', rarity: '稀有', iconShape: 'hex' },
  office_vip: { name: '办公室装修（VIP打工）', cost: 3, icon: '🪑', category: '办公室', rarity: '史诗', iconShape: 'hex' },
  mine_upgrade: { name: '尖叫地雷升级（开局+1）', cost: 4, icon: '地雷', category: '道具升级', rarity: '稀有', iconShape: 'diamond' },
  auto_tape: { name: '自动修正带（开局+1）', cost: 5, icon: '▤', category: '道具升级', rarity: '稀有', iconShape: 'diamond' },
  auto_tape2: { name: '自动修正带 II（开局+2）', cost: 6, icon: '▤', category: '道具升级', rarity: '史诗', iconShape: 'diamond' },
  mine_upgrade2: { name: '尖叫地雷升级 II（开局+2）', cost: 6, icon: '地雷', category: '道具升级', rarity: '史诗', iconShape: 'diamond' },
  resign_key: { name: '隐藏辞职结局钥匙', cost: 8, icon: '钥匙', category: '结局', rarity: '传说', iconShape: 'hex' }
};

export class EconomySystem {
  constructor() {
    this.state = this._load();
  }

  _load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && typeof raw.points === 'number') {
        return {
          coins: Math.max(0, raw.coins || 0),
          points: Math.max(0, raw.points),
          relics: Math.max(0, raw.relics || 0),
          unlocks: raw.unlocks || {}
        };
      }
    } catch {
      // fall through to defaults
    }
    return { coins: 0, points: 0, relics: 0, unlocks: {} };
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      // storage unavailable
    }
  }

  award(game, settlement) {
    const ratingBonus = { S: 10, A: 6, B: 3, C: 1, D: 0 }[settlement.rating] || 0;
    let points = Math.max(0, Math.floor(settlement.total / 500)) + ratingBonus;
    if (game.doublePoints) points *= 2;
    let chance = 0.04 + ratingBonus * 0.02;
    if (game.finisherDone) chance += 0.25;
    if (game.parryCount >= 3) chance += 0.15;
    if (game.maxWhipCombo >= 10) chance += 0.15;
    if (game.kiteCount >= 3) chance += 0.1;
    chance = Math.min(0.95, chance);
    const guaranteed = settlement.rating === 'S' && game.finisherDone;
    const relics = guaranteed ? 1 : Math.random() < chance ? 1 : 0;
    this.state.coins += Math.max(0, Math.floor(settlement.total / 100));
    this.state.points += points;
    this.state.relics += relics;
    this.save();
    return { points, relics };
  }

  shopPrice(id) {
    const item = POINTS_SHOP[id];
    if (!item) return 0;
    const discount = this.state.unlocks.discount_card ? 0.8 : 1;
    return Math.max(1, Math.round(item.cost * discount));
  }

  buyPoints(id) {
    const price = this.shopPrice(id);
    if (this.state.points < price) return false;
    this.state.points -= price;
    this.state.unlocks[id] = true;
    this.save();
    return true;
  }

  buyRelic(id) {
    const item = RELIC_SHOP[id];
    if (!item) return false;
    if (this.state.relics < item.cost) return false;
    this.state.relics -= item.cost;
    this.state.unlocks[id] = true;
    this.save();
    return true;
  }

  applyRunMods(game) {
    const u = this.state.unlocks;
    if (u.start_pen2) game.addItem('pen', 2);
    if (u.start_glue) game.addItem('glue', 1);
    if (u.start_tape) game.addItem('tape', 1);
    if (u.start_crossbow) game.addItem('crossbow', 1);
    if (u.start_mine || u.mine_upgrade) game.addItem('mine', 1);
    if (u.auto_tape) game.addItem('tape', 1);
    if (u.battery_pack) game.batteryMax = 120;
    if (u.stamina_boost) game.staminaMax = GAME_CONFIG.staminaMax + 5;
    if (u.sweat_spray) game.staminaRegenBonus = 2;
    if (u.stamina_potion) game.stamina = Math.min(game.staminaMax, game.stamina + 30);
    if (u.free_pass) game.freePass = 1;
    if (u.damage_waiver) game.damageWaiver = true;
    if (u.double_points) game.doublePoints = true;
    if (u.auto_tape2) game.addItem('tape', 2);
    if (u.mine_upgrade2) game.addItem('mine', 2);
    if (u.resign_key) game.resignUnlocked = true;
  }

  get points() {
    return this.state.points;
  }

  get coins() {
    return this.state.coins;
  }

  get relics() {
    return this.state.relics;
  }

  get unlocks() {
    return this.state.unlocks;
  }
}

export { POINTS_SHOP, RELIC_SHOP };
