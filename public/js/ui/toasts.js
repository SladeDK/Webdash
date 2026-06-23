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

    // Prevent duplicates in extreme race conditions
    if (!document.getElementById('toast-container')) {
      document.body.appendChild(container);
    } else {
      container = document.getElementById('toast-container');
    }
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
  // Prevent ANY click inside toast from bubbling to document
  toast.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'status');

  const progress = document.createElement('div');
  progress.className = 'toast-progress';

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
  closeBtn.innerHTML = '×';

  let dismissTimeout = null;
  let isDismissed = false;

  function clearTimer() {
    if (dismissTimeout !== null) {
      clearTimeout(dismissTimeout);
      dismissTimeout = null;
    }
  }

  function startTimer() {
    if (duration <= 0 || isDismissed) return;
    clearTimer();
    dismissTimeout = setTimeout(dismissToast, duration);
  }

  function dismissToast() {
    if (isDismissed) return;
    isDismissed = true;

    clearTimer();
    toast.classList.add('is-leaving');

    let removed = false;

    const cleanup = () => {
      if (removed) return;
      removed = true;
      toast.remove();
    };

    toast.addEventListener('transitionend', cleanup, { once: true });

    // Fallback in case transition doesn't fire
    setTimeout(cleanup, 300);
  }

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();   // prevent click from reaching menu logic
    e.preventDefault();    // safety (optional but good)

    dismissToast();
  });

  // Hover: pause & reset visually
  toast.addEventListener('mouseenter', () => {
    clearTimer();

    // Stop animation and reset to full width
    progress.classList.remove('is-running');
    progress.style.transform = 'scaleX(1)';
  });

  // Leave: restart animation & timer
  toast.addEventListener('mouseleave', () => {
    // Force a restart of the animation
    progress.classList.remove('is-running');
    progress.offsetHeight; // force reflow
    progress.classList.add('is-running');

    startTimer();
  });

  toast.append(content, closeBtn, progress);
  container.appendChild(toast);

  if (duration > 0) {
    progress.style.animationDuration = `${duration}ms`;
  }
  
  // Start animation + timer
  progress.classList.add('is-running');
  startTimer();
}