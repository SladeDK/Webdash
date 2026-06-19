// =============================
// Constants & State
// =============================

const MAX_VISIBLE_RESULTS = 8;

let commandResults = [];
let selectedIndex = 0;
let allDashboardStates = [];

// =============================================================
// Gather dashboards, items, and etc. for commands
// =============================================================

function getAllDashboards() {
  if (!availableDashboards) return [];
  return availableDashboards;
}

function getAllButtons() {
  if (!allDashboardStates.length) return [];

  const seen = new Set();

  const buttons = allDashboardStates.flatMap(dashboard => {
    const meta = availableDashboards.find(d => d.id === dashboard.id);

    return (dashboard.categories || []).flatMap(cat =>
      (cat.items || [])
        .filter(item => {
          const key = `${dashboard.id}-${item.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map(item => ({
          ...item,
          dashboardId: dashboard.id,
          dashboardName: meta?.name ?? 'Unknown',
          categoryTitle: cat.title
        }))
    );
  });

  const activeId = dashboardState?.id;

  buttons.sort((a, b) => {
    if (a.dashboardId === activeId && b.dashboardId !== activeId) return -1;
    if (a.dashboardId !== activeId && b.dashboardId === activeId) return 1;
    return 0;
  });

  return buttons;
}

let cachedPreferenceButtons = null;

function getPreferenceCommands() {
  const groups = document.querySelectorAll('.modal-nav .nav-group');

  const commands = [];

  groups.forEach(group => {
    const groupTitle = group.querySelector('.nav-group-title')?.textContent.trim();

    const buttons = group.querySelectorAll('.nav-item');

    buttons.forEach(btn => {
      const panel = btn.dataset.panel;
      const label = btn.textContent.trim();

      commands.push({
        id: `prefs-${panel}`,
        label: `Open ${label}`,
        category: `Preferences • ${groupTitle}`,
        run: () => openPreferences(panel)
      });
    });
  });

  return commands;
}

function getThemeCommands() {
  const themes = window.THEMES || [];

  const currentTheme = userPreferences?.appearance?.theme;

  return themes.map(theme => ({
    id: `theme-${theme.id}`,
    label: theme.label,
    category: 'Themes',
    active: theme.id === currentTheme,
    run: () => {
      handleAppearanceChange?.({ theme: theme.id });
    }
  }));
}


function getBackgroundCommands() {
  const backgrounds = window.BACKGROUNDS || [];

  const currentBackground = userPreferences?.appearance?.background;

  return backgrounds.map(bg => ({
    id: `background-${bg.id}`,
    label: bg.label,
    category: 'Backgrounds',
    active: bg.id === currentBackground,
    run: () => {
      handleAppearanceChange?.({ background: bg.id });
    }
  }));
}

function getToggleCommands() {
  const toggles = window.TOGGLE_DEFINITIONS || [];

  return toggles.map(toggle => {
    const value = toggle.get();

    return {
      id: `toggle-${toggle.key}`,
      label: toggle.label,
      category: `Toggle • ${toggle.category}`,
      active: value,

      run: () => {
        const currentValue = toggle.get();
        toggle.set(!currentValue);

        const input = document.getElementById('command-input');
        renderCommandResults(input?.value ?? '');
      }
    };
  });
}

const COMMAND_SCOPES = {
  'open:': {
    name: 'Open',
    getCommands: () => getPreferenceCommands()
  },
  'theme:': {
    name: 'Theme',
    getCommands: () => getThemeCommands()
  },
  'background:': {
    name: 'Background',
    getCommands: () => getBackgroundCommands()
  },
  'toggle:': {
    name: 'Toggle',
    getCommands: () => getToggleCommands()
  },
};

async function loadAllDashboardStates() {
  try {
    const dashboards = await DashboardService.loadAllDashboards();

    return Object.values(dashboards); // convert object → array
  } catch (e) {
    console.warn('Failed to load all dashboards', e);
    return [];
  }
}

// =============================
// Command registry
// =============================

function getCommands() {
	
	const dynamicCommands = [
		{
			id: 'scope-open',
			label: 'Open:',
			category: 'Actions',
			isScope: true,
			run: () => {
				const input = document.getElementById('command-input');
				if (!input) return;

				input.value = 'open: ';
				renderCommandResults('open: ', true);

				input.focus();
			}
		},
		{
			id: 'scope-theme',
			label: 'Theme:',
			category: 'Actions',
			isScope: true,
			run: () => {
				const input = document.getElementById('command-input');
				if (!input) return;

				input.value = 'theme: ';
				renderCommandResults('theme: ', true);

				input.focus();
			}
		},
		{
			id: 'scope-background',
			label: 'Background:',
			category: 'Actions',
			isScope: true,
			run: () => {
				const input = document.getElementById('command-input');
				if (!input) return;

				input.value = 'background: ';
				renderCommandResults('background: ', true);

				input.focus();
			}
		},
    {
      id: 'scope-toggle',
      label: 'Toggle:',
      category: 'Actions',
      isScope: true,
      run: () => {
        const input = document.getElementById('command-input');
        if (!input) return;

        input.value = 'toggle: ';
        renderCommandResults('toggle: ', true);

        input.focus();
      }
    },
	];

	const baseCommands = [
		{
			id: 'reset-dashboard',
			label: 'Reset Current Dashboard',
			category: 'Danger',
			destructive: true,
			run: async () => {
				await safeResetDashboard();
			}
		},
	];

  // Dynamic: buttons from dashboard
	const buttonCommands = getAllButtons().map(btn => ({
		id: `btn-${btn.id}`,
		label: btn.label,
		category: `${btn.dashboardName} • ${btn.categoryTitle}`,
		run: () => {
			const newTab = userPreferences?.behavior?.openLinksInNewTab;

			if (btn.url) {
				if (newTab) {
					window.open(btn.url, '_blank');
				} else {
					window.location.href = btn.url;
				}
			}
		}
	}));

  // Dynamic: dashboards
	const dashboardCommands = getAllDashboards()
		.filter(d => d.id !== dashboardState?.id)
		.map(d => ({
			id: `dash-${d.id}`,
			label: `Switch to ${d.name}`,
			category: 'Navigation',
			run: () => switchDashboard(d.id)
		}));

  return [
		...dynamicCommands,
    ...dashboardCommands,
    ...baseCommands,
    ...buttonCommands,
  ];
}

// =============================
// Core controls
// =============================

async function openCommandPalette() {
  const palette = document.getElementById('command-palette');
  if (!palette) return;

	selectedIndex = 0; // Reset selection

  allDashboardStates = await loadAllDashboardStates();

  palette.hidden = false;

  const input = document.getElementById('command-input');

  if (input) {
    input.value = '';
    renderCommandResults('', true);
    setTimeout(() => input.focus(), 0);
  }
}

function closeCommandPalette() {
  const palette = document.getElementById('command-palette');
  if (!palette) return;

  palette.hidden = true;

  const input = document.getElementById('command-input');
  if (input) input.blur();
}


function toggleCommandPalette() {
  const palette = document.getElementById('command-palette');
  if (!palette) return;

  if (palette.hidden) {
    openCommandPalette();
  } else {
    closeCommandPalette();
  }
}

// =============================
// Rendering
// =============================

function fuzzyMatch(query, text) {
  query = query.toLowerCase();
  text = text.toLowerCase();

  let qIndex = 0;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === query[qIndex]) {
      qIndex++;
    }

    if (qIndex === query.length) {
      return true;
    }
  }

  return false;
}

function highlightMatch(text, query) {
  if (!query) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  let result = '';
  let qIndex = 0;

  for (let i = 0; i < text.length; i++) {
    if (lowerText[i] === lowerQuery[qIndex]) {
      result += `<span class="match">${text[i]}</span>`;
      qIndex++;
    } else {
      result += text[i];
    }
  }

  return result;
}

function getMatchScore(query, text) {
  if (!query) return 0;

  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact match
  if (t === q) return 100;

  // Starts with
  if (t.startsWith(q)) return 75;

  // Includes substring
  if (t.includes(q)) return 50;

  // Fuzzy match (fallback)
  if (fuzzyMatch(q, t)) return 25;

  return 0;
}

function renderCommandResults(query = '', resetSelection = false) {
	const originalQuery = query;
  const container = document.getElementById('command-results');
  if (!container) return;

  container.innerHTML = '';

  let allCommands;

	const lowerQuery = query.toLowerCase();

	// Find matching scope
	const activeScopeEntry = Object.entries(COMMAND_SCOPES)
		.find(([prefix]) => lowerQuery.startsWith(prefix));

	const inputEl = document.getElementById('command-input');

	if (inputEl) {
		if (activeScopeEntry) {
			inputEl.dataset.scope = activeScopeEntry[1].name;
		} else {
			delete inputEl.dataset.scope;
		}
	}

	if (activeScopeEntry) {
		const [prefix, scope] = activeScopeEntry;

		// slice using LOWERCASE string length, but apply to original safely
		query = query.substring(prefix.length).trim();

		allCommands = scope.getCommands();
	} else {
		allCommands = getCommands();
	}

  const normalizedQuery = query.trimEnd(); // remove trailing spaces

	commandResults = normalizedQuery
  ? allCommands
      .map(cmd => {
        const labelScore = getMatchScore(normalizedQuery, cmd.label);
        const categoryScore = getMatchScore(normalizedQuery, cmd.category || '');

        const score = Math.max(labelScore, categoryScore);

        return { ...cmd, _score: score };
      })
      .filter(cmd => cmd._score > 0)
  : allCommands.map(cmd => ({ ...cmd, _score: 0 }));

	commandResults.sort((a, b) => {
		const queryLower = normalizedQuery.toLowerCase();

		// Exact match priority
		const aExact = a.label.toLowerCase() === queryLower;
		const bExact = b.label.toLowerCase() === queryLower;

		if (aExact && !bExact) return -1;
		if (!aExact && bExact) return 1;

		// Score-based sorting
		if (a._score !== b._score) {
			return b._score - a._score;
		}

		return 0;
	});

  // Only reset when explicitly requested
  if (resetSelection) {
    selectedIndex = 0;
  } else {
    selectedIndex = Math.min(selectedIndex, commandResults.length - 1);
    if (selectedIndex < 0) selectedIndex = 0;
  }

  if (commandResults.length === 0) {
    container.innerHTML = `
			<div class="command-empty">
				<div class="command-empty-title">No results</div>
				<div class="command-empty-sub">Try a different search</div>
			</div>
		`;
    return;
  }

  commandResults.forEach((cmd, index) => {
    const el = document.createElement('div');
    el.className = 'command-item';

    const displayLabel = highlightMatch(cmd.label, originalQuery);

    const metaText =
      cmd.active !== undefined
        ? (cmd.active ? 'ON' : 'OFF')
        : (cmd.destructive
            ? 'Danger • Hold Ctrl/Alt to skip'
            : cmd.category ?? '');

    el.innerHTML = `
      <span class="${cmd.active ? 'active' : ''}">
        ${displayLabel}
      </span>
      <span class="meta">${metaText}</span>
    `;

    if (index === selectedIndex) {
      el.classList.add('selected');
    }

    el.addEventListener('click', (e) => {
      executeCommand(index, e);
    });

    container.appendChild(el);
  });

	const selectedEl = container.querySelector('.command-item.selected');

	if (selectedEl) {
		selectedEl.scrollIntoView({
			block: 'nearest',
			behavior: 'auto'
		});
	}
}

// =============================
// Input wiring
// =============================

(function initCommandPalette() {
  const input = document.getElementById('command-input');

  if (!input || input._wired) return;
  input._wired = true;

  input.addEventListener('input', () => {
    renderCommandResults(input.value, true); // reset on typing
  });

	input.addEventListener('mousedown', (e) => {
		e.stopPropagation();
	});

  input.addEventListener('keydown', (e) => {

		const value = input.value.toLowerCase();

		const activeScope = Object.keys(COMMAND_SCOPES)
			.find(prefix => value.startsWith(prefix));

		// Exit scope on backspace
		if (
			e.key === 'Backspace' &&
			activeScope &&
			value.trim() === activeScope
		) {
			e.preventDefault();

			input.value = '';
			renderCommandResults('', true);
			return;
		}

		if (commandResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();

      if (commandResults.length > 0) {
        selectedIndex = (selectedIndex + 1) % commandResults.length;
      }

      renderCommandResults(input.value);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();

      if (commandResults.length > 0) {
        selectedIndex =
          (selectedIndex - 1 + commandResults.length) % commandResults.length;
      }

      renderCommandResults(input.value);
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();

      const cmd = commandResults[selectedIndex];
      if (!cmd) return;

      const input = document.getElementById('command-input');
      if (!input) return;

      const value = input.value;

      const activeScopeEntry = Object.entries(COMMAND_SCOPES)
        .find(([prefix]) => value.toLowerCase().startsWith(prefix));

      // Scope handling
      if (activeScopeEntry) {
        const [prefix] = activeScopeEntry;

        let label = cmd.label;

        // Remove redundant prefix word
        if (prefix === 'open:' && label.toLowerCase().startsWith('open ')) {
          label = label.slice(5);
        }

        input.value = prefix + ' ' + label.toLowerCase();
        renderCommandResults(input.value, true);
        return;
      }

      // Scope command itself
      if (cmd.isScope) {
        input.value = cmd.label.toLowerCase() + ' ';
        renderCommandResults(input.value, true);
        return;
      }

      // Normal command
      input.value = cmd.label.toLowerCase();
      renderCommandResults(input.value, true);
    }

		if (e.key === 'Enter') {
			e.preventDefault();
			executeCommand(selectedIndex, e);
			return;
		}
	});
})();

(function wireCommandPaletteOverlay() {
  const palette = document.getElementById('command-palette');
  if (!palette || palette._overlayWired) return;

  palette._overlayWired = true;

  palette.addEventListener('mousedown', (e) => {
    if (e.target === palette) {
      closeCommandPalette();
    }
  });
})();

// =============================
// Execution Helper
// =============================

function executeCommand(index, event = {}) {
  const cmd = commandResults[index];
  if (!cmd) return;

  const isDestructive = cmd.destructive === true;
  const bypassConfirm = event.ctrlKey || event.altKey;

  // Scope commands (like "Open:")
  if (cmd.isScope) {
    cmd.run(); // Only update input + rerender
    return;    // Do NOT close palette
  }

  // Destructive (with confirm)
  if (isDestructive && !bypassConfirm) {
    closeCommandPalette();

    setTimeout(() => {
      openConfirm({
        title: cmd.label,
        message:
          'Are you sure you want to perform this action?\n\nThis cannot be undone.',
        confirmLabel: 'Continue',
        onConfirm: async () => {
          await cmd.run();
        }
      });
    }, 0);

    return;
  }

  // Normal commands
  cmd.run();

  // Handle button recents
  if (cmd.id?.startsWith('btn-')) {
    const buttonId = cmd.id.replace('btn-', '');

    addToRecents?.(buttonId);

    setTimeout(() => {
      renderCategories?.(pageCategories);
    }, 0);
  }

  // Close only for real commands
  closeCommandPalette();
}