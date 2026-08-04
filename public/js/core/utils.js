function generateId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  // Fallback (older browsers)
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

// Escape user-provided text before interpolating it into HTML strings.
// Covers both element content and double-quoted attribute values.
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getFaviconCandidates(url) {
  try {
    const u = new URL(url);

    return [
      `${u.origin}/favicon.ico`,
      `${u.origin}/favicon.png`,
      `${u.origin}/apple-touch-icon.png`,
      `https://icons.duckduckgo.com/ip3/${u.hostname}.ico`
    ];

  } catch {
    return [];
  }
}

// =====================================================
// Favicon resolution cache
// =====================================================
//
// Buttons re-render constantly (every click, toggle, favourite), and
// each render used to re-probe up to 4 candidate URLs per button.
// Services without a favicon therefore produced a burst of failing
// requests on every single render.
//
// Results are cached per ORIGIN (not per button — many buttons share a
// host) and persisted, so a resolved icon is reused instantly and a
// known-missing one is never requested again until the TTL expires.
// A `null` entry means "this origin has no usable favicon".

const FAVICON_CACHE_KEY = 'webdash-favicon-cache-v1';

// Successes are stable; retry misses sooner so a newly added favicon
// starts showing up without needing a manual cache clear.
const FAVICON_TTL_FOUND = 30 * 24 * 60 * 60 * 1000; // 30 days
const FAVICON_TTL_MISSING = 24 * 60 * 60 * 1000;    // 1 day

let faviconCache = null;                 // origin -> { url: string|null, ts }
const faviconInFlight = new Map();       // origin -> Promise<string|null>
let faviconPersistTimer = null;

function loadFaviconCache() {
  if (faviconCache) return faviconCache;

  faviconCache = new Map();

  try {
    const raw = localStorage.getItem(FAVICON_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const now = Date.now();

      for (const [origin, entry] of Object.entries(parsed)) {
        if (!entry || typeof entry.ts !== 'number') continue;

        const ttl = entry.url ? FAVICON_TTL_FOUND : FAVICON_TTL_MISSING;
        if (now - entry.ts < ttl) {
          faviconCache.set(origin, entry);
        }
      }
    }
  } catch (e) {
    console.warn('[WebDash] Failed to read favicon cache:', e);
  }

  return faviconCache;
}

function persistFaviconCache() {
  // Batch writes — a first render can resolve dozens of origins at once
  if (faviconPersistTimer !== null) return;

  faviconPersistTimer = setTimeout(() => {
    faviconPersistTimer = null;

    try {
      localStorage.setItem(
        FAVICON_CACHE_KEY,
        JSON.stringify(Object.fromEntries(loadFaviconCache()))
      );
    } catch (e) {
      // Storage full / unavailable — the in-memory cache still works
    }
  }, 500);
}

function getFaviconOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// Returns the cached result, or undefined when this origin is unknown.
function getCachedFavicon(origin) {
  const entry = loadFaviconCache().get(origin);
  if (!entry) return undefined;

  const ttl = entry.url ? FAVICON_TTL_FOUND : FAVICON_TTL_MISSING;
  if (Date.now() - entry.ts >= ttl) {
    loadFaviconCache().delete(origin);
    return undefined;
  }

  return entry.url;
}

function setCachedFavicon(origin, url) {
  loadFaviconCache().set(origin, { url, ts: Date.now() });
  persistFaviconCache();
}

// Probes candidates in order and resolves to the first that loads,
// or null when none do. Concurrent callers share one probe.
function resolveFaviconUrl(url) {
  const origin = getFaviconOrigin(url);
  if (!origin) return Promise.resolve(null);

  const cached = getCachedFavicon(origin);
  if (cached !== undefined) return Promise.resolve(cached);

  if (faviconInFlight.has(origin)) {
    return faviconInFlight.get(origin);
  }

  const candidates = getFaviconCandidates(url);

  const probe = new Promise(resolve => {
    if (!candidates.length) return resolve(null);

    let index = 0;
    const img = new Image();

    img.onload = () => resolve(img.src);

    img.onerror = () => {
      index++;
      if (index >= candidates.length) return resolve(null);
      img.src = candidates[index];
    };

    img.src = candidates[0];
  }).then(result => {
    setCachedFavicon(origin, result);
    faviconInFlight.delete(origin);
    return result;
  });

  faviconInFlight.set(origin, probe);
  return probe;
}
