import { load, save } from './storage.js';

// Every setting, with its default. Saved in localStorage under "settings".
// Sensitivity uses the same scale as Valorant (0.07 degrees per mouse count),
// so you can copy your Valorant sensitivity straight in.
export const DEFAULT_SETTINGS = {
  // Mouse
  sensitivity: 0.5,
  scopedSensitivity: 1,    // multiplier while zoomed (1 = feels the same on screen)
  adsMode: 'toggle',       // right click: 'toggle' (click again to unzoom) or 'hold'
  rawInput: true,          // unaccelerated mouse input (Chrome, Edge, Brave)
  // Display
  fov: 103,                // horizontal degrees, like Valorant
  quality: 'medium',       // 'low' (no shadows), 'medium', or 'high'
  showFps: false,
  // Audio
  volume: 0.6,
  // Crosshair
  crosshairColor: '#5ef08a',
  crosshairStyle: 'dot',   // 'dot', 'cross', 'both' (cross + dot), or 'circle' (circle + dot)
  crosshairDotSize: 3,
  crosshairOpacity: 1,
  crosshairLength: 6,
  crosshairThickness: 2,
  crosshairGap: 3,
  crosshairOutline: true,
  crosshairMovementError: false, // opens up when you move (off, like Valorant's defaults)
  crosshairFiringError: false,   // opens up when you spray
  // Gameplay
  takeover: true,          // when you die: take over a teammate (or only spectate)
  // Testing
  fastCooldowns: true,     // test range only
  botMode: 'fight',        // 'idle', 'wander', or 'fight'
};

const saved = load('settings', {});
// Older builds kept these two in the match options.
const legacy = load('matchOptions', {});
for (const key of ['takeover', 'botMode']) {
  if (saved[key] === undefined && legacy[key] !== undefined) saved[key] = legacy[key];
}

// Version 2: the crosshair stays still by default. Older saves had it opening
// up with movement and spray, which made it jump around, so switch that off
// (and move the old default cross to the new default dot).
if ((saved.settingsVersion ?? 1) < 2 && Object.keys(saved).length) {
  delete saved.crosshairDynamic;
  saved.crosshairMovementError = false;
  saved.crosshairFiringError = false;
  if (saved.crosshairStyle === undefined || saved.crosshairStyle === 'cross') saved.crosshairStyle = 'dot';
}
delete saved.crosshairDynamic;
saved.settingsVersion = 2;

export const settings = { ...DEFAULT_SETTINGS, ...saved };

export function saveSettings() {
  save('settings', settings);
}

export function resetSettings() {
  Object.assign(settings, DEFAULT_SETTINGS, { settingsVersion: 2 });
  saveSettings();
}

/** One-click crosshair looks. Each sets several crosshair settings. */
export const CROSSHAIR_PRESETS = {
  dot: { crosshairStyle: 'dot', crosshairDotSize: 3, crosshairOutline: true },
  smalldot: { crosshairStyle: 'dot', crosshairDotSize: 2, crosshairOutline: true },
  classic: { crosshairStyle: 'cross', crosshairLength: 6, crosshairThickness: 2, crosshairGap: 3, crosshairOutline: true },
  classicdot: { crosshairStyle: 'both', crosshairLength: 5, crosshairThickness: 2, crosshairGap: 4, crosshairDotSize: 2, crosshairOutline: true },
  circle: { crosshairStyle: 'circle', crosshairGap: 6, crosshairThickness: 1, crosshairDotSize: 2, crosshairOutline: true },
};

/** What each graphics quality level means. */
export const QUALITY = {
  low: { shadows: false, shadowSize: 512, pixelRatio: 1 },
  medium: { shadows: true, shadowSize: 1024, pixelRatio: 1.5 },
  high: { shadows: true, shadowSize: 2048, pixelRatio: 2 },
};

export const CROSSHAIR_COLORS = ['#ffffff', '#5ef08a', '#ffe14a', '#4fd1ff', '#ff6bd5', '#ff5a5f'];

// ---------------------------------------------------------------------------
// Settings codes: copy your settings to another browser as a short string.
// ---------------------------------------------------------------------------
const CODE_PREFIX = 'PS1.';
const LIMITS = {
  sensitivity: [0.05, 2], scopedSensitivity: [0.2, 2], fov: [80, 120], volume: [0, 1],
  crosshairLength: [2, 14], crosshairThickness: [1, 5], crosshairGap: [0, 12],
  crosshairDotSize: [1, 8], crosshairOpacity: [0.3, 1],
};
const CHOICES = {
  quality: ['low', 'medium', 'high'],
  adsMode: ['toggle', 'hold'],
  crosshairStyle: ['cross', 'dot', 'both', 'circle'],
  botMode: ['idle', 'wander', 'fight'],
};

export function exportSettingsCode() {
  const json = JSON.stringify(settings);
  return CODE_PREFIX + btoa(unescape(encodeURIComponent(json)));
}

/**
 * Apply a settings code. Only known settings with valid values are used, so a
 * damaged or edited code can't break anything. Returns how many were applied.
 */
export function importSettingsCode(code) {
  const text = String(code ?? '').trim();
  if (!text.startsWith(CODE_PREFIX)) throw new Error('That is not a Poké Strike settings code.');
  let data;
  try {
    data = JSON.parse(decodeURIComponent(escape(atob(text.slice(CODE_PREFIX.length)))));
  } catch {
    throw new Error('That code is damaged. Copy it again.');
  }
  let applied = 0;
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(key in data)) continue;
    let v = data[key];
    if (typeof v !== typeof fallback) continue;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) continue;
      const [lo, hi] = LIMITS[key] ?? [-Infinity, Infinity];
      v = Math.min(hi, Math.max(lo, v));
    }
    if (CHOICES[key] && !CHOICES[key].includes(v)) continue;
    if (key === 'crosshairColor' && !/^#[0-9a-f]{6}$/i.test(v)) continue;
    settings[key] = v;
    applied++;
  }
  saveSettings();
  return applied;
}
