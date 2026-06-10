// =============================
// Constants & State
// =============================

let commandResults = [];
let selectedIndex = 0;

// =============================================================
// Gather dashboards, items, and etc. for commands
// =============================================================

function getAllDashboards() {
  if (!availableDashboards) return [];
  return availableDashboards;
}


function getAllButtons() {
  if (!dashboardState?.categories) return [];

  return dashboardState.categories.flatMap(cat =>
    (cat.items || []).map(item => ({
      ...item,
      categoryTitle: cat.title
    }))
  );
}


// =============================
// Command registry
// =============================

function getCommands() {
	
  const baseCommands = [
    {
      id: 'open-preferences',
      label: 'Open Preferences',
      category: 'Navigation',
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

  // Dynamic: buttons from dashboard
	const buttonCommands = getAllButtons().map(btn => ({
		id: `btn-${btn.id}`,
		label: `${btn.categoryTitle} → ${btn.label}`,
		category: btn.dashboardName ?? 'Services',
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
			category: 'Dashboards',
			run: () => switchDashboard(d.id)
		}));

  return [
    ...baseCommands,
    ...dashboardCommands,
    ...buttonCommands
  ];
}

// =============================
// Core controls
// =============================

function openCommandPalette() {
  const palette = document.getElementById('command-palette');
  if (!palette) return;

  palette.hidden = false;

  const input = document.getElementById('command-input');

  if (input) {
    input.value = '';
    renderCommandResults('');
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

function renderCommandResults(query = '') {
  const container = document.getElementById('command-results');
  if (!container) return;

  const prevIndex = selectedIndex;

  container.innerHTML = '';

  const allCommands = getCommands();

	commandResults = allCommands.filter(cmd =>
		fuzzyMatch(query, cmd.label)
	);

  selectedIndex = Math.min(prevIndex, commandResults.length - 1);
  if (selectedIndex < 0) selectedIndex = 0;

  if (commandResults.length === 0) {
    container.innerHTML = '<div class="empty">No results</div>';
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

      requestAnimationFrame(() => {
        el.scrollIntoView({ block: 'nearest' });
      });
    }

    el.addEventListener('click', (e) => {
			executeCommand(index, e);
		});

    container.appendChild(el);
  });
}

// =============================
// Input wiring
// =============================

(function initCommandPalette() {
  const input = document.getElementById('command-input');

  if (!input || input._wired) return;
  input._wired = true;

  input.addEventListener('input', () => {
    renderCommandResults(input.value);
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

  // Normal / bypass
  closeCommandPalette();
  cmd.run();
}