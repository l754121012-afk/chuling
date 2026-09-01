import { ITEM_DEFS } from '../config/items.js';
import { GAME_CONFIG } from '../config/game.js';
import { CLUE_TEXT } from './ClueSystem.js';

export class UISystem {
  constructor(game, events) {
    this.game = game;
    this.events = events;
    this.el = {};
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
      rageSegments: [...document.querySelectorAll('.rage-seg')],
      stageLabel: document.getElementById('stage-label'),
      battery: document.getElementById('battery-bar'),
      composureBar: document.getElementById('composure-bar'),
      dramaBar: document.getElementById('drama-bar'),
      stamina: document.getElementById('stamina-bar'),
      objective: document.getElementById('objective'),
      inventory: document.getElementById('inventory'),
      toast: document.getElementById('toast'),
      speech: document.getElementById('speech'),
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

    document.getElementById('start-btn').addEventListener('click', () => {
      this.events.emit('game.start');
    });
    for (const id of ['restart-win', 'restart-lose']) {
      document.getElementById(id).addEventListener('click', () => location.reload());
    }
    this.el.notebook.querySelector('.notebook-close').addEventListener('click', () => {
      this.toggleNotebook(false);
    });
    this.el.mute.addEventListener('click', () => {
      this.el.mute.classList.toggle('muted');
    });
    this.sync(this.game);
    this.showBest();
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
  }

  _buildInventory() {
    this.el.inventory.innerHTML = '';
    const ids = Object.keys(ITEM_DEFS);
    for (let i = 0; i < ids.length; i++) {
      const def = ITEM_DEFS[ids[i]];
      const slot = document.createElement('button');
      slot.className = 'inv-slot';
      slot.dataset.itemId = def.id;
      slot.innerHTML = `
        <span class="inv-key">${i + 1}</span>
        <span class="inv-icon">${def.icon}</span>
        <span class="inv-name">${def.name}</span>
        <span class="inv-count">0</span>
      `;
      this.el.inventory.appendChild(slot);
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
    this.el.battery.style.width = `${game.battery}%`;
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

  _objectiveText(game) {
    if (game.phase === 'escape') {
      const weak = game.weakUntil > performance.now() / 1000;
      return weak
        ? `鬼虚弱了：快跑向出口！剩余 ${Math.ceil(game.escapeTimer)} 秒`
        : `它追上来了！快跑！剩余 ${Math.ceil(game.escapeTimer)} 秒`;
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
    clearTimeout(this._toastTimer);
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this._toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), ms);
  }

  showSpeech(text, ms = 1800) {
    clearTimeout(this._speechTimer);
    this.el.speech.textContent = text;
    this.el.speech.classList.add('show');
    this._speechTimer = setTimeout(() => this.el.speech.classList.remove('show'), ms);
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
      for (const [id, clue] of Object.entries(CLUE_TEXT)) {
        const row = document.createElement('div');
        row.className = 'clue-row';
        const found = this.game.hasClue(id);
        row.innerHTML = `
          <div class="clue-title">${found ? clue.title : '？？？'}</div>
          <div class="clue-text">${found ? clue.text : '还没有找到这条线索。'}</div>
        `;
        this.el.notebookList.appendChild(row);
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
    if (ratingEl) ratingEl.textContent = `节目效果评分：${settlement.rating} · ${settlement.title}`;
    rowsEl.innerHTML = '';
    for (const row of settlement.rows) {
      const div = document.createElement('div');
      div.className = 'settle-row';
      div.innerHTML = `<span>${row.label}</span><span class="${row.amount >= 0 ? 'plus' : 'minus'}">${row.amount >= 0 ? '+' : ''}${row.amount.toLocaleString()}</span>`;
      rowsEl.appendChild(div);
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
    this.events.on('speech', p => this.showSpeech(p.text, p.ms));
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
