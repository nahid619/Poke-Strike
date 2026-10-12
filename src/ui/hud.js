import { SPIKE } from '../game/spike.js';
import { WEAPONS, PRIMARIES } from '../data/weapons.js';

const BUY_INFO = {
  rifle: 'Automatic. One-shot headshots. Right click: zoom 1.25x.',
  sniper: 'Bolt action. One-shot body shots. Right click: scope 2.5x.',
};
// In-match HUD: health, shield, ammo, weapon slots, crosshair, hit markers.
// Text is only written to the DOM when it changes.

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      root: $('hud'),
      crosshair: $('crosshair'),
      hitmarker: $('hitmarker'),
      damage: $('damage-text'),
      hp: $('hud-hp'),
      hpBar: $('hud-hp-bar'),
      shield: $('hud-shield'),
      shieldBar: $('hud-shield-bar'),
      ammo: $('hud-ammo'),
      reserve: $('hud-reserve'),
      weapon: $('hud-weapon'),
      reload: $('hud-reload'),
      reloadFill: $('hud-reload-fill'),
      slots: $('hud-slots'),
      bonus: $('hud-bonus'),
      agent: $('hud-agent'),
      agentName: $('hud-agent-name'),
      agentRole: $('hud-agent-role'),
      abilities: $('hud-abilities'),
      ab: {
        q: { root: $('ab-q'), name: $('ab-q-name'), cd: $('ab-q-cd'), fill: $('ab-q-fill'), ch: $('ab-q-ch') },
        e: { root: $('ab-e'), name: $('ab-e-name'), cd: $('ab-e-cd'), fill: $('ab-e-fill'), ch: $('ab-e-ch') },
      },
      fx: {
        smoke: $('fx-smoke'), sleep: $('fx-sleep'), stun: $('fx-stun'),
        slow: $('fx-slow'), heal: $('fx-heal'), shield: $('fx-shield'),
      },
      chips: $('status-chips'),
      mhAlly: $('mh-ally'), mhEnemy: $('mh-enemy'), mhTimer: $('mh-timer'), mhRound: $('mh-round'),
      pipsAlly: $('mh-ally-pips'), pipsEnemy: $('mh-enemy-pips'),
      banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
      feed: $('killfeed'), spectate: $('spectate'), hurt: document.querySelector('#hurt i'),
      board: $('scoreboard'),
      callouts: $('callouts'),
      mhSide: $('mh-side'), announce: $('announce'),
      buy: $('buy'), buyList: $('buy-list'), buyHint: $('buy-hint'),
      objective: $('objective'), objText: $('objective-text'), objBar: $('objective-bar'), objFill: $('objective-fill'),
    };
    this.cache = {};
  }

  _set(key, value, apply) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    apply(value);
  }

  update(player, spreadPx) {
    const e = this.el;
    this._set('hp', Math.ceil(player.health), (v) => {
      e.hp.textContent = v;
      e.hpBar.style.width = `${(v / player.maxHealth) * 100}%`;
    });
    this._set('shield', Math.ceil(player.shield), (v) => {
      e.shield.textContent = v;
      e.shieldBar.style.width = `${player.maxShield ? (v / player.maxShield) * 100 : 0}%`;
    });
    this._set('bonus', Math.ceil(player.bonusShield), (v) => {
      e.bonus.textContent = v > 0 ? `+${v}` : '';
    });
    this._updateAbilities(player);

    const L = player.loadout;
    if (L) {
      const w = L.current;
      this._set('ammo', w.ammo, (v) => {
        e.ammo.textContent = v;
        e.ammo.classList.toggle('low', v <= Math.ceil(w.def.magSize * 0.25));
      });
      this._set('reserve', L.infiniteAmmo ? '\u221e' : w.reserve, (v) => (e.reserve.textContent = v));
      this._set('weapon', w.def.name, (v) => (e.weapon.textContent = v));
      this._set('slots', L.index + ':' + L.weapons.map((x) => x.def.id).join(','), () => {
        e.slots.innerHTML = L.weapons
          .map((x, i) => `<li class="${i === L.index ? 'on' : ''}"><b>${i + 1}</b>${x.def.name}</li>`)
          .join('');
      });
      const p = L.reloading ? L.reloadProgress : -1;
      e.reload.hidden = p < 0;
      if (p >= 0) e.reloadFill.style.width = `${p * 100}%`;
    }

    // Crosshair opens up with your current spread, so movement error is visible.
    this._set('spread', Math.round(spreadPx), (v) => e.crosshair.style.setProperty('--spread', `${v}px`));
  }

  _updateAbilities(player) {
    const e = this.el;
    const kit = player.abilities;
    this._set('hasKit', !!kit, (v) => {
      e.abilities.hidden = !v;
      e.agent.hidden = !v;
    });
    if (!kit) return;
    this._set('agent', kit.agent.id, () => {
      e.agentName.textContent = kit.agent.name;
      e.agentRole.textContent = kit.agent.role;
      e.agent.style.setProperty('--agent', kit.agent.color);
    });
    for (const key of ['q', 'e']) {
      const s = kit.slots[key];
      const ui = e.ab[key];
      const full = s.def.cooldown * kit.cooldownScale;
      const state = s.marker ? 'armed' : !s.ready ? 'cooling' : !player.canUseAbilities ? 'blocked' : 'ready';
      this._set(key + 'name', s.def.name, (v) => (ui.name.textContent = v));
      this._set(key + 'state', state, (v) => (ui.root.dataset.state = v));
      const text = s.marker ? 'Press to return' : !s.ready ? String(Math.ceil(s.cooldown)) : '';
      this._set(key + 'cd', text, (v) => (ui.cd.textContent = v));
      const pct = !s.ready && full > 0 ? Math.round((s.cooldown / full) * 100) : 0;
      this._set(key + 'fill', pct, (v) => (ui.fill.style.height = `${v}%`));
      // Charges: one pip per use you can hold.
      const pips = s.max > 1 ? '\u25cf'.repeat(s.charges) + '\u25cb'.repeat(s.max - s.charges) : '';
      if (ui.ch) this._set(key + 'ch', pips, (v) => (ui.ch.textContent = v));
    }
  }

  /** The buy menu (B) and the hint that it exists. */
  buyMenu({ open, canBuy, primary, hint }) {
    const e = this.el;
    if (!e.buy) return;
    this._set('buy', `${open}|${primary}`, () => {
      e.buy.hidden = !open;
      e.buyList.innerHTML = PRIMARIES.map((id, i) => `
        <li class="${id === primary ? 'on' : ''}"><kbd>${i + 1}</kbd><b>${WEAPONS[id].name}</b><span>${BUY_INFO[id] ?? ''}</span></li>`).join('');
    });
    this._set('buyHint', !!(hint && canBuy && !open), (v) => (e.buyHint.hidden = !v));
  }

  /** Full-screen feedback for what is happening to you. */
  statusEffects(flags) {
    const e = this.el;
    for (const [name, el] of Object.entries(e.fx)) {
      this._set('fx-' + name, !!flags[name], (v) => (el.hidden = !v));
    }
    const chips = [];
    if (flags.stun) chips.push('Stunned');
    if (flags.sleep) chips.push('Asleep');
    if (flags.slow) chips.push('Slowed');
    if (flags.heal) chips.push('Healing');
    if (flags.revealed) chips.push('Revealed');
    if (flags.blind) chips.push('Blinded');
    this._set('chips', chips.join('|'), () => {
      e.chips.innerHTML = chips.map((c) => `<li>${c}</li>`).join('');
    });
  }

  // ---------------------------------------------------------------- match

  updateMatch(m) {
    const e = this.el;
    this._set('mhAlly', m.score.ally, (v) => (e.mhAlly.textContent = v));
    this._set('mhEnemy', m.score.enemy, (v) => (e.mhEnemy.textContent = v));
    const spike = m.spikeMode ? m.spike : null;
    const fuse = spike?.planted && !spike.defused && !spike.detonated;
    const secs = m.phase === 'end' || m.phase === 'over' ? 0 : Math.max(0, Math.ceil(fuse ? spike.fuseLeft : m.timer));
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    this._set('mhTimer', time + fuse, (v) => {
      e.mhTimer.textContent = time;
      e.mhTimer.classList.toggle('spike', !!fuse);
    });
    const side = spike ? (m.sideOf(m.controlled.team) === 'attack' ? 'Attacking' : 'Defending') : '';
    this._set('mhSide', side, (v) => (e.mhSide.textContent = v));
    this._updateObjective(m);
    this._set('mhRound', m.round, (v) => (e.mhRound.textContent = `Round ${v}`));
    const pips = (team) => m.team(team).map((c) => (c.alive ? 'up' : 'down')).join(',');
    this._set('pipsAlly', pips('ally'), (v) => (e.pipsAlly.innerHTML = v.split(',').map((k) => `<li class="${k}"></li>`).join('')));
    this._set('pipsEnemy', pips('enemy'), (v) => (e.pipsEnemy.innerHTML = v.split(',').map((k) => `<li class="${k}"></li>`).join('')));

    // Round banner
    let title = '';
    let sub = '';
    let kind = '';
    if (m.phase === 'buy') {
      title = `Round ${m.round}`;
      sub = `${m.round === 1 ? `${m.map.name}. ` : ''}Starts in ${Math.max(1, Math.ceil(m.timer))}`;
    } else if (m.phase === 'end' || m.phase === 'over') {
      const r = m.lastRound;
      kind = r.winner === 'ally' ? 'won' : r.winner === 'enemy' ? 'lost' : 'draw';
      title = kind === 'won' ? 'Round won' : kind === 'lost' ? 'Round lost' : 'Round drawn';
      const reasons = {
        detonated: 'The spike detonated',
        defused: 'The spike was defused',
        time: m.spikeMode ? 'Time ran out before the spike was planted'
          : kind === 'draw' ? 'Time ran out with equal players alive' : 'Time ran out: more players left standing',
        elimination: kind === 'won' ? 'Enemy team eliminated'
          : kind === 'lost' ? 'Your team was eliminated'
          : 'Both teams were eliminated',
      };
      sub = reasons[r.reason] ?? '';
      if (r.halftime) sub += '. Halftime: switching sides';
    }
    this._set('banner', `${title}|${sub}|${kind}`, () => {
      e.banner.hidden = !title;
      e.bannerTitle.textContent = title;
      e.bannerSub.textContent = sub;
      e.banner.dataset.kind = kind;
    });

    // Death cam, takeover, and spectating
    const view = m.viewTarget();
    const me = m.controlled;
    let spec = '';
    if (!me.alive && m.phase === 'live') {
      // Both teams can field the same agent, so say whose side each one is on.
      const killer = m.killedBy;
      const killed = killer ? `Killed by ${killer.team === me.team ? 'teammate' : 'enemy'} ${killer.name}. ` : '';
      const t = m.takeover;
      if (t?.phase === 'deathcam') spec = `${killed}Taking over teammate ${t.candidate.name}. Click to pick another.`;
      else if (t?.phase === 'glide') spec = `Taking over teammate ${t.candidate.name}`;
      else if (view === me) spec = m.killedBy ? `Killed by ${m.killedBy.name}` : 'You died';
      else spec = `Spectating ${view.name}. Click to switch.`;
    }
    this._set('spectate', spec, (v) => {
      e.spectate.hidden = !v;
      e.spectate.textContent = v;
    });
  }

  /** Bottom-center prompt for the spike, with a progress bar while planting or defusing. */
  _updateObjective(m) {
    const e = this.el;
    let text = '';
    let progress = -1;
    let defuse = false;
    const spike = m.spike;
    const v = m.controlled;
    if (m.spikeMode && m.phase === 'live' && v.alive) {
      const attacking = v.team === spike.attackers;
      if (spike.planter === v) {
        text = 'Planting';
        progress = spike.plantProgress / SPIKE.plantTime;
      } else if (spike.defuser === v) {
        text = 'Defusing';
        progress = spike.defuseProgress / SPIKE.defuseTime;
        defuse = true;
      } else if (attacking && v.frozen) {
        text = `Barrier drops in ${Math.max(1, Math.ceil(SPIKE.attackerBarrier - m.liveTime))}`;
      } else if (spike.carrier === v) {
        text = spike.siteAt(v.pos) ? 'Hold F to plant the spike' : 'You have the spike. Plant it on site A or B.';
      } else if (!attacking && spike.planted && spike.canDefuseFrom(v)) {
        text = spike.defuseCheckpoint > 0 ? 'Hold F to defuse (half done)' : 'Hold F to defuse';
      } else if (attacking && spike.dropped) {
        text = 'The spike was dropped. Walk over it to pick it up.';
      }
    }
    this._set('objText', text, (t) => {
      e.objective.hidden = !t;
      e.objText.textContent = t;
    });
    this._set('objBar', progress >= 0 ? (defuse ? 'd' : 'p') : '', (k) => {
      e.objBar.hidden = !k;
      e.objBar.classList.toggle('defuse', k === 'd');
    });
    if (progress >= 0) e.objFill.style.width = `${Math.min(1, progress) * 100}%`;
  }

  /** A short message under the score, e.g. "Spike planted on site A". */
  announce(text, kind = '') {
    const a = this.el.announce;
    a.textContent = text;
    a.className = kind;
    a.getAnimations().forEach((x) => x.cancel());
    a.animate([{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 3200 });
  }

  feed({ you, killer, victim, how, headshot }, player) {
    const li = document.createElement('li');
    const mine = (c) => c && (c === you || c === player);
    if (mine(killer) || mine(victim)) li.className = 'you';
    const label = (c) => (c === player ? 'You' : c === you ? `You (${c.name})` : c.name);
    const name = (c) => `<b class="${c.team}">${label(c)}</b>`;
    li.innerHTML = `${killer ? name(killer) : ''}<span class="how">${how}</span>${headshot ? '<span class="hs">headshot</span>' : ''}${name(victim)}`;
    this.el.feed.prepend(li);
    while (this.el.feed.children.length > 6) this.el.feed.lastChild.remove();
    setTimeout(() => li.remove(), 6000);
  }

  clearFeed() {
    this.el.feed.innerHTML = '';
    this.el.callouts.innerHTML = '';
  }

  /** A teammate's callout, like "Gengar: enemy in mid". */
  callout(name, text) {
    const li = document.createElement('li');
    li.innerHTML = `<b>${name}</b> ${text}`;
    this.el.callouts.prepend(li);
    while (this.el.callouts.children.length > 3) this.el.callouts.lastChild.remove();
    setTimeout(() => li.remove(), 4500);
  }

  hurt(angle) {
    const i = this.el.hurt;
    i.style.transform = `rotate(${-angle}rad)`;
    i.getAnimations().forEach((a) => a.cancel());
    i.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1100, easing: 'ease-in' });
  }

  scoreboard(show, m) {
    const e = this.el;
    this._set('boardShown', show, (v) => (e.board.hidden = !v));
    if (!show) return;
    const key = ['ally', 'enemy'].map((t) => m.team(t).map((c) => {
      const s = m.stats.get(c);
      return `${c.name}${c.alive}${s.kills}${s.deaths}${s.assists}${s.damage}${c === m.controlled}`;
    }).join()).join('|');
    this._set('board', key + m.score.ally + m.score.enemy, () => {
      e.board.innerHTML = `<h3>Your team ${m.score.ally}, enemy ${m.score.enemy}</h3>${scoreboardTables(m)}`;
    });
  }

  hitMarker(part, killed) {
    const m = this.el.hitmarker;
    m.dataset.kind = killed ? 'kill' : part === 'head' ? 'head' : 'body';
    m.getAnimations().forEach((a) => a.cancel());
    m.animate(
      [
        { opacity: 1, transform: 'translate(-50%, -50%) scale(0.85)' },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: 0.3 },
        { opacity: 0, transform: 'translate(-50%, -50%) scale(1.15)' },
      ],
      { duration: killed ? 380 : 240, easing: 'ease-out' }
    );
  }

  damageNumber(damage, part) {
    const d = this.el.damage;
    d.textContent = part === 'head' ? `${damage} headshot` : `${damage}`;
    d.dataset.kind = part;
    d.getAnimations().forEach((a) => a.cancel());
    d.animate(
      [
        { opacity: 1, transform: 'translate(-50%, 0)' },
        { opacity: 1, transform: 'translate(-50%, -6px)', offset: 0.6 },
        { opacity: 0, transform: 'translate(-50%, -12px)' },
      ],
      { duration: 700, easing: 'ease-out' }
    );
  }
}

