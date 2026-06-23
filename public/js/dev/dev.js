// =====================================================
// Dev helpers — State inspection
// =====================================================

// Safe dev flag (works even without build tools)
const DEV_MODE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('dev');

if (DEV_MODE) {
  window.__dumpState = function (label = 'WebDash State') {
    console.group(label);

    console.group('Lifecycle');
    console.log('lifecyclePhase:', lifecyclePhase);
    console.log('appReady:', appReady);
    console.groupEnd();

    console.group('Dashboard Identity');
    console.log('activeDashboardId:', activeDashboardId);
    console.log('defaultDashboardId:', defaultDashboardId);
    console.groupEnd();

    console.group('Dashboard Structure');
    console.log('availableDashboards:', availableDashboards);
    console.log('dashboardState:', dashboardState);
    console.log('pageCategories:', pageCategories);
    console.groupEnd();

    console.group('Preferences');
    console.log('userPreferences:', userPreferences);
    console.groupEnd();

    console.groupEnd();
  };

  // Optional helper (nice to have)
  window.__dumpQA = function () {
    console.group('Quick Access');

    console.log('Favorites:', userPreferences?.behavior?.favorites);
    console.log('Recents:', userPreferences?.behavior?.recents);

    console.groupEnd();
  };
}

// =====================================================
// Dev helpers — Lifecycle indicator
// =====================================================

if (DEV_MODE) {
  function createLifecycleBadge() {
    // Prevent duplicate badge
    if (document.getElementById('dev-lifecycle-badge')) return;

    const badge = document.createElement('div');
    badge.id = 'dev-lifecycle-badge';

    Object.assign(badge.style, {
      position: 'fixed',
      bottom: '8px',
      right: '8px',
      padding: '4px 8px',
      background: '#111',
      color: '#00ff88',
      fontFamily: 'monospace',
      fontSize: '11px',
      borderRadius: '4px',
      zIndex: '9999',
      pointerEvents: 'none'
    });

    document.body.appendChild(badge);

    let lastValue = null;

    function update() {
      if (!document.body.contains(badge)) return;

      if (lifecyclePhase !== lastValue) {
        badge.textContent = `System Phase: ${lifecyclePhase}`;
        lastValue = lifecyclePhase;
      }

      requestAnimationFrame(update);
    }

    update();
  }

  // Ensure DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createLifecycleBadge);
  } else {
    createLifecycleBadge();
  }
}