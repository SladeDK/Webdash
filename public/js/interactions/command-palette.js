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
	
	const baseCommands = [
		{
			id: 'open-preferences',
			label: 'Open Preferences',
			category: 'Preferences',
			run: () => openPreferences?.()
		},
		{
			id: 'reset-dashboard',
			label: 'Reset Current Dashboard',
			category: 'Danger',
			destructive: true,
			run: async () => {
				await safeResetDashboard();
			}
		}
	];

	const preferenceCommands = [
		// Personalization
		{
			id: 'prefs-appearance',
			label: 'Open Appearance',
			category: 'Preferences',
			run: () => openPreferences('appearance')
		},
		{
			id: 'prefs-behavior',
			label: 'Open System Behavior',
			category: 'Preferences',
			run: () => openPreferences('behavior')
		},

		// Functionality
		{
			id: 'prefs-quick-access',
			label: 'Open Quick Access',
			category: 'Preferences',
			run: () => openPreferences('quick-access')
		},

		// Management
		{
			id: 'prefs-layout',
			label: 'Open Dashboard Layout',
			category: 'Preferences',
			run: () => openPreferences('layout')
		},
		{
			id: 'prefs-dashboard-management',
			label: 'Open Dashboard Management',
			category: 'Preferences',
			run: () => openPreferences('dashboard-management')
		},

		// System
		{
			id: 'prefs-data',
			label: 'Open Data Management',
			category: 'Preferences',
			run: () => openPreferences('data')
		},
		{
			id: 'prefs-advanced',
			label: 'Open Advanced',
			category: 'Preferences',
			run: () => openPreferences('advanced')
		}
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
    ...baseCommands,
		...preferenceCommands,
    ...dashboardCommands,
    ...buttonCommands
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

function renderCommandResults(query = '', resetSelection = false) {
  const container = document.getElementById('command-results');
  if (!container) return;

  container.innerHTML = '';

  const allCommands = getCommands();

  commandResults = query
    ? allCommands.filter(cmd => fuzzyMatch(query, cmd.label))
    : allCommands;

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

		el.innerHTML = `
			<span>${cmd.label}</span>
			<span class="meta">${cmd.destructive ? 'Danger • Hold Ctrl/Alt to skip' : cmd.category ?? ''}</span>
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

		if (commandResults.length === 0) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, commandResults.length - 1);
			renderCommandResults(input.value);
			return;
		}

		if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
			renderCommandResults(input.value);
			return;
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

  // Destructive (with confirm)
  if (isDestructive && !bypassConfirm) {
    closeCommandPalette();

    // CRITICAL: delay modal opening
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

	// Execute command first
	cmd.run();

	if (cmd.id?.startsWith('btn-')) {
		const buttonId = cmd.id.replace('btn-', '');

		addToRecents?.(buttonId);

		setTimeout(() => {
			renderCategories?.(pageCategories);
		}, 0);
	}

	// Close palette
	closeCommandPalette();
}