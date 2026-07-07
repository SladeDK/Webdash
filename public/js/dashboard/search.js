// ==============================================
// Search functionality for buttons / items
// ==============================================

// - case-insensitive
// - fuzzy matching (reuses getMatchScore from the command palette)
// - matches button labels AND urls
// - ranks results; the best match is highlighted and opened on Enter
// - "/" focuses the search field, Escape clears it
// - shows an empty state when nothing matches

const searchInput = document.getElementById('service-search');

// The current best match (opened when the user presses Enter)
let topSearchResult = null;

function ensureSearchEmptyState() {
  let el = document.getElementById('search-empty-state');

  if (!el) {
    el = document.createElement('div');
    el.id = 'search-empty-state';
    el.className = 'empty-state';
    el.hidden = true;
    el.textContent = 'No services match your search';

    document.querySelector('.categories')?.before(el);
  }

  return el;
}

// Score a single button against the query.
// Falls back to a substring match on the URL so people can search by host.
function scoreButton(button, query) {
  if (!button.dataset.searchLabel) {
    button.dataset.searchLabel = button.textContent.toLowerCase().trim();
    button.dataset.searchUrl = (button.getAttribute('href') || '').toLowerCase();
  }

  const label = button.dataset.searchLabel;
  const url = button.dataset.searchUrl;

  // getMatchScore is provided by the command palette (loaded earlier).
  // It handles exact / prefix / substring / fuzzy ranking.
  const labelScore =
    typeof getMatchScore === 'function'
      ? getMatchScore(query, label)
      : (label.includes(query) ? 50 : 0);

  const urlScore = url.includes(query) ? 40 : 0;

  return Math.max(labelScore, urlScore);
}

function applySearchFilter(rawQuery) {
  let query = rawQuery.toLowerCase().trim();

  // "*" prefix kept for backwards compatibility
  if (query.startsWith('*')) {
    query = query.slice(1);
  }

  const categories = document.querySelectorAll('.category');
  const quickAccess = document.querySelector('.quick-access');
  let anyVisible = false;

  // Reset previous top-result highlight
  if (topSearchResult) {
    topSearchResult.classList.remove('is-top-result');
    topSearchResult = null;
  }

  let bestScore = 0;

  categories.forEach(category => {
    const buttons = category.querySelectorAll('.buttons a');

    // Reset
    if (query === '') {
      buttons.forEach(button => {
        button.style.display = '';
      });
      category.style.display = '';
      anyVisible = true;
      return;
    }

    let hasVisibleButtons = false;

    buttons.forEach(button => {
      const score = scoreButton(button, query);
      const matches = score > 0;

      button.style.display = matches ? '' : 'none';

      if (matches) {
        hasVisibleButtons = true;

        if (score > bestScore) {
          bestScore = score;
          topSearchResult = button;
        }
      }
    });

    category.style.display = hasVisibleButtons ? '' : 'none';

    if (hasVisibleButtons) {
      anyVisible = true;
    }
  });

  // Collapsed categories would hide their (matching) buttons — expand
  // any category that has a visible match while a search is active.
  if (query !== '') {
    categories.forEach(category => {
      if (category.style.display !== 'none') {
        category.classList.remove('is-collapsed');
      }
    });
  }

  // Hide Quick Access while searching — it would only show noise
  if (quickAccess) {
    quickAccess.style.display = query === '' ? '' : 'none';
  }

  // Highlight the best match
  if (topSearchResult) {
    topSearchResult.classList.add('is-top-result');
  }

  const emptyState = ensureSearchEmptyState();
  emptyState.hidden = query === '' || anyVisible;
}

function openTopSearchResult() {
  if (!topSearchResult) return;

  const url = topSearchResult.getAttribute('href');
  if (!url) return;

  const itemId = topSearchResult.dataset.itemId;
  if (itemId && typeof addToRecents === 'function') {
    addToRecents(itemId);
  }

  const newTab = userPreferences?.behavior?.openLinksInNewTab !== false;

  if (newTab) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    window.location.href = url;
  }
}

if (searchInput) {
  searchInput.addEventListener('input', () => {
    applySearchFilter(searchInput.value);
  });

  searchInput.addEventListener('keydown', (e) => {
    // Enter opens the best match
    if (e.key === 'Enter') {
      if (topSearchResult) {
        e.preventDefault();
        openTopSearchResult();
      }
      return;
    }

    // Escape clears the search (and re-shows everything)
    if (e.key === 'Escape' && searchInput.value) {
      e.preventDefault();
      e.stopPropagation();
      searchInput.value = '';
      applySearchFilter('');
    }
  });
}
