import { ITEM_DEFS } from '../config/items.js';
import { GAME_CONFIG } from '../config/game.js';
import { CLUE_TEXT, DETENTION_CLUE_TEXT } from './ClueSystem.js';
import { POINTS_SHOP, RELIC_SHOP } from './EconomySystem.js';

export class UISystem {
  constructor(game, events, economy) {
    this.game = game;
    this.events = events;
    this.economy = economy;
    this.el = {};
    this.selectedSlot = 0;
    this._toastTimer = null;
    this._speechTimer = null;
    this._flashTimer = null;
    this._actCardTimer = null;
    this._parryTimer = null;
    this._registerEvents();
  }

  init() {
    this.el = {
      start: document.getElementById('screen-start'),
      win: document.getElementById('screen-win'),
      lose: document.getElementById('screen-lose'),
      hud: document.getElementById('hud'),
      phone: document.getElementById('phone'),
      phoneTime: document.querySelector('.phone-time'),
      rageSegments: [...document.querySelectorAll('.rage-seg')],
      stageLabel: document.getElementById('stage-label'),
      battery: document.getElementById('battery-bar'),
      composureBar: document.getElementById('composure-bar'),
      dramaBar: document.getElementById('drama-bar'),
      stamina: document.getElementById('stamina-bar'),
      objective: document.getElementById('objective'),
      inventory: document.getElementById('inventory'),
      backpackBtn: document.getElementById('backpack-btn'),
      backpackModal: document.getElementById('backpack-modal'),
      backpackList: document.getElementById('backpack-list'),
      slotSelect: document.getElementById('slot-select'),
      backpackClose: document.querySelector('.backpack-close'),
      shopModal: document.getElementById('shop-modal'),
      shopTitle: document.getElementById('shop-title'),
      shopBalance: document.getElementById('shop-balance'),
      shopList: document.getElementById('shop-list'),
      shopClose: document.querySelector('.shop-close'),
      shopBtn: document.getElementById('shop-btn'),
      relicBtn: document.getElementById('relic-btn'),
      economyBalance: document.getElementById('economy-balance'),
      debtLine: document.getElementById('debt-line'),
      caseBoard: document.getElementById('case-board'),
      debtPaidWin: document.getElementById('debt-paid-win'),
      debtPaidLose: document.getElementById('debt-paid-lose'),
      gachaBtn: document.getElementById('gacha-btn'),
      gachaModal: document.getElementById('gacha-modal'),
      gachaClose: document.querySelector('.gacha-close'),
      gachaBalance: document.getElementById('gacha-balance'),
      gachaPullBtn: document.getElementById('gacha-pull-btn'),
      gachaResult: document.getElementById('gacha-result'),
      wheelModal: document.getElementById('wheel-modal'),
      wheelClose: document.querySelector('.wheel-close'),
      wheelDisc: document.getElementById('wheel-disc'),
      wheelSpinBtn: document.getElementById('wheel-spin-btn'),
      wheelResult: document.getElementById('wheel-result'),
      wheelBtnWin: document.getElementById('wheel-btn-win'),
      wheelBtnLose: document.getElementById('wheel-btn-lose'),
      voteModal: document.getElementById('vote-modal'),
      votePrompt: document.getElementById('vote-prompt'),
      voteOptions: document.getElementById('vote-options'),
      toast: document.getElementById('toast'),
      speech: document.getElementById('speech'),
      dialogue: document.getElementById('dialogue'),
      dialogueName: document.getElementById('dialogue-name'),
      dialogueText: document.getElementById('dialogue-text'),
      prompt: document.getElementById('prompt'),
      notebook: document.getElementById('notebook'),
      notebookList: document.getElementById('notebook-list'),
      mute: document.getElementById('mute-btn'),
      settlementRows: document.getElementById('settlement-rows'),
      settlementTotal: document.getElementById('settlement-total'),
      settlementLine: document.getElementById('settlement-line'),
      settlementRating: document.getElementById('settlement-rating'),
      loseRows: document.getElementById('lose-rows'),
      loseTotal: document.getElementById('lose-total'),
      loseLine: document.getElementById('lose-line'),
      loseRating: document.getElementById('lose-rating'),
      vignette: document.getElementById('danger-vignette'),
      darkOverlay: document.getElementById('dark-overlay'),
      blackoutOverlay: document.getElementById('blackout-overlay'),
      warning: document.getElementById('ghost-warning'),
      warningLabel: document.getElementById('warn-label'),
      whipHint: document.getElementById('whip-hint'),
      whipLabel: document.getElementById('whip-label'),
      whipCombo: document.getElementById('whip-combo'),
      crosshair: document.getElementById('crosshair'),
      parryHint: document.getElementById('parry-hint'),
      itemHint: document.getElementById('item-hint'),
      lives: document.getElementById('lives'),
      sealStatus: document.getElementById('seal-status'),
      flashOverlay: document.getElementById('flash-overlay'),
      danmaku: document.getElementById('danmaku'),
      fullscreenBtn: document.getElementById('fullscreen-btn'),
      bestRecord: document.getElementById('best-record'),
      actCard: document.getElementById('act-card'),
      actTitle: document.getElementById('act-title'),
      actLine: document.getElementById('act-line')
    };
    this._buildInventory();
    if (this.economy?.unlocks?.phone_face) {
      const head = this.el.phone?.querySelector('.phone-head span');
      if (head) head.textContent = '安心手机 XD';
    }
    if (this.economy?.unlocks?.office_vip) {
      const stamp = document.querySelector('.start-stamp');
      if (stamp) stamp.textContent = 'PHASE 0 · VIP 打工人';
    }

    document.getElementById('start-btn').addEventListener('click', () => {
      this.events.emit('game.start');
    });
    for (const id of ['restart-win', 'restart-lose']) {
      document.getElementById(id).addEventListener('click', () => location.reload());
    }
    this.el.notebook.querySelector('.notebook-close').addEventListener('click', () => {
      this.toggleNotebook(false);
    });
    this.el.backpackBtn?.addEventListener('click', () => this.toggleBackpack());
    this.el.backpackClose?.addEventListener('click', () => this.toggleBackpack(false));
    this.el.shopBtn?.addEventListener('click', () => this.openShop('points'));
    this.el.relicBtn?.addEventListener('click', () => this.openShop('relics'));
    this.el.gachaBtn?.addEventListener('click', () => this.openGacha());
    this.el.gachaClose?.addEventListener('click', () => this.closeGacha());
    this.el.gachaPullBtn?.addEventListener('click', () => this.pullGacha());
    this.el.wheelBtnWin?.addEventListener('click', () => this.openWheel());
    this.el.wheelBtnLose?.addEventListener('click', () => this.openWheel());
    this.el.wheelClose?.addEventListener('click', () => this.closeWheel());
    this.el.wheelSpinBtn?.addEventListener('click', () => this.spinWheel());
    this.el.shopClose?.addEventListener('click', () => this.closeShop());
    this.el.mute.addEventListener('click', () => {
      this.el.mute.classList.toggle('muted');
    });
    this.sync(this.game);
    this.showBest();
    this.renderEconomyBalance();
    this.renderCaseBoard();
  }

