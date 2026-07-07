// =====================================================
// Clock & greeting widget
// =====================================================
//
// A lightweight, dependency-free startpage widget shown above the
// dashboard content. Controlled by the `showClock` behavior toggle.
//
// - Time updates in place (only touches the DOM when text changes)
// - Greeting adapts to the time of day and the active user
// - Fully removed from the DOM when disabled (no idle interval)
//

let clockIntervalId = null;

function getGreeting(date = new Date()) {
  const hour = date.getHours();

  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getGreetingName() {
  const user = typeof getActiveUser === 'function' ? getActiveUser() : 'default';

  if (!user || user === 'default') return '';

  return user.charAt(0).toUpperCase() + user.slice(1);
}

function formatClockTime(date) {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatClockDate(date) {
  return date.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
}

function ensureClockWidget() {
  const existing = document.getElementById('dashboard-clock');
  if (existing) return existing;

  const container = document.querySelector('.container');
  if (!container) return null;

  const widget = document.createElement('section');
  widget.id = 'dashboard-clock';
  widget.className = 'dashboard-clock';
  widget.setAttribute('aria-live', 'off');

  widget.innerHTML = `
    <div class="clock-time"></div>
    <div class="clock-meta">
      <span class="clock-greeting"></span>
      <span class="clock-date"></span>
    </div>
  `;

  // Sit above the search field, at the top of the main content
  const searchWrap = container.querySelector('.search-wrap');
  container.insertBefore(widget, searchWrap || container.firstChild);

  return widget;
}

function updateClockWidget() {
  const widget = document.getElementById('dashboard-clock');
  if (!widget) return;

  const now = new Date();

  const name = getGreetingName();
  const greeting = name ? `${getGreeting(now)}, ${name}` : getGreeting(now);

  const timeStr = formatClockTime(now);
  const dateStr = formatClockDate(now);

  const timeEl = widget.querySelector('.clock-time');
  const greetEl = widget.querySelector('.clock-greeting');
  const dateEl = widget.querySelector('.clock-date');

  // Only write when the value actually changed (cheap 1s tick)
  if (timeEl && timeEl.textContent !== timeStr) timeEl.textContent = timeStr;
  if (greetEl && greetEl.textContent !== greeting) greetEl.textContent = greeting;
  if (dateEl && dateEl.textContent !== dateStr) dateEl.textContent = dateStr;
}

function applyClockWidget() {
  const enabled = userPreferences?.behavior?.showClock !== false;

  if (!enabled) {
    document.getElementById('dashboard-clock')?.remove();

    if (clockIntervalId !== null) {
      clearInterval(clockIntervalId);
      clockIntervalId = null;
    }

    return;
  }

  ensureClockWidget();
  updateClockWidget();

  if (clockIntervalId === null) {
    clockIntervalId = setInterval(updateClockWidget, 1000);
  }
}