/** Both teams' tables: name, kills, deaths, assists, damage. Used in-match and at the end. */
export function scoreboardTables(m, { showAlive = true } = {}) {
  const rows = (team) => m.team(team)
    .map((c) => ({ c, s: m.stats.get(c) }))
    .sort((a, b) => b.s.kills - a.s.kills || a.s.deaths - b.s.deaths || b.s.damage - a.s.damage);
  const label = (c) => (c === m.player ? 'You' : c === m.controlled ? `${c.name} (you)` : c.name)
    + (m.spikeMode && m.spike?.carrier === c ? ' (spike)' : '');
  const sub = (c) => (c === m.player ? c.agent?.name ?? '' : c.agent?.role ?? '');
  const table = (team, title) => `
    <table class="${team}">
      <tr><th>${title}</th><th>Kills</th><th>Deaths</th><th>Assists</th><th>Damage</th></tr>
      ${rows(team).map(({ c, s }) => `
        <tr class="${showAlive && !c.alive ? 'dead' : ''} ${c === m.player || c === m.controlled ? 'you' : ''}">
          <td>${label(c)}<small>${sub(c)}</small></td>
          <td>${s.kills}</td><td>${s.deaths}</td><td>${s.assists}</td><td>${s.damage}</td>
        </tr>`).join('')}
    </table>`;
  return table('ally', 'Your team') + table('enemy', 'Enemy team');
}