  saveBest(game, settlement) {
    const rank = { S: 4, A: 3, B: 2, C: 1, D: 0 };
    const key = 'exorcist_best';
    let best = { rank: -1, time: null, rating: '-', title: '' };
    try {
      best = JSON.parse(localStorage.getItem(key) || 'null') || best;
    } catch {
      best = { rank: -1, time: null, rating: '-', title: '' };
    }
    let changed = false;
    if (game.phase === 'win') {
      const r = rank[settlement.rating] || 0;
      if (r > best.rank) {
        best.rank = r;
        best.rating = settlement.rating;
        best.title = settlement.title;
        changed = true;
      }
      const t = Math.round(game.runTime);
      if (best.time === null || t < best.time) {
        best.time = t;
        changed = true;
      }
    }
    if (changed) localStorage.setItem(key, JSON.stringify(best));
  }

  showBest() {
    const el = this.el.bestRecord;
    if (!el) return;
    let best = null;
    try {
      best = JSON.parse(localStorage.getItem('exorcist_best') || 'null');
    } catch {
      best = null;
    }
    if (!best || (best.rank < 0 && best.time === null)) {
      el.textContent = '最佳记录：--';
      return;
    }
    const time = best.time === null ? '--' : `${Math.floor(best.time / 60)}分${String(best.time % 60).padStart(2, '0')}秒`;
    el.textContent = `最佳记录：${best.rating} ${best.title} · ${time}`;
    this.renderEconomyBalance();
  }

  _buildInventory() {
    this.el.inventory.innerHTML = '';
    const ids = this.game.quickSlots;
    for (let i = 0; i < ids.length; i++) {
      const def = ITEM_DEFS[ids[i]];
      const slot = document.createElement('button');
      slot.className = 'inv-slot';
      slot.dataset.itemId = def.id;
      slot.addEventListener('click', () => this.selectSlot(i));
      slot.innerHTML = `
        <span class="inv-key">${i + 1}</span>
        <span class="inv-icon">${def.icon}</span>
        <span class="inv-name">${def.name}</span>
        <span class="inv-count">0</span>
      `;
      this.el.inventory.appendChild(slot);
    }
  }

