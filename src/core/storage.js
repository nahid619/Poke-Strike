// Small localStorage wrapper. Every call is guarded because storage can be
// disabled, full, or cleared at any time.
const PREFIX = 'pokestrike:';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage unavailable: settings just won't persist this session.
  }
}
