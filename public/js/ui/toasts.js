// =====================================================
// Toast notification helper
// =====================================================

function ensureToastContainer() {
  let container = document.getElementById('toast-container');

  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');

    // Appends to <body>, making it global and lifecycle-safe
    document.body.appendChild(container);
  }

  return container;
}

function showToast({
  title = '',
  lines = [],
  type = 'success',
  duration = 5000
}) {
  const container = ensureToastContainer();
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'status');

  const content = document.createElement('div');
  content.style.flex = '1';

  if (title) {
    const header = document.createElement('div');
    header.className = 'toast-header';
    header.textContent = title;
    content.appendChild(header);
  }

  if (lines.length) {
    const body = document.createElement('div');
    body.className = 'toast-body';
    body.innerHTML = lines.map(line => `<div>${line}</div>`).join('');
    content.appendChild(body);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.innerHTML = '&times;';
  function dismissToast() {
  toast.classList.add('is-leaving');
  toast.addEventListener(
    'transitionend',
    () => toast.remove(),
    { once: true }
  );
}

closeBtn.onclick = dismissToast;

  toast.append(content, closeBtn);
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(dismissToast, duration);
  }
}