// ========================================================
// Dropdown menu logic (with optional auto-close behavior)
// ========================================================

// Dropdown invariant assertions (dev-time)
function assertDropdownInvariant(context = '') {
  const openMenus = document.querySelectorAll('.dropdown-menu.open');
  if (openMenus.length > 1) {
    console.error(
      '[Invariant] Multiple dropdown menus are open',
      { count: openMenus.length, openMenus, context }
    );
  }
}

function initializeDropdowns() {
  // Per-dropdown behavior
  document.querySelectorAll('.dropdown').forEach(dropdown => {
    const button = dropdown.querySelector('.dropdown-btn');
    const menu = dropdown.querySelector('.dropdown-menu');

    if (!button || !menu || dropdown._initialized) return;

    dropdown._initialized = true;

    function openMenu() {
      closeAllDropdowns();
      menu.classList.add('open');
      menu.setAttribute('aria-hidden', 'false');
      button.setAttribute('aria-expanded', 'true');
    }

    function closeMenu() {
      menu.classList.remove('open');
      menu.setAttribute('aria-hidden', 'true');
      button.setAttribute('aria-expanded', 'false');
    }

    button.addEventListener('click', e => {
      e.stopPropagation();
      menu.classList.contains('open') ? closeMenu() : openMenu();
    });

    button.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        button.click();
      }
    });
  });

  // Explicit close buttons inside dropdowns
  document.querySelectorAll('.dropdown-close').forEach(btn => {
    btn.addEventListener('click', closeAllDropdowns);
  });
}

// Global click-outside auto-close
if (!document._dropdownClickHandler) {
  document._dropdownClickHandler = true;

  document.addEventListener('click', () => {
    if (!autoCloseDropdowns) return;
    closeAllDropdowns();
  });
}

// Close all dropdowns helper
function closeAllDropdowns() {
  document.querySelectorAll('.dropdown').forEach(dropdown => {
    const menu = dropdown.querySelector('.dropdown-menu');
    const button = dropdown.querySelector('.dropdown-btn');

    menu.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
  });
  assertDropdownInvariant('after closeAllDropdowns');
}

// ============================
// Theme dropdown item handling
// ============================
function initializeThemeDropdownItems() {
  document.querySelectorAll('.theme-item').forEach(item => {
    if (item._wired) return;
    item._wired = true;

    item.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const theme = item.dataset.theme;
      changeTheme(theme);
      closeAllDropdowns();
    });
  });
}