  selectSlot(i) {
    this.selectedSlot = i;
    const id = this.game.quickSlots[i];
    if (id && this.game.hasItem(id)) {
      this.game.equipped = id;
      this.events.emit('aim.changed', { aiming: false, combo: false });
    }
    this.sync(this.game);
    this.renderBackpack();
  }

  toggleBackpack(force) {
    const open = force ?? this.el.backpackModal.classList.contains('hidden');
    this.el.backpackModal.classList.toggle('hidden', !open);
    if (open) this.renderBackpack();
  }

  openGacha() {
    this.el.gachaModal?.classList.remove('hidden');
    this.renderGacha();
  }

  closeGacha() {
    this.el.gachaModal?.classList.add('hidden');
  }

  renderGacha() {
    if (!this.el.gachaBalance) return;
    this.el.gachaBalance.textContent = `👻 灵异纪念品：${this.economy.relics}`;
    this.el.gachaResult.textContent = '';
  }

  pullGacha() {
    const result = this.economy.gachaRelic();
    if (!result) {
      this.el.gachaResult.textContent = '纪念品不够：先去多坑几只鬼。';
      return;
    }
    this.renderGacha();
    this.el.gachaResult.textContent = `扭蛋机吐出：${result.name}`;
    this.renderEconomyBalance();
  }

  openWheel() {
    if (!this.el.wheelModal) return;
    this.el.wheelModal.classList.remove('hidden');
    this._wheelUsed = this._wheelUsed || false;
    if (this.el.wheelDisc) {
      this.el.wheelDisc.style.background =
        'conic-gradient(#ffd166 0 60deg,#ff6b6b 60deg 120deg,#8ef0c8 120deg 180deg,#b48cff 180deg 240deg,#ff9f45 240deg 300deg,#5ad1ff 300deg 360deg)';
    }
    if (this.el.wheelSpinBtn) this.el.wheelSpinBtn.disabled = this._wheelUsed;
    if (this.el.wheelResult) {
      this.el.wheelResult.textContent = this._wheelUsed
        ? '免费机会已经用过了。'
        : '每次委托结算后有一次免费转盘机会。';
    }
  }

  closeWheel() {
    this.el.wheelModal?.classList.add('hidden');
  }

  spinWheel() {
    if (this._wheelUsed) return;
    this._wheelUsed = true;
    if (this.el.wheelSpinBtn) this.el.wheelSpinBtn.disabled = true;
    const result = this.economy.wheelSpin();
    this.el.wheelResult.textContent = `转出：${result.label}，+${result.reward.toLocaleString()} 金币` +
      (result.debtPaid > 0 ? `，自动还债 ${result.debtPaid.toLocaleString()}` : '');
    this.renderEconomyBalance();
  }

  renderBackpack() {
    if (!this.el.backpackList || !this.el.slotSelect) return;
    this.el.slotSelect.innerHTML = '';
    this.game.quickSlots.forEach((id, i) => {
      const btn = document.createElement('button');
      btn.textContent = id ? `${ITEM_DEFS[id]?.name || id} x${this.game.inventory.get(id) || 0}` : '空位';
      btn.classList.toggle('selected', i === this.selectedSlot);
      btn.addEventListener('click', () => this.selectSlot(i));
      this.el.slotSelect.appendChild(btn);
    });
    this.el.backpackList.innerHTML = '';
    for (const [id, count] of this.game.inventory) {
      if (count <= 0) continue;
      const def = ITEM_DEFS[id];
      const row = document.createElement('div');
      row.className = 'backpack-row';
      const inSlot = this.game.quickSlots.includes(id);
      row.innerHTML = `<span>${def?.name || id} x${count}</span>`;
      const btn = document.createElement('button');
      btn.textContent = inSlot ? '装备' : '放入';
      btn.addEventListener('click', () => {
        if (inSlot) {
          this.game.equipped = id;
        } else {
          this.game.quickSlots[this.selectedSlot] = id;
          this.game.equipped = id;
        }
        this.events.emit('aim.changed', { aiming: false, combo: false });
        this.sync(this.game);
        this.renderBackpack();
      });
      row.appendChild(btn);
      this.el.backpackList.appendChild(row);
    }
  }

  openShop(type) {
    this._shopType = type;
    this.el.shopTitle.textContent = type === 'points' ? '百元店补给站' : '灵异收藏柜';
    this.el.shopModal.classList.remove('hidden');
    this.renderShop();
  }

  closeShop() {
    this.el.shopModal.classList.add('hidden');
  }

