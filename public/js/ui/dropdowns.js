// ============================
// Dropdown menu logic (with optional auto-close behavior)
// ============================

// Per-dropdown behavior
document.querySelectorAll('.dropdown').forEach(dropdown => {
  const button = dropdown.querySelector('.dropdown-btn');
  const menu = dropdown.querySelector('.dropdown-menu');

  function openMenu() {
    closeAll();
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
    const isOpen = menu.classList.contains('open');
    isOpen ? closeMenu() : openMenu();
  });

  // Keyboard activation
  button.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      button.click();
    }
  });
});

// Global click-outside auto-close
document.addEventListener('click', () => {
  if (!autoCloseDropdowns) return;
  closeAll();
});

// Close all dropdowns helper
function closeAll() {
  document.querySelectorAll('.dropdown').forEach(dropdown => {
    const menu = dropdown.querySelector('.dropdown-menu');
    const button = dropdown.querySelector('.dropdown-btn');

    menu.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
  });
}

// Explicit close buttons inside dropdowns
document.querySelectorAll('.dropdown-close').forEach(btn => {
  btn.addEventListener('click', closeAll);
});

document.addEventListener('click', (e) => {
  if (!autoCloseDropdowns) return;
  closeAll();
});

// ============================
// Theme dropdown item handling
// ============================
document.querySelectorAll('.dropdown [data-theme]').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();

    const theme = item.dataset.theme;

    changeTheme(theme); // user-initiated action
    closeAll();         // close dropdown after selection
  });
});
