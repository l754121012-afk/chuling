import { ITEM_DEFS } from '../config/items.js';
import { CLUE_TEXT } from './ClueSystem.js';

export class UISystem {
  constructor(game, events) {
    this.game = game;
    this.events = events;
    this.el = {};
    this._toastTimer = null;
    this._speechTimer = null;
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
      loseRows: document.getElementById('lose-rows'),
      loseTotal: document.getElementById('lose-total'),
      loseLine: document.getElementById('lose-line'),
      vignette: document.getElementById('danger-vignette'),
      warning: document.getElementById('ghost-warning'),
      warningLabel: document.getElementById('warn-label'),
      crosshair: document.getElementById('crosshair'),
      itemHint: document.getElementById('item-hint'),
      lives: document.getElementById('lives'),
      sealStatus: document.getElementById('seal-status')
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
    this.el.stamina.style.width = `${game.stamina}%`;
    if (this.el.lives) {
      this.el.lives.textContent = '♥'.repeat(game.lives) + '♡'.repeat(Math.max(0, 3 - game.lives));
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
          : '左键在脚下放置陷阱';
      this.el.itemHint.textContent = `${def.name}：${usage}`;
    }
  }

  _objectiveText(game) {
    if (game.phase === 'escape') {
      const weak = game.weakUntil > performance.now() / 1000;
      return weak
        ? `鬼虚弱了：快跑向出口！剩余 ${Math.ceil(game.escapeTimer)} 秒`
        : `它追上来了！快跑！剩余 ${Math.ceil(game.escapeTimer)} 秒`;
    }
    const hasNote = game.hasClue('note');
    const hasBoard = game.hasClue('blackboard');
    if (game.staplerBroken) return '订书机坏了：打空灵体值，或等备用订书机刷新';
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

  showPrompt(text) {
    if (!text) {
      this.el.prompt.textContent = '';
      this.el.prompt.classList.remove('show');
      return;
    }
    this.el.prompt.textContent = text;
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
    this.events.on('interact.prompt', p => this.showPrompt(p.text));
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
  }
}