  renderShop() {
    if (!this.el.shopList) return;
    const pointsMode = this._shopType === 'points';
    const items = pointsMode ? POINTS_SHOP : RELIC_SHOP;
    const rarityOrder = ['普通', '稀有', '史诗', '传说'];
    const rarityColor = { 普通: '#8a8f98', 稀有: '#4c9fe8', 史诗: '#b48cff', 传说: '#ffd166' };
    this.el.shopBalance.textContent = pointsMode
      ? `🛒 百元店积分：${this.economy.points} · 🪙 ${this.economy.coins}`
      : `👻 灵异纪念品：${this.economy.relics}`;
    this.el.shopList.innerHTML = '';
    const byCategory = {};
    for (const [id, def] of Object.entries(items)) {
      (byCategory[def.category] ||= []).push({ id, def });
    }
    for (const [category, list] of Object.entries(byCategory)) {
      const head = document.createElement('div');
      head.className = 'shop-category';
      head.textContent = category;
      this.el.shopList.appendChild(head);
      list.sort((a, b) => rarityOrder.indexOf(a.def.rarity) - rarityOrder.indexOf(b.def.rarity));
      for (const { id, def } of list) {
      const owned = !!this.economy.unlocks[id];
      const cost = pointsMode ? this.economy.shopPrice(id) : def.cost;
      const affordable = pointsMode
        ? this.economy.points >= cost
        : this.economy.relics >= cost;
      const row = document.createElement('div');
      row.className = 'shop-row';
      const color = rarityColor[def.rarity] || '#8a8f98';
      row.innerHTML = `
        <span class="shop-icon ${def.iconShape || 'square'}" style="--rc:${color}">${def.icon}</span>
        <span class="shop-name">${def.name}</span>
        <span class="shop-rarity" style="color:${color}">${def.rarity}</span>
      `;
      const btn = document.createElement('button');
      btn.textContent = owned ? '已拥有' : `${cost}${pointsMode ? ' 积分' : ' 纪念品'}`;
      btn.disabled = owned || !affordable;
      if (!owned) {
        btn.addEventListener('click', () => {
          const ok = pointsMode ? this.economy.buyPoints(id) : this.economy.buyRelic(id);
          if (ok) {
            this.renderEconomyBalance();
            this.renderShop();
          }
        });
      }
      row.appendChild(btn);
      this.el.shopList.appendChild(row);
      }
    }
  }

  renderEconomyBalance() {
    if (!this.el.economyBalance) return;
    this.el.economyBalance.textContent =
      `🪙 ${this.economy.coins} · 🛒 ${this.economy.points} · 👻 ${this.economy.relics}`;
    if (this.el.debtLine) {
      this.el.debtLine.textContent = this.economy.debt > 0
        ? `催债单：还欠 ${this.economy.debt.toLocaleString()} 円`
        : '催债单：还清了！（主管：我不信）';
    }
  }

  renderCaseBoard() {
    if (!this.el.caseBoard) return;
    const done = new Set(this.economy.state.completedCases || []);
    const cases = [
      {
        id: 'classroom01',
        name: '01 值日教室',
        state: done.has('classroom01') ? '已完成，可再刷' : '当前可接'
      },
      {
        id: 'detention02',
        name: '02 禁闭室怪谈',
        state: done.has('classroom01')
          ? '白盒切片可测（上方按钮）'
          : '可直接测试白盒切片'
      }
    ];
    this.el.caseBoard.innerHTML = '<span>单子板</span>';
    for (const c of cases) {
      const row = document.createElement('p');
      row.className = done.has(c.id) ? 'case-done' : '';
      row.textContent = `${c.name} — ${c.state}`;
      this.el.caseBoard.appendChild(row);
    }
  }

