// Every screen outside of play: title, agent select, aim trainer setup,
// pause, settings, controls, drill results, and match end.
//
// Flow
//   title -> agent select -> match       -> (pause) -> match end -> title
//   title -> agent select -> test range  -> (pause)
//   title -> trainer setup -> drill      -> (pause) -> results
//   title or pause -> settings / controls -> back where you came from
import { saveSettings, resetSettings, CROSSHAIR_COLORS, CROSSHAIR_PRESETS, exportSettingsCode, importSettingsCode } from '../core/settings.js';
import { WEAPONS } from '../data/weapons.js';
import { load, save } from '../core/storage.js';
import { AGENTS, agentById } from '../data/agents.js';
import { DRILLS, bestScores, bestKey } from '../modes/aimtrainer.js';
import { currentRank, matchHistory } from '../game/history.js';
import { balancedTeam } from '../modes/match.js';
import { MAPS, mapById, randomMap } from '../data/maps/index.js';
import { scoreboardTables } from './hud.js';

const $ = (id) => document.getElementById(id);

export function createMenus(app) {
  const { settings, sound, hud, input } = app;

  // Where "Back" (and Esc) goes from each screen.
  const back = { agents: 'menu', trainer: 'menu', settings: 'menu', controls: 'menu' };

  function open(card, from) {
    if (from) back[card] = from;
    app.setState(card);
  }

  function goBack() {
    const to = back[app.state];
    if (to) app.setState(to);
  }

  function goToMenu() {
    const m = app.getMatch();
    m.showcase(); // empty map for the background
    app.useSession(m);
    app.setState('menu');
  }

  // Esc steps back through menus (in play, the browser uses Esc to release the mouse).
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || app.state === 'playing') return;
    if (back[app.state]) goBack();
  });

  // ------------------------------------------------------------ title

  $('btn-match').addEventListener('click', () => openAgentPicker('menu', 'match'));
  $('btn-range').addEventListener('click', () => openAgentPicker('menu', 'range'));
  $('btn-trainer').addEventListener('click', () => {
    renderDrillPicker();
    open('trainer', 'menu');
  });
  $('btn-settings').addEventListener('click', () => openSettings('menu'));
  $('btn-controls').addEventListener('click', () => open('controls', 'menu'));

  // ------------------------------------------------------------ agent select

  let agentChoice = load('agent', AGENTS[0].id);
  let agentTarget = 'range';
  let team = null; // previewed match teammates, used when the match starts
  const matchOptions = { roundsToWin: 7, difficulty: 'medium', map: 'random', mode: 'spike', ...load('matchOptions', {}) };
  const agentCard = $('card-agents');

  function openAgentPicker(from, target) {
    agentTarget = target;
    agentCard.dataset.target = target;
    if (target === 'range') agentChoice = app.getRange().player.agent?.id ?? agentChoice;
    team = null;
    renderAgentPicker();
    open('agents', from);
  }

  function renderAgentPicker() {
    $('agent-grid').innerHTML = AGENTS.map((a) => `
      <button type="button" class="agent" role="radio" data-agent="${a.id}"
        aria-checked="${a.id === agentChoice}" style="--agent:${a.color}">
        <span class="dot"></span><span><strong>${a.name}</strong><small>${a.role}</small></span>
      </button>`).join('');
    const a = agentById(agentChoice);
    const ability = (key) => {
      const x = a.abilities[key];
      const meta = x.ult ? `${x.ult} ultimate points: kills, deaths, plants, defuses, and orbs` : `Cooldown ${x.cooldown} s${x.charges > 1 ? ` \u00b7 ${x.charges} charges` : ''}`;
      return `<div class="ability${x.ult ? ' ult' : ''}" style="--agent:${a.color}"><b><kbd>${key.toUpperCase()}</kbd>${x.name}</b>${x.about.replace(/^Ultimate\. /, '')}<span class="meta">${meta}</span></div>`;
    };
    $('agent-detail').innerHTML = ability('q') + ability('e') + (a.abilities.x ? ability('x') : '');
    $('btn-agent-play').textContent = agentTarget === 'match' ? `Play as ${a.name}` : `Go to the test range as ${a.name}`;

    if (agentTarget === 'match') {
      // Re-pick teammates only when your agent changes, so the preview is what you get.
      if (!team || team[0] !== a) team = balancedTeam(5, [a]);
      $('team-preview').innerHTML = team.map((t, i) => `
        <li class="${i === 0 ? 'you' : ''}" style="--agent:${t.color}">
          <i></i>${i === 0 ? 'You' : t.name}<small>${t.role}</small>
        </li>`).join('');
      renderMatchOptions();
    }
  }

  function renderMatchOptions() {
    for (const b of document.querySelectorAll('[data-rounds]')) {
      b.setAttribute('aria-checked', String(Number(b.dataset.rounds) === matchOptions.roundsToWin));
    }
    for (const b of document.querySelectorAll('[data-difficulty]')) {
      b.setAttribute('aria-checked', String(b.dataset.difficulty === matchOptions.difficulty));
    }
    for (const b of document.querySelectorAll('[data-map]')) {
      b.setAttribute('aria-checked', String(b.dataset.map === matchOptions.map));
    }
    for (const b of document.querySelectorAll('[data-mode-choice]')) {
      b.setAttribute('aria-checked', String(b.dataset.modeChoice === matchOptions.mode));
    }
    $('mode-about').textContent = {
      spike: 'Attack or defend a site with the spike. Sides swap at halftime.',
      elimination: 'Win a round by eliminating the other team.',
      deathmatch: `Respawn 3 s after dying. First team to ${({ 3: 25, 5: 40, 7: 50 })[matchOptions.roundsToWin] ?? 40} kills wins ("First to" sets the target). Guns are free.`,
    }[matchOptions.mode] ?? '';
    $('map-about').textContent = matchOptions.map === 'random'
      ? 'A different map each match.'
      : mapById(matchOptions.map).about;
  }

  // Map picker buttons
  $('map-list').innerHTML = [...MAPS.map((m) => [m.id, m.name]), ['random', 'Random']]
    .map(([id, name]) => `<button type="button" role="radio" data-map="${id}">${name}</button>`).join('');
  for (const b of document.querySelectorAll('[data-map]')) {
    b.addEventListener('click', () => {
      matchOptions.map = b.dataset.map;
      save('matchOptions', matchOptions);
      renderMatchOptions();
    });
  }

  for (const b of document.querySelectorAll('[data-rounds]')) {
    b.addEventListener('click', () => {
      matchOptions.roundsToWin = Number(b.dataset.rounds);
      save('matchOptions', matchOptions);
      renderMatchOptions();
    });
  }
  for (const b of document.querySelectorAll('[data-mode-choice]')) {
    b.addEventListener('click', () => {
      matchOptions.mode = b.dataset.modeChoice;
      save('matchOptions', matchOptions);
      renderMatchOptions();
    });
  }
  for (const b of document.querySelectorAll('[data-difficulty]')) {
    b.addEventListener('click', () => {
      matchOptions.difficulty = b.dataset.difficulty;
      save('matchOptions', matchOptions);
      renderMatchOptions();
    });
  }

  $('agent-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-agent]');
    if (!btn) return;
    agentChoice = btn.dataset.agent;
    renderAgentPicker();
  });

  $('btn-agent-play').addEventListener('click', () => {
    save('agent', agentChoice);
    if (agentTarget === 'match') return startMatch();
    const r = app.getRange();
    if (r.player.agent?.id !== agentChoice) r.setAgent(agentById(agentChoice));
    app.useSession(r);
    app.play();
  });
  $('btn-agent-back').addEventListener('click', goBack);

  function startMatch() {
    const mapId = matchOptions.map === 'random' ? randomMap().id : matchOptions.map;
    const m = app.getMatch(mapId);
    const agent = agentById(agentChoice);
    hud.clearFeed();
    app.useSession(m);
    m.start({
      agent,
      allies: (team && team[0] === agent ? team : balancedTeam(5, [agent])).slice(1),
      roundsToWin: matchOptions.roundsToWin,
      difficulty: matchOptions.difficulty,
      takeover: settings.takeover,
      botMode: settings.botMode,
      mode: matchOptions.mode,
    });
    app.play();
  }

  // ------------------------------------------------------------ aim trainer

  const drill = { drill: 'static', weapon: 'rifle', ...load('trainerChoice', {}) };

  function renderDrillPicker() {
    const bests = bestScores();
    $('drill-list').innerHTML = DRILLS.map((d) => {
      const best = bests[bestKey(d.id, drill.weapon)];
      const bestText = best
        ? `Best with ${drill.weapon}: <b>${best.score}</b>, ${Math.round(best.accuracy * 100)}% accuracy`
        : 'No score yet';
      return `<button type="button" class="drill" role="radio" data-drill="${d.id}"
        aria-checked="${d.id === drill.drill}">
        <strong>${d.name}</strong><span class="about">${d.about}</span><span class="best">${bestText}</span>
      </button>`;
    }).join('');
    for (const b of document.querySelectorAll('[data-weapon]')) {
      b.setAttribute('aria-checked', String(b.dataset.weapon === drill.weapon));
    }
  }

  $('drill-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-drill]');
    if (!btn) return;
    drill.drill = btn.dataset.drill;
    save('trainerChoice', drill);
    renderDrillPicker();
  });
  for (const b of document.querySelectorAll('[data-weapon]')) {
    b.addEventListener('click', () => {
      drill.weapon = b.dataset.weapon;
      save('trainerChoice', drill);
      renderDrillPicker();
    });
  }

  function startDrill() {
    const t = app.getTrainer();
    app.useSession(t);
    t.begin(drill.drill, drill.weapon);
    app.play();
  }
  $('btn-start-drill').addEventListener('click', startDrill);
  $('btn-trainer-back').addEventListener('click', goBack);

  // ------------------------------------------------------------ pause

  $('btn-resume').addEventListener('click', app.play);
  $('btn-pause-settings').addEventListener('click', () => openSettings('paused'));
  $('btn-pause-controls').addEventListener('click', () => open('controls', 'paused'));
  $('btn-respawn').addEventListener('click', () => {
    app.session.respawnPlayer();
    app.play();
  });
  $('btn-restart').addEventListener('click', startDrill);
  $('btn-change-agent').addEventListener('click', () => openAgentPicker('paused', 'range'));
  $('btn-pause-menu').addEventListener('click', goToMenu);
  for (const b of document.querySelectorAll('[data-selftest]')) {
    b.addEventListener('click', () => {
      const type = b.dataset.selftest;
      app.session.player.applyStatus(type, type === 'sleep' ? 3 : 2.5);
      app.play();
    });
  }

  // ------------------------------------------------------------ settings

  function openSettings(from) {
    syncSettingsUI();
    open('settings', from);
  }
  $('btn-settings-done').addEventListener('click', goBack);
  $('btn-settings-reset').addEventListener('click', () => {
    resetSettings();
    applyAll();
    syncSettingsUI();
  });

  // Color swatches
  $('xh-colors').innerHTML = CROSSHAIR_COLORS.map((c) => `
    <button type="button" role="radio" data-choice="crosshairColor" data-value="${c}"
      style="--swatch:${c}" aria-label="Color ${c}"></button>`).join('');

  const formats = {
    sensitivity: (v) => v.toFixed(2),
    scopedSensitivity: (v) => v.toFixed(2),
    crosshairDotSize: (v) => `${v}px`,
    crosshairOpacity: (v) => `${Math.round(v * 100)}%`,
    fov: (v) => `${v}\u00b0`,
    volume: (v) => `${Math.round(v * 100)}%`,
    crosshairLength: (v) => `${v}px`,
    crosshairThickness: (v) => `${v}px`,
    crosshairGap: (v) => `${v}px`,
  };
  const parse = (v) => (v === 'true' ? true : v === 'false' ? false : Number.isNaN(Number(v)) ? v : Number(v));

  function syncSettingsUI() {
    for (const el of document.querySelectorAll('input[data-setting]')) {
      const v = settings[el.dataset.setting];
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v;
    }
    for (const el of document.querySelectorAll('output[data-out]')) {
      const key = el.dataset.out;
      el.textContent = formats[key] ? formats[key](Number(settings[key])) : settings[key];
    }
    for (const el of document.querySelectorAll('[data-choice]')) {
      el.setAttribute('aria-checked', String(String(settings[el.dataset.choice]) === el.dataset.value));
    }
  }

  function changed(key) {
    saveSettings();
    syncSettingsUI();
    if (key === 'fov') app.applyFov();
    if (key === 'quality') app.applyQuality();
    if (key === 'volume') sound.setVolume(settings.volume);
    if (key.startsWith('crosshair')) applyCrosshair();
    if (key === 'fastCooldowns') app.getRange().applyCooldownSetting();
    if (key === 'takeover') {
      const m = app.getMatch();
      if (m.options) m.options.takeover = settings.takeover;
    }
  }

  for (const el of document.querySelectorAll('input[data-setting]')) {
    el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
      const key = el.dataset.setting;
      settings[key] = el.type === 'checkbox' ? el.checked : Number(el.value);
      changed(key);
    });
  }
  // Crosshair presets set several values at once.
  for (const b of document.querySelectorAll('[data-preset]')) {
    b.addEventListener('click', () => {
      Object.assign(settings, CROSSHAIR_PRESETS[b.dataset.preset] ?? {});
      changed('crosshairStyle');
    });
  }
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-choice]');
    if (!el) return;
    settings[el.dataset.choice] = parse(el.dataset.value);
    changed(el.dataset.choice);
  });

  function applyCrosshair() {
    for (const el of [$('crosshair'), $('xh-preview')]) {
      el.style.setProperty('--color', settings.crosshairColor);
      el.style.setProperty('--len', `${settings.crosshairLength}px`);
      el.style.setProperty('--thick', `${settings.crosshairThickness}px`);
      el.style.setProperty('--gap', `${settings.crosshairGap}px`);
      el.style.setProperty('--dot', `${settings.crosshairDotSize}px`);
      el.style.setProperty('--alpha', String(settings.crosshairOpacity));
      el.classList.toggle('no-outline', !settings.crosshairOutline);
      el.classList.remove('style-cross', 'style-dot', 'style-both', 'style-circle');
      el.classList.add(`style-${settings.crosshairStyle}`);
    }
  }

  function applyAll() {
    app.applyFov();
    app.applyQuality();
    sound.setVolume(settings.volume);
    applyCrosshair();
    app.getRange().applyCooldownSetting();
  }

  syncSettingsUI();
  applyCrosshair();

  // Settings codes (move settings to another browser)
  const codeInput = $('settings-code');
  const codeStatus = $('code-status');
  const status = (text, kind) => {
    codeStatus.textContent = text;
    codeStatus.className = `hint ${kind}`;
  };
  $('btn-code-copy').addEventListener('click', async () => {
    const code = exportSettingsCode();
    codeInput.value = code;
    try {
      await navigator.clipboard.writeText(code);
      status('Copied. Paste it into Settings on your other browser.', 'ok');
    } catch {
      codeInput.select();
      status('Your browser blocked copying. The code is selected above: press Ctrl+C.', 'ok');
    }
  });
  $('btn-code-apply').addEventListener('click', () => {
    try {
      const n = importSettingsCode(codeInput.value);
      applyAll();
      syncSettingsUI();
      status(`Done. ${n} settings applied.`, 'ok');
    } catch (err) {
      status(err.message, 'bad');
    }
  });

  // Phones and tablets: explain that a keyboard and mouse are needed.
  if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) $('touch-note').hidden = false;

  // ------------------------------------------------------------ controls

  $('btn-controls-back').addEventListener('click', goBack);

  // ------------------------------------------------------------ drill results

  function showDrillResults() {
    app.setState('results'); // first, so releasing the mouse doesn't count as a pause
    input.unlock();
    const r = app.getTrainer().result;
    const pct = (x) => `${Math.round(x * 100)}%`;
    $('r-title').textContent = `${r.drill.name} drill`;
    $('r-weapon').textContent = WEAPONS[r.weaponId]?.name ?? 'Rifle';
    $('r-score').textContent = r.score;
    const best = $('r-best');
    best.className = r.isBest ? 'new' : '';
    best.textContent = r.isBest
      ? r.previousBest === null ? 'First score' : `New best (was ${r.previousBest})`
      : `Best ${r.previousBest}`;
    $('r-hits').textContent = `${r.hits} of ${r.shots} shots`;
    $('r-acc').textContent = pct(r.accuracy);
    $('r-heads').textContent = r.headRate === null ? 'n/a' : pct(r.headRate);
    const hasReaction = r.avgReaction !== null;
    $('r-react-label').hidden = !hasReaction;
    $('r-react').hidden = !hasReaction;
    if (hasReaction) $('r-react').textContent = `${Math.round(r.avgReaction * 1000)} ms`;
  }
  $('btn-again').addEventListener('click', startDrill);
  $('btn-drills').addEventListener('click', () => {
    renderDrillPicker();
    open('trainer', 'menu');
  });
  $('btn-results-menu').addEventListener('click', goToMenu);

  // ------------------------------------------------------------ match end

  // ------------------------------------------------------------ rank and history

  const MODE_NAMES = { spike: 'Plant and defuse', elimination: 'Elimination', deathmatch: 'Team deathmatch' };
  const rankText = (r) => (r.of ? `${r.name}, ${r.into} / ${r.of} RR` : `${r.name}, ${r.into} RR`);
  function renderRankBadge() {
    const r = currentRank();
    $('rank-badge').textContent = matchHistory().length ? `Rank: ${rankText(r)}` : 'Rank: play a match to get one';
  }
  renderRankBadge();
  function showHistory() {
    app.setState('history');
    $('history-rank').textContent = `Your rank: ${rankText(currentRank())}`;
    const list = matchHistory();
    $('history-list').innerHTML = list.length ? list.map((h) => {
      const result = h.draw ? 'Draw' : h.won ? 'Victory' : 'Defeat';
      const rr = `${h.rrChange >= 0 ? '+' : ''}${h.rrChange} RR`;
      const when = new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return `<li class="${h.draw ? 'draw' : h.won ? 'won' : 'lost'}"><b>${result}</b><span>${h.us} to ${h.them}</span>
        <span>${h.map}, ${MODE_NAMES[h.mode] ?? h.mode}, ${h.difficulty}</span><span>${h.agent}: ${h.kills} / ${h.deaths} / ${h.assists}</span>
        <em>${rr}</em><small>${when}</small></li>`;
    }).join('') : '<li class="empty">No matches yet. Play one and it shows up here.</li>';
  }
  $('btn-history').addEventListener('click', showHistory);
  $('btn-history-back').addEventListener('click', goToMenu);

  function showMatchEnd() {
    app.setState('matchEnd');
    input.unlock();
    const m = app.getMatch();
    const won = m.score.ally > m.score.enemy;
    const draw = m.score.ally === m.score.enemy;
    const you = m.you;
    $('me-title').textContent = draw ? 'Draw' : won ? 'Victory' : 'Defeat';
    const rec = m.lastRecord;
    $('me-rank').textContent = rec ? `${rec.rrChange >= 0 ? '+' : ''}${rec.rrChange} RR. Rank: ${rankText(currentRank())}` : '';
    renderRankBadge();
    $('me-title').style.color = won ? '#8cc4ff' : '#ff8a8e';
    $('me-score').textContent = `${m.score.ally} to ${m.score.enemy}${m.deathmatch ? ' kills' : ''} on ${m.map.name}`;
    $('me-rounds').innerHTML = m.history.map((w, i) => {
      const kind = w === 'ally' ? 'won' : w === 'enemy' ? 'lost' : 'draw';
      const label = kind === 'won' ? 'won' : kind === 'lost' ? 'lost' : 'drawn';
      const half = m.spikeMode && i + 1 === m.halftimeAfter && i + 1 < m.history.length ? '<li class="half" aria-hidden="true"></li>' : '';
      return `<li class="${kind}" title="Round ${i + 1} ${label}">${i + 1}</li>${half}`;
    }).join('');
    const mvp = m.mvp();
    if (mvp) {
      const who = mvp.c === m.player ? 'You' : `${mvp.c.name} (${mvp.c.team === 'ally' ? 'your team' : 'enemy'})`;
      $('me-mvp').textContent = `Match MVP: ${who}, ${mvp.s.kills} kills and ${mvp.s.damage} damage`;
    }
    $('me-kills').textContent = you.kills;
    $('me-deaths').textContent = you.deaths;
    $('me-assists').textContent = you.assists;
    $('me-damage').textContent = you.damage;
    $('me-heads').textContent = you.hits ? `${Math.round((you.heads / you.hits) * 100)}%` : 'n/a';
    $('me-kills-taken').textContent = you.killsAfterTakeover;
    $('me-takeovers').textContent = you.takeovers;
    $('me-board').innerHTML = scoreboardTables(m, { showAlive: false });
  }
  $('btn-match-again').addEventListener('click', () => {
    hud.clearFeed();
    const m = app.getMatch();
    m.options.takeover = settings.takeover;
    m.options.botMode = settings.botMode;
    m.restart();
    app.play();
  });
  $('btn-match-agent').addEventListener('click', () => openAgentPicker('menu', 'match'));
  $('btn-matchend-menu').addEventListener('click', goToMenu);

  return { goToMenu, showDrillResults, showMatchEnd, openSettings };
}
