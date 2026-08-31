import { distance2D, nowSec } from '../core/Utils.js';

export class ChainDirector {
  constructor({ scene, events, game, ghost, items, audio }) {
    this.scene = scene;
    this.events = events;
    this.game = game;
    this.ghost = ghost;
    this.items = items;
    this.audio = audio;
    this._active = false;
    this._step = 'idle';
    this._trapZone = null;
    this._lureTimer = 0;
    this._dragTimer = 0;
    this._finalCardTimer = null;
    events.on('escape.start', p => this._onEscape(p));
    events.on('game.lost', () => this._deactivate());
  }

  reset() {
    if (this._finalCardTimer) clearTimeout(this._finalCardTimer);
    this._finalCardTimer = null;
    this._deactivate();
  }

  update(dt) {
    if (!this.game.isPlaying() || this.game.phase !== 'investigate') {
      this._hideMarkers();
      return;
    }
    this._tryStart();
    this._refreshMarkers();
    if (!this._active) return;

    if (this.game.chainPinned) {
      this._step = 'seal';
      this.game.chainStep = 'seal';
      return;
    }

    if (this._step === 'place') {
      if (!this.game.hasItem('tape')) return;
      const zone = this.items.zones.find(z => z.type === 'trap');
      if (!zone) return;
      const spot = this._chainSpot();
      const d = distance2D(zone.pos.x, zone.pos.z, spot.x, spot.z);
      if (d > 2.2) {
        this._returnBadTrap(zone);
        return;
      }
      this._step = 'lure';
      this._trapZone = zone;
      this.game.chainStep = 'lure';
      this.audio?.play('click');
      this.events.emit('act.card', {
        title: '连锁第一环 · 黏住它',
        line: '修正带就位！用 G 抽它赶过去，或者等它自己踩上来。'
      });
      this.events.emit('toast', { text: '修正带陷阱就位！鬼马上就要倒霉了！', ms: 2200 });
      return;
    }

    if (this._step === 'lure') {
      const zone = this._trapZone && this.items.zones.includes(this._trapZone)
        ? this._trapZone
        : this.items.zones.find(z => z.type === 'trap');
      if (!zone) {
        this._step = 'place';
        this.game.chainStep = 'place';
        this._trapZone = null;
        return;
      }
      this._trapZone = zone;
      if (zone.used) {
        this._step = 'shelf';
        this.game.chainStep = 'shelf';
        this.game.chainStuck = true;
        this.events.emit('hitstop', { ms: 100 });
        this.events.emit('camera.shake', { amount: 0.4 });
        this.events.emit('act.card', {
          title: '连锁第二环 · 黏住了！！',
          line: '它被修正带钉在地上！快推倒书架砸它！'
        });
        this.ghost._speak('这是什么？！', 1800);
        this.audio?.play('splat');
        return;
      }
      this._lureTimer -= dt;
      if (this._lureTimer <= 0) {
        this._lureTimer = 0.4;
        this.ghost._lastNoise = { x: zone.pos.x, z: zone.pos.z };
      }
      return;
    }

    if (this._step === 'shelf') {
      if (this.game.chainPinned) {
        this._step = 'seal';
        this.game.chainStep = 'seal';
        this.events.emit('act.card', {
          title: '连锁第三环 · 压扁了！！',
          line: '书架成功砸脸！现在拿出订书机封印！'
        });
        return;
      }
      const bookshelf = this._bookshelf();
      if (bookshelf && this._dragTimer <= 0) {
        const gp = this.ghost.getPos();
        const bp = { x: bookshelf.body.position.x, z: bookshelf.body.position.z };
        const gd = Math.hypot(gp.x - bp.x, gp.z - bp.z);
        if (gd > 3.6) {
          this._dragTimer = 1.0;
          const spot = this._chainSpot();
          this.ghost.pawn.body.position.set(spot.x, 1.2, spot.z);
          this.ghost.pawn.body.velocity.set(0, 0, 0);
          this.audio?.play('slap');
          this.events.emit('toast', { text: '它把整块修正带都拖到书架边了！！', ms: 2000 });
          this.ghost._speak('扯不掉！这东西扯不掉！！', 2000);
        }
      } else if (this._dragTimer > 0) {
        this._dragTimer -= dt;
      }
    }
  }

