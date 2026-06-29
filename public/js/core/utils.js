function generateId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  // Fallback (older browsers)
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function getFaviconUrl(url) {
  try {
    const u = new URL(url);

    return `
      https://icons.duckduckgo.com/ip3/${u.hostname}.ico
    `.trim();

  } catch {
    return null;
  }
}