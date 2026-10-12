import { load, save } from './storage.js';

// Every setting, with its default. Saved in localStorage under "settings".
// Sensitivity uses the same scale as Valorant (0.07 degrees per mouse count),
// so you can copy your Valorant sensitivity straight in.
export const DEFAULT_SETTINGS = {
  // Mouse
  sensitivity: 0.5,
  rawInput: true,          // unaccelerated mouse input (Chrome, Edge, Brave)
  // Display
  fov: 103,                // horizontal degrees, like Valorant
  quality: 'medium',       // 'low' (no shadows), 'medium', or 'high'
  showFps: false,
  // Audio
  volume: 0.6,
  // Crosshair
  crosshairColor: '#ffffff',
  crosshairStyle: 'cross', // 'cross', 'dot', or 'both'
  crosshairLength: 6,
  crosshairThickness: 2,
  crosshairGap: 3,
  crosshairOutline: true,
  crosshairDynamic: true,  // opens up with movement and spray error
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

export const settings = { ...DEFAULT_SETTINGS, ...saved };

export function saveSettings() {
  save('settings', settings);
}

export function resetSettings() {
  Object.assign(settings, DEFAULT_SETTINGS);
  saveSettings();
}

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
  sensitivity: [0.05, 2], fov: [80, 120], volume: [0, 1],
  crosshairLength: [2, 14], crosshairThickness: [1, 5], crosshairGap: [0, 12],
};
const CHOICES = {
  quality: ['low', 'medium', 'high'],
  crosshairStyle: ['cross', 'dot', 'both'],
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
