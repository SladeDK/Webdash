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