  sync(game) {
    if (game.phase === 'menu') {
      this.el.start.classList.remove('hidden');
      this.el.hud.classList.add('hidden');
      this.el.win.classList.add('hidden');
      this.el.lose.classList.add('hidden');
      return;
    }
    this.el.start.classList.add('hidden');
    if (game.phase === 'win') {
      this.el.win.classList.remove('hidden');
      this.el.hud.classList.add('hidden');
      return;
    }
    if (game.phase === 'lost') {
      this.el.lose.classList.remove('hidden');
      this.el.hud.classList.add('hidden');
      return;
    }
    this.el.win.classList.add('hidden');
    this.el.lose.classList.add('hidden');
    this.el.hud.classList.remove('hidden');

    const stage = game.currentStage();
    const stageIdx = Math.min(this.el.rageSegments.length - 1, Math.floor(game.rage / 20));
    this.el.rageSegments.forEach((seg, i) => {
      seg.classList.toggle('active', i < stageIdx);
      seg.classList.toggle('current', i === stageIdx);
    });
    this.el.stageLabel.textContent = `恶灵：${stage.label}`;
    this.el.battery.style.width = `${(game.battery / game.batteryMax) * 100}%`;
    this.el.phone.classList.toggle('drained', game.battery <= 0);
    if (this.el.darkOverlay) {
      const dark = Math.max(0, (100 - game.battery) / 100);
      this.el.darkOverlay.style.opacity = String(dark * 0.85);
    }
    if (this.el.composureBar) {
      this.el.composureBar.style.width = `${game.composure}%`;
      this.el.composureBar.parentElement?.classList.toggle('broken', game.broken);
    }
    if (this.el.dramaBar) {
      this.el.dramaBar.style.width = `${game.drama}%`;
      this.el.dramaBar.parentElement?.classList.toggle('full', game.drama >= GAME_CONFIG.dramaMax);
    }
    this.el.stamina.style.width = `${game.stamina}%`;
    this._updatePhoneTimer(game);
    if (this.el.lives) {
      this.el.lives.innerHTML = [0, 1, 2]
        .map(i => `<span class="life ${i < game.lives ? 'on' : 'off'}">♥</span>`)
        .join('');
    }
    this.el.objective.textContent = this._objectiveText(game);

    const slots = this.el.inventory.querySelectorAll('.inv-slot');
    slots.forEach(slot => {
      const id = slot.dataset.itemId;
      const count = game.inventory.get(id) || 0;
      slot.querySelector('.inv-count').textContent = count;
      slot.classList.toggle('empty', count <= 0);
      slot.classList.toggle('selected', game.equipped === id && count > 0);
    });

    const def = ITEM_DEFS[game.equipped];
    if (def) {
      const usage = def.type === 'throw'
        ? '右键/左键瞄准，再点左键或 F 射出'
        : def.type === 'seal'
          ? '找到弱点，靠近鬼背后左键封印'
          : def.type === 'mine'
            ? '左键在脚下放置尖叫地雷'
            : '左键在脚下放置陷阱';
      this.el.itemHint.textContent = `${def.name}：${usage}`;
    }
    if (this.el.whipHint) {
      const now = performance.now() / 1000;
      const ready = game.whipCooldownUntil <= now;
      const comboActive = game.whipCombo >= 2 && game.whipComboUntil > now;
      this.el.whipHint.classList.toggle('ready', ready);
      this.el.whipHint.classList.toggle('cooldown', !ready);
      this.el.whipHint.classList.toggle('combo', comboActive);
      this.el.whipHint.classList.toggle('active', game.whipMode);
      if (this.el.whipLabel) {
        this.el.whipLabel.textContent = game.whipMode ? '模式中·左键连抽' : '鞭子';
      }
      if (this.el.whipCombo) {
        this.el.whipCombo.textContent = comboActive ? `x${game.whipCombo}` : '';
      }
    }
  }

  _updatePhoneTimer(game) {
    if (!this.el.phoneTime) return;
    const now = performance.now() / 1000;
    if (game.bellPhaseActive && game.bellPhaseUntil > now) {
      const remain = Math.max(0, Math.ceil(game.bellPhaseUntil - now));
      this.el.phoneTime.textContent = `铃声 ${remain}s`;
      this.el.phoneTime.classList.add('urgent');
      return;
    }
    this.el.phoneTime.classList.remove('urgent');
    if (game.runStart <= 0) {
      this.el.phoneTime.textContent = '距响铃 --';
      return;
    }
    const idx = game.bellPhaseIndex;
    if (idx < GAME_CONFIG.bellPhaseTimes.length) {
      const at = game.runStart + GAME_CONFIG.bellPhaseTimes[idx];
      const remain = Math.max(0, Math.ceil(at - now));
      this.el.phoneTime.textContent = remain > 0 ? `距响铃 ${remain}s` : '即将响铃';
    } else {
      this.el.phoneTime.textContent = '今日无铃声';
    }
  }

