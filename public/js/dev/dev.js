// =====================================================
// Dev helpers — State inspection
// =====================================================

if (__DEV__) {
  window.__dumpState = function (label = 'WebDash State') {
    console.group(label);

    console.log('Lifecycle');
    console.log('  lifecyclePhase:', lifecyclePhase);
    console.log('  appReady:', appReady);

    console.log('Dashboard Identity');
    console.log('  activeDashboardId:', activeDashboardId);
    console.log('  defaultDashboardId:', defaultDashboardId);

    console.log('Dashboard Structure');
    console.log('  availableDashboards:', availableDashboards);
    console.log('  dashboardState:', dashboardState);
    console.log('  pageCategories:', pageCategories);

    console.log('Preferences');
    console.log('  userPreferences:', userPreferences);

    console.groupEnd();
  };
}

// =====================================================
// Dev helpers — Lifecycle indicator
// =====================================================

if (__DEV__) {
  const badge = document.createElement('div');
  badge.style.position = 'fixed';
  badge.style.bottom = '8px';
  badge.style.right = '8px';
  badge.style.padding = '4px 8px';
  badge.style.background = '#111';
  badge.style.color = '#00ff88';
  badge.style.fontFamily = 'monospace';
  badge.style.fontSize = '11px';
  badge.style.borderRadius = '4px';
  badge.style.zIndex = '9999';
  badge.style.pointerEvents = 'none';

  badge.textContent = `Phase: ${lifecyclePhase}`;
  document.body.appendChild(badge);

  setInterval(() => {
    badge.textContent = `Phase: ${lifecyclePhase}`;
  }, 200);
}
``