  _tryStart() {
    if (this._active || this.game.chainTutorialDone) return;
    if (!this.game.isPlaying() || this.game.phase !== 'investigate') return;
    if (!this.game.firstScareDone) return;
    if (!this.game.hasClue('note')) return;
    if (!this.game.hasItem('stapler')) return;
    if (this.ghost._isPinned()) return;
    if (this._bookshelf()?.used) return;
    this._active = true;
    this._step = 'place';
    this.game.chainActive = true;
    this.game.chainStep = 'place';
    this.audio?.play('phone');
    this.events.emit('act.card', {
      title: '连锁教学 · 只演一次',
      line: '主管：修正带+书架+订书机。百元店进货价都比你工资高。'
    });
    this.events.emit('toast', {
      text: '主管来电：把修正带画进黄色圈里，给鬼上一课！',
      ms: 3200
    });
  }

  _returnBadTrap(zone) {
    const idx = this.items.zones.indexOf(zone);
    if (idx >= 0) this.items.zones.splice(idx, 1);
    if (zone.mesh) this.scene.group.remove(zone.mesh);
    this.game.addItem('tape', 1);
    this.audio?.play('paper');
    this.events.emit('toast', {
      text: '修正带画到十万八千里外了！主管：拿回来重画！',
      ms: 2400
    });
  }

  _onEscape(p) {
    if (!this._active) return;
    if (this.game.chainPinned && p?.reason === 'sealed') {
      this.game.chainTutorialDone = true;
      this._step = 'done';
      this.game.chainStep = 'done';
      this.audio?.play('win');
      if (this._finalCardTimer) clearTimeout(this._finalCardTimer);
      this._finalCardTimer = setTimeout(() => {
        this.events.emit('act.card', {
          title: '教科书级连锁完成！',
          line: '主管：你这辈子最有价值的一分钟，工资照扣。'
        });
      }, 900);
    }
    this._deactivate();
  }

  _deactivate() {
    this._active = false;
    this.game.chainActive = false;
    this.game.chainStuck = false;
    this.game.chainPinned = false;
    this._step = 'idle';
    this._trapZone = null;
    this._lureTimer = 0;
    this._dragTimer = 0;
    this._hideMarkers();
  }

  _refreshMarkers() {
    const spot = this.scene.refs?.chainSpot;
    const shelf = this.scene.refs?.chainShelfMarker;
    if (spot) {
      spot.mesh.visible = this._active && this._step === 'place';
      if (spot.mesh.visible) {
        const t = nowSec() * 3;
        spot.mesh.scale.setScalar(1 + Math.sin(t) * 0.08);
        spot.mesh.material.opacity = 0.55 + Math.sin(t * 2) * 0.25;
      }
    }
    if (shelf) {
      shelf.mesh.visible = this._active && (this._step === 'shelf' || this._step === 'seal');
      if (shelf.mesh.visible) {
        const bs = this._bookshelf();
        if (bs) shelf.mesh.position.set(bs.body.position.x, 0.06, bs.body.position.z);
        const t = nowSec() * 3.2;
        shelf.mesh.scale.setScalar(1 + Math.sin(t) * 0.1);
        shelf.mesh.material.color.setHex(this._step === 'seal' ? 0x4caf50 : 0xf4a261);
        shelf.mesh.material.opacity = 0.6 + Math.sin(t * 2) * 0.25;
      }
    }
  }

  _hideMarkers() {
    const spot = this.scene.refs?.chainSpot;
    const shelf = this.scene.refs?.chainShelfMarker;
    if (spot) spot.mesh.visible = false;
    if (shelf) shelf.mesh.visible = false;
  }

  _bookshelf() {
    return this.scene.refs?.props?.find(p => p.type === 'bookshelf') || null;
  }

  _chainSpot() {
    return this.scene.refs?.chainSpot || { x: 0, z: 0, r: 1 };
  }
}