  _objectiveText(game) {
    if (game.runMode && game.runStage === 1 && game.phase === 'investigate') {
      return '第一幕 · 两支笔：帮值日鬼小满找回圆珠笔，别让鬼发现你';
    }
    if (game.runMode && game.runStage === 3 && game.phase === 'investigate') {
      return '第三幕 · 旧仓库：找到失火那晚的真相，让两支笔重新并排';
    }
    if (game.detentionMode && game.phase === 'investigate') {
      return '禁闭室白盒切片：穿过隔间迷宫，去教师办公室找程老师留下的值日表';
    }
    if (game.artifactActive && game.phase !== 'escape') {
      if (game.artifactStage === 0) return '清仓守卫战幕 1：广播封锁，躲开红色警戒区！';
      if (game.artifactStage === 1) return '清仓守卫战幕 2：抢清仓道具，鬼马上就来了！';
      if (game.artifactStage === 2) {
        return game.artifactDefendTime > 0
          ? `守卫镇店之宝！再守 ${Math.ceil(GAME_CONFIG.artifactDefendDuration - game.artifactDefendTime)} 秒！`
          : '镇店之宝出现了！站进金圈开始守卫！';
      }
    }
    if (game.phase === 'escape') {
      const weak = game.weakUntil > performance.now() / 1000;
      return weak
        ? `鬼虚弱了：快跑向出口！剩余 ${Math.ceil(game.escapeTimer)} 秒`
        : `它追上来了！快跑！剩余 ${Math.ceil(game.escapeTimer)} 秒`;
    }
    if (game.broken) {
      return game.hasItem('stapler')
        ? '鬼破防了！靠近按 E 处决！'
        : '鬼破防了！先去拿订书机再回来处决！';
    }
    if (game.chainActive && game.chainStep !== 'done') {
      const steps = {
        place: game.hasItem('tape')
          ? '连锁教学：把修正带画进黄色圈里（教室西侧书架旁）'
          : '连锁教学：先拿修正带，再画进黄色圈里',
        lure: '连锁教学：鬼走向陷阱了，用 G 抽它或等它踩上去',
        shelf: '连锁教学：它黏住了！推倒书架把它压扁！',
        seal: '连锁教学：它被压扁了！用订书机封印！'
      };
      return steps[game.chainStep] || steps.place;
    }
    const hasNote = game.hasClue('note');
    const hasBoard = game.hasClue('blackboard');
    if (game.staplerBroken) return '订书机坏了：打空灵体值，或等备用订书机刷新';
    if (game.firstScareDone && !hasNote && !hasBoard) return '它注意到你了：躲进安全屋或绕柱甩开它';
    const stage = game.currentStage();
    if (stage.id === 'furious' || stage.id === 'insane') return '它暴怒了：躲进柜子降怒，或打空灵体值';
    if (stage.id === 'angry') return '它生气了：躲进柜子降怒，或打空灵体值';
    if (hasNote && hasBoard) return '趁它冷静，从背后用订书机封印';
    if (hasNote) return '还差一条线索：看看黑板上写了什么';
    if (hasBoard) return '线索已更新：它讨厌被打扰，再看看桌上的纸条';
    return '调查教室：找到黑板和纸条两条线索';
  }

  showToast(text, ms = 1800) {
    if (typeof text === 'string' && text.startsWith('主管：')) {
      this.showSpeech(text.slice(3), ms, '主管');
      return;
    }
    clearTimeout(this._toastTimer);
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this._toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), ms);
  }

  showSpeech(text, ms = 1800, name = '值日鬼') {
    clearTimeout(this._speechTimer);
    if (!this.el.dialogue) return;
    this.el.dialogueName.textContent = name;
    this.el.dialogueText.textContent = text;
    this.el.dialogue.classList.remove('hidden');
    this._speechTimer = setTimeout(() => this.el.dialogue.classList.add('hidden'), ms);
  }

  showPrompt(p) {
    const text = typeof p === 'string' ? p : (p?.text || '');
    if (!text) {
      this.el.prompt.textContent = '';
      this.el.prompt.style.left = '';
      this.el.prompt.style.top = '';
      this.el.prompt.style.transform = '';
      this.el.prompt.classList.remove('show');
      return;
    }
    this.el.prompt.textContent = text;
    if (p && typeof p.x === 'number') {
      this.el.prompt.style.left = `${p.x}px`;
      this.el.prompt.style.top = `${p.y}px`;
      this.el.prompt.style.transform = 'translate(-50%, -110%)';
    } else {
      this.el.prompt.style.left = '';
      this.el.prompt.style.top = '';
      this.el.prompt.style.transform = '';
    }
    this.el.prompt.classList.add('show');
  }

  updateSealStatus(player, ghost) {
    const el = this.el.sealStatus;
    if (!el) return;
    const game = this.game;
    const active = game.equipped === 'stapler' &&
      game.hasClue('note') &&
      game.phase === 'investigate';
    if (!active) {
      el.classList.remove('show', 'ready');
      return;
    }
    const p = player.getPos();
    const gp = ghost.getPos();
    const dx = p.x - gp.x;
    const dz = p.z - gp.z;
    const dist = Math.hypot(dx, dz);
    const facingX = Math.sin(ghost._facing);
    const facingZ = Math.cos(ghost._facing);
    const dot = (dx * facingX + dz * facingZ) / (dist || 1);
    const behind = dot < -0.25;
    const ready = dist <= 2.4 && behind;
    el.classList.toggle('show', true);
    el.classList.toggle('ready', ready);
    el.textContent = ready ? '背后封印！按左键' : `距离 ${dist.toFixed(1)}m，绕到背后`;
  }

  toggleNotebook(force) {
    const open = force ?? !this.game.notebookOpen;
    this.game.notebookOpen = open;
    this.el.notebook.classList.toggle('hidden', !open);
    if (open) {
      this.el.notebookList.innerHTML = '';
      const groups = {};
      const textMap = this.game.detentionMode ? DETENTION_CLUE_TEXT : CLUE_TEXT;
      for (const [id, clue] of Object.entries(textMap)) {
        if (!this.game.hasClue(id)) continue;
        (groups['线索'] ||= []).push({ title: clue.title, text: clue.text });
      }
      for (const note of this.game.notebookEntries || []) {
        (groups[note.category || '其它'] ||= []).push({
          title: note.title,
          text: note.text
        });
      }
      for (const [category, entries] of Object.entries(groups)) {
        const head = document.createElement('div');
        head.className = 'clue-group';
        head.textContent = category;
        this.el.notebookList.appendChild(head);
        for (const entry of entries) {
        const row = document.createElement('div');
        row.className = 'clue-row';
        row.innerHTML = `
          <div class="clue-title">${entry.title}</div>
          <div class="clue-text">${entry.text}</div>
        `;
        this.el.notebookList.appendChild(row);
        }
      }
    }
  }

  showWin(settlement) {
    this.renderSettlement(this.el.settlementRows, this.el.settlementTotal, this.el.settlementLine, settlement);
  }

  showLose(settlement) {
    this.renderSettlement(this.el.loseRows, this.el.loseTotal, this.el.loseLine, settlement);
  }

  renderSettlement(rowsEl, totalEl, lineEl, settlement) {
    const ratingEl = rowsEl === this.el.settlementRows ? this.el.settlementRating : this.el.loseRating;
    const debtPaidEl = rowsEl === this.el.settlementRows ? this.el.debtPaidWin : this.el.debtPaidLose;
    if (ratingEl) ratingEl.textContent = `节目效果评分：${settlement.rating} · ${settlement.title}`;
    if (debtPaidEl) {
      debtPaidEl.textContent = this.economy.debt > 0
        ? `已还债 ${settlement.debtPaid || 0}，剩余欠款 ${this.economy.debt.toLocaleString()}`
        : `欠款已还清！`;
    }
    rowsEl.innerHTML = '';
    if (settlement.ghostReport) {
      const ghostBlock = document.createElement('div');
      ghostBlock.className = 'settle-ghost';
      ghostBlock.innerHTML = `
        <div class="settle-dual">
          <div class="settle-side player-side">
            <span>实习生工单</span>
            <b>${Math.max(0, settlement.total).toLocaleString()}</b>
          </div>
          <div class="settle-vs">VS</div>
          <div class="settle-side ghost-side">
            <span>值日鬼考勤</span>
            <b>${settlement.ghostReport.score.toLocaleString()}</b>
          </div>
        </div>
        <div class="ghost-memory">${settlement.ghostReport.line}</div>
      `;
      rowsEl.appendChild(ghostBlock);
    }
    const groups = { coin: [], points: [], relic: [] };
    for (const row of settlement.rows) {
      (groups[row.currency || 'coin'] || groups.coin).push(row);
    }
    const headers = {
      coin: '🪙 金币 / 工资',
      points: '🛒 百元店积分',
      relic: '👻 灵异纪念品'
    };
    for (const key of ['coin', 'points', 'relic']) {
      const list = groups[key];
      if (!list.length) continue;
      const head = document.createElement('div');
      head.className = 'settle-group';
      head.textContent = headers[key];
      rowsEl.appendChild(head);
      for (const row of list) {
        const div = document.createElement('div');
        div.className = 'settle-row';
        div.innerHTML = `<span>${row.label}</span><span class="${row.amount >= 0 ? 'plus' : 'minus'}">${row.amount >= 0 ? '+' : ''}${row.amount.toLocaleString()}</span>`;
        rowsEl.appendChild(div);
      }
    }
    totalEl.textContent = `${settlement.total.toLocaleString()} 円`;
    lineEl.textContent = settlement.finalLine;
  }

  _registerEvents() {
    this.events.on('rage.changed', () => this.sync(this.game));
    this.events.on('item.picked', () => this.sync(this.game));
    this.events.on('clue.found', () => this.sync(this.game));
    this.events.on('escape.start', () => this.sync(this.game));
    this.events.on('toast', p => this.showToast(p.text, p.ms));
    this.events.on('speech', p => this.showSpeech(p.text, p.ms, p.name));
    this.events.on('interact.prompt', p => this.showPrompt(p));
    this.events.on('ghost.visual', p => {
      this.el.vignette.style.setProperty('--danger', String(p.danger));
      this.el.vignette.classList.toggle('active', p.danger > 0.05);
      this.el.warning.classList.toggle('active', p.danger > 0.2);
      this.el.warningLabel.textContent = p.label;
    });
    this.events.on('aim.changed', p => {
      this.el.crosshair.classList.toggle('aiming', !!p.aiming);
      this.el.crosshair.classList.toggle('combo', !!p.combo);
    });
    this.events.on('phone.flash', () => {
      this.el.flashOverlay.style.setProperty('--flash-color', 'rgba(255,255,255,0.9)');
      this.el.flashOverlay.classList.add('show');
      clearTimeout(this._flashTimer);
      this._flashTimer = setTimeout(() => {
        this.el.flashOverlay.classList.remove('show');
        this.el.flashOverlay.style.removeProperty('--flash-color');
      }, 240);
    });
    this.events.on('beat.flash', p => {
      this.el.flashOverlay.style.setProperty('--flash-color', p?.color || '#ff6b6b');
      this.el.flashOverlay.classList.add('show');
      clearTimeout(this._flashTimer);
      this._flashTimer = setTimeout(() => {
        this.el.flashOverlay.classList.remove('show');
        this.el.flashOverlay.style.removeProperty('--flash-color');
      }, 340);
    });
    this.events.on('act.card', p => this.showActCard(p.title, p.line));
    this.events.on('ghost.telegraph', () => this.showParryHint());
    this.events.on('danmaku', p => this.showDanmaku(p.text));
    this.events.on('danmaku.burst', () => this.showDanmakuBurst());
    this.events.on('blackout.start', () => {
      this.el.blackoutOverlay?.classList.add('show');
    });
    this.events.on('blackout.end', () => {
      this.el.blackoutOverlay?.classList.remove('show');
    });
    this.events.on('hunt.start', () => document.body.classList.add('hunt'));
    this.events.on('hunt.end', () => document.body.classList.remove('hunt'));
    this.events.on('bell.start', () => document.body.classList.add('bell'));
    this.events.on('bell.end', () => document.body.classList.remove('bell'));
    this.events.on('artifact.start', () => document.body.classList.add('artifact'));
    this.events.on('artifact.end', () => {
      document.body.classList.remove('artifact');
      for (let i = 0; i < 3; i++) document.body.classList.remove(`artifact-stage-${i}`);
    });
    this.events.on('artifact.stage', p => {
      for (let i = 0; i < 3; i++) document.body.classList.toggle(`artifact-stage-${i}`, (p?.stage ?? 0) === i);
    });
    this.events.on('vote.start', p => this.showVote(p.options));
    this.events.on('vote.end', () => this.el.voteModal?.classList.add('hidden'));
  }

  showVote(options) {
    if (!this.el.voteModal) return;
    this.el.votePrompt.textContent = '3 秒内选择，观众想看这个！';
    this.el.voteOptions.innerHTML = '';
    options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.textContent = `${i + 1}. ${opt.label}`;
      btn.addEventListener('click', () => this.events.emit('vote.choose', i));
      this.el.voteOptions.appendChild(btn);
    });
    this.el.voteModal.classList.remove('hidden');
  }

  showDanmaku(text) {
    if (!this.el.danmaku || !text) return;
    const el = document.createElement('div');
    el.className = 'danmaku-item';
    el.textContent = text;
    this.el.danmaku.appendChild(el);
    while (this.el.danmaku.children.length > 4) {
      this.el.danmaku.removeChild(this.el.danmaku.firstChild);
    }
    setTimeout(() => el.remove(), 2600);
  }

  showDanmakuBurst() {
    if (!this.el.danmaku) return;
    const lines = [
      '666666', '666', '六六六！', '666 主播牛！', '6666666',
      '这处决值了！', '666666！！', '观众全体起立！', '66666', '666 满分！'
    ];
    for (let i = 0; i < 22; i++) {
      const el = document.createElement('div');
      el.className = 'danmaku-burst';
      el.textContent = lines[Math.floor(Math.random() * lines.length)];
      el.style.top = `${10 + Math.random() * 24}%`;
      el.style.animationDuration = `${0.8 + Math.random() * 1.1}s`;
      el.style.animationDelay = `${Math.random() * 0.4}s`;
      el.style.opacity = String(0.8 + Math.random() * 0.2);
      this.el.danmaku.appendChild(el);
      setTimeout(() => el.remove(), 2600);
    }
  }

  showParryHint() {
    if (!this.el.parryHint) return;
    this.el.parryHint.classList.add('show');
    clearTimeout(this._parryTimer);
    this._parryTimer = setTimeout(() => {
      this.el.parryHint.classList.remove('show');
    }, 750);
  }

  showActCard(title, line) {
    this.el.actTitle.textContent = title;
    this.el.actLine.textContent = line;
    this.el.actCard.classList.remove('hidden');
    clearTimeout(this._actCardTimer);
    this._actCardTimer = setTimeout(() => this.el.actCard.classList.add('hidden'), 2400);
  }
}
