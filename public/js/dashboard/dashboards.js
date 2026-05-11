
//  * dashboards.js rendering and management UI * dashboards.js
//  * - Default dashboard handling
//  * - Selector synchronization
//  *
//  * This file coordinates dashboard state with UI rendering
//  * and persistence services. Structural layout is intentional
//  * and should be considered stable.

// ======================================================================
// Dashboard invariants (authoritative rules)
// ======================================================================

// Dashboard invariant assertions (dev-time)
function assertDashboardInvariants(context = '') {
  // Active dashboard must exist
  if (!activeDashboardId) {
    console.groupCollapsed('[Invariant] Dashboard identity');
    console.error('activeDashboardId is null or undefined');
    console.log({ context });
    console.groupEnd();
  }

  // Active dashboard must be in availableDashboards
  if (
    activeDashboardId &&
    !availableDashboards.some(d => d.id === activeDashboardId)
  ) {
    console.groupCollapsed('[Invariant] Dashboard identity');
    console.error('activeDashboardId not present in availableDashboards');
    console.log({ activeDashboardId, availableDashboards, context });
    console.groupEnd();
  }

  // dashboardState must match activeDashboardId once loaded
  if (
    appReady &&
    dashboardState &&
    dashboardState.id !== activeDashboardId
  ) {
    console.groupCollapsed('[Invariant] Dashboard state mismatch');
    console.error('dashboardState.id does not match activeDashboardId');
    console.log({
      dashboardStateId: dashboardState.id,
      activeDashboardId,
      context
    });
    console.groupEnd();
  }

  // pageCategories must reference dashboardState.categories
  if (
    dashboardState &&
    pageCategories !== dashboardState.categories
  ) {
    console.groupCollapsed('[Invariant] Dashboard structure');
    console.error('pageCategories desynced from dashboardState.categories');
    console.log({ context });
    console.groupEnd();
  }
}

// Dashboard invariant guards (development-only)
function enforceDashboardInvariants(context = '') {
  if (!activeDashboardId) {
    throw new Error(
      `[Invariant Violation] activeDashboardId is missing (${context})`
    );
  }

  if (
    !availableDashboards.some(d => d.id === activeDashboardId)
  ) {
    throw new Error(
      `[Invariant Violation] activeDashboardId not found in availableDashboards (${context})`
    );
  }

  if (
    appReady &&
    dashboardState &&
    dashboardState.id !== activeDashboardId
  ) {
    throw new Error(
      `[Invariant Violation] dashboardState.id does not match activeDashboardId (${context})`
    );
  }
}

// ======================================================================
// Dashboard commit & persistence helpers (NO identity changes)
// ======================================================================

//  * Commits the current dashboard state.
//  *
//  * Responsibilities:
//  * - Persist dashboardState
//  * - Re-render dashboard-dependent UI
//  * - Enforce invariants (dev-only)
//  *
//  * IMPORTANT:
//  * - This function makes NO state mutations.
//  * - All invariants MUST already hold before calling.
//  * - This is a COMMIT, not a mutation or transition.

async function commitDashboardChange(context = '') {
  // Persist dashboard state
  await DashboardService.save(dashboardState);

  // Re-render dashboard UI
  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);

  // Dev-time safety net
  assertSystemInvariants(
    context
      ? `commitDashboardChange: ${context}`
      : 'commitDashboardChange'
  );
}

//  * Fully transitions the app to the given dashboard ID.
//  * This is an IDENTITY TRANSACTION.
//  *
//  * Guarantees:
//  * - dashboardState + pageCategories are hydrated first
//  * - activeDashboardId is committed last
//  * - UI + preferences are finalized
//  * - invariants hold after completion

async function transitionToDashboard(dashboardId, context = '') {
  // 1. Tell backend which dashboard is active
  await DashboardService.setActiveDashboardId(dashboardId);

  // 2. Load authoritative dashboard state
  const newDashboardState = await DashboardService.load();
  if (!newDashboardState) {
    throw new Error(
      `[WebDash] Failed to load dashboard "${dashboardId}" (${context})`
    );
  }

  // 3. Hydrate frontend state FIRST
  dashboardState = newDashboardState;
  pageCategories = dashboardState.categories;

  // 4. Apply dashboard-scoped appearance
  applyDashboardAppearance();

  // 5. NOW commit identity (invariants must already hold)
  setActiveDashboardId(dashboardId, context);

  // 6. Render UI
  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);

  // 7. Finalize identity-dependent side effects
  await finalizeActiveDashboardChange();

  // 8. Safety net
  assertSystemInvariants(
    context ? `transitionToDashboard: ${context}` : 'transitionToDashboard'
  );
}

//  * Commits a pre-hydrated dashboard as the active dashboard.
//  * Used when dashboardState is already known locally.
async function commitPrehydratedDashboard(dashboardId, context = '') {
  // dashboardState + pageCategories MUST already be set correctly
  applyDashboardAppearance();

  setActiveDashboardId(dashboardId, context);

  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);

  await finalizeActiveDashboardChange();

  assertSystemInvariants(
    context ? `commitPrehydratedDashboard: ${context}` : 'commitPrehydratedDashboard'
  );
}

// ======================================================================
// Dashboard identity & lifecycle transitions (transactional)
// ======================================================================

async function switchDashboard(dashboardId) {
  if (dashboardId === activeDashboardId) return;
  await transitionToDashboard(dashboardId, 'switchDashboard');
}

async function createAndSwitchDashboard({ id, name }) {
  const template = getDefaultDashboardTemplate({ id, name });

  await DashboardService.createDashboard({
    id: template.id,
    name: template.name
  });

  await DashboardService.save(template);

  // Hydrate local state
  dashboardState = template;
  pageCategories = template.categories;

  // Metadata only
  addAvailableDashboard({ id, name }, 'createAndSwitchDashboard');

  // ✅ Identity transaction
  await commitPrehydratedDashboard(id, 'createAndSwitchDashboard');

  // UI bookkeeping (not identity)
  syncLayoutDashboardSelector();
  syncDefaultDashboardSelector();
  renderDashboardList();
  renderDashboardManagementPanel();
}

async function deleteDashboard(dashboardId, autoSwitch = true) {
  if (availableDashboards.length <= 1) {
    setDashboardValidationError('You must have at least one dashboard.');
    return;
  }

  const isDefault = dashboardId === defaultDashboardId;
  const remainingDashboards =
    availableDashboards.filter(d => d.id !== dashboardId);

  if (isDefault && remainingDashboards.length > 1) {
    pendingDefaultDeletionId = dashboardId;
    openDeleteDefaultDashboardModal(dashboardId);
    return;
  }

  if (dashboardId === activeDashboardId) {
    const nextActiveId =
      defaultDashboardId !== dashboardId
        ? defaultDashboardId
        : remainingDashboards[0].id;

    await transitionToDashboard(nextActiveId, 'deleteDashboard');
  }

  const res = await fetch(`/api/dashboards/${dashboardId}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    console.error('[WebDash] Failed to delete dashboard', dashboardId);
    return;
  }

  // Ensure defaultDashboardId is valid BEFORE structural mutation
  if (dashboardId === defaultDashboardId) {
    // At this point, a new default MUST exist
    // Prefer the first remaining dashboard
    defaultDashboardId = remainingDashboards[0].id;
  }

  replaceAvailableDashboards(
    remainingDashboards,
    'deleteDashboard'
  );

  syncDefaultDashboardSelector();
  syncLayoutDashboardSelector();
  renderDashboardManagementPanel();
  renderDashboardList();

  assertSystemInvariants('after deleteDashboard');
}

async function renameDashboardDisplayName(dashboardId, newName) {
  const trimmed = newName.trim();
  if (!trimmed) {
    renamingDashboardId = null;

    syncDefaultDashboardSelector();
    syncLayoutDashboardSelector();
    clearDashboardValidationError();
    renderDashboardManagementPanel();
    
    return;
  }

  const res = await fetch(`/api/dashboards/${dashboardId}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: trimmed })
  });

  if (!res.ok) {
    setDashboardValidationError('Failed to rename dashboard', await res.text());
    renamingDashboardId = null;
    renderDashboardManagementPanel();
    return;
  }

  clearDashboardValidationError();

  // Update in-memory dashboard metadata
  const dashboard = availableDashboards.find(d => d.id === dashboardId);
  if (dashboard) {
    dashboard.name = trimmed;
  }

  // Keep active dashboard state in sync
  if (dashboardState && dashboardState.id === dashboardId) {
    dashboardState.name = trimmed;
  }

  renamingDashboardId = null;

  syncDefaultDashboardSelector();
  syncLayoutDashboardSelector();
  renderDashboardManagementPanel();
  renderDashboardList();
}

// ======================================================================
// Dashboard Rendering
// ======================================================================

function renderDashboardList() {

  assertLifecyclePhase(
    LifecyclePhase.READY,
    'renderDashboardList'
  );

  if (!appReady) return;
  const container = document.getElementById('dashboard-list');
  if (!container) return;

  container.innerHTML = '';

  availableDashboards.forEach(({ id, name }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dashboard-item';
    btn.textContent = name;

    if (id === activeDashboardId) {
      btn.classList.add('active-dashboard');
    }

    btn.addEventListener('click', async () => {
      await switchDashboard(id);
      renderDashboardList();
      closeAll();
    });

    container.appendChild(btn);
  });
}

// ======================================================================
// Dashboard Management UI (rename / delete / create)
// ======================================================================

function renderDashboardManagementPanel() {
  const container = document.getElementById('dashboard-management-list');
  if (!container) return;

  container.innerHTML = '';

  // Inline validation error (if any)
  if (dashboardValidationError) {
    const error = document.createElement('div');
    error.className = 'form-error is-visible';
    error.textContent = dashboardValidationError;
    error.style.marginBottom = '0.75rem';
    container.appendChild(error);
  }

  availableDashboards.forEach(({ id, name }) =>{
    const row = document.createElement('div');
    row.className = 'layout-category';

    const header = document.createElement('div');
    header.className = 'layout-category-header';

    let title;

    if (renamingDashboardId === id) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'rename-input';
      input.value = name;

      const wrapper = document.createElement('div');
      wrapper.className = 'rename-wrapper';

      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });

      const save = async () => {
        const newName = input.value.trim();
        if (!newName) return;
        renamingDashboardId = null;
        await renameDashboardDisplayName(id, newName);
      };

      const cancel = () => {
        renamingDashboardId = null;
        renderDashboardManagementPanel();
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          save();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancel();
        }
      });

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'icon-button confirm';
      saveBtn.title = 'Save';
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
      saveBtn.onclick = save;

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'icon-button cancel';
      cancelBtn.title = 'Cancel';
      cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      cancelBtn.onclick = cancel;

      wrapper.append(input, saveBtn, cancelBtn);
      title = wrapper;
    } else {
        const span = document.createElement('span');
        span.className = 'category-title';
        span.textContent = name;
        title = span;
      }

    const actions = document.createElement('div');
    actions.className = 'category-actions';

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'icon-button';
    renameBtn.title = 'Rename dashboard';
    renameBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';

    renameBtn.onclick = () => {
      renamingDashboardId = id;
      renderDashboardManagementPanel();
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'icon-button';
    deleteBtn.title = 'Delete dashboard';
    deleteBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';

    deleteBtn.onclick = () => {
      clearDashboardValidationError();

      openConfirm({
        title: 'Delete dashboard',
        message: `Delete dashboard "${name}"?\nThis will remove the dashboard and all its categories and buttons.`,
        onConfirm: async () => {
          await deleteDashboard(id);
          clearDashboardValidationError();
        }
      });
    };

    actions.append(renameBtn, deleteBtn);
    header.append(title, actions);
    row.appendChild(header);
    container.appendChild(row);
  });
  
  // Inline creation row
  if (isCreatingDashboard) {
    const row = document.createElement('div');
    row.className = 'layout-category';

    const header = document.createElement('div');
    header.className = 'layout-category-header';

    const wrapper = document.createElement('div');
    wrapper.className = 'rename-wrapper';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.placeholder = 'New dashboard name';

    requestAnimationFrame(() => input.focus());

    const confirm = async () => {
      const displayName = input.value.trim();
      if (!displayName) return;

      clearDashboardValidationError();
      isCreatingDashboard = false;

      const id = `dashboard-${Date.now()}`;
      await createAndSwitchDashboard({ id, name: displayName });
    };

    const cancel = () => {
      isCreatingDashboard = false;
      clearDashboardValidationError();
      renderDashboardManagementPanel();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        confirm();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'icon-button confirm';
    confirmBtn.title = 'Create dashboard';
    confirmBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
    confirmBtn.onclick = confirm;

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'icon-button cancel';
    cancelBtn.title = 'Cancel';
    cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    cancelBtn.onclick = cancel;

    wrapper.append(input, confirmBtn, cancelBtn);
    header.appendChild(wrapper);
    row.appendChild(header);
    container.appendChild(row);
  }
}

// ======================================================================
// Default Dashboard Delete Modal Helpers
// ======================================================================

function openDeleteDefaultDashboardModal(dashboardId) {
  deleteDefaultSelect.innerHTML = '';

  const remaining = availableDashboards.filter(
    d => d.id !== dashboardId
  );

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select dashboard…';
  placeholder.disabled = true;
  placeholder.selected = true;

  // Hides it from the opened dropdown list
  placeholder.hidden = true;

  deleteDefaultSelect.appendChild(placeholder);

  remaining.forEach(({ id, name }) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = name;
    deleteDefaultSelect.appendChild(option);
  });

  deleteDefaultOverlay.hidden = false;
  deleteDefaultOverlay.setAttribute('aria-hidden', 'false');

  pushModal(deleteDefaultOverlay, closeDeleteDefaultDashboardModal);

  requestAnimationFrame(() => {
    focusFirstFocusableElement(deleteDefaultOverlay);
  });
}

function closeDeleteDefaultDashboardModal() {
  pendingDefaultDeletionId = null;
  deleteDefaultOverlay.hidden = true;
  deleteDefaultOverlay.setAttribute('aria-hidden', 'true');

  popModal(deleteDefaultOverlay);
}

// ======================================================================
// Dashboard Validation Helpers
// ======================================================================

function setDashboardValidationError(message) {
  dashboardValidationError = message;
  renderDashboardManagementPanel();
}

function clearDashboardValidationError() {
  dashboardValidationError = null;
}

// ======================================================================
// Dashboard Selector Sync Helpers
// ======================================================================

function syncDefaultDashboardSelector() {
  const select = document.getElementById('default-dashboard-select');
  if (!select) return;

  select.innerHTML = '';

  availableDashboards.forEach(({ id, name }) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = name;
    option.selected = id === defaultDashboardId;
    select.appendChild(option);
  });

  select.onchange = async () => {
    const newDefault = select.value;
    if (newDefault === defaultDashboardId) return;

    defaultDashboardId = newDefault;
    await DashboardService.setDefaultDashboardId(newDefault);
  };
}

function syncLayoutDashboardSelector() {
  const select = document.getElementById('layout-dashboard-select');
  if (!select) return;

  select.onchange = null;
  select.innerHTML = '';

  availableDashboards.forEach(({ id, name }) => {
    const option = document.createElement('option');
    option.value = id;

    // Always trust metadata name first
    option.textContent = name || getDashboardDisplayName(id);
    option.selected = id === activeDashboardId;

    select.appendChild(option);
  });

  select.onchange = async () => {
    const selectedId = select.value;
    if (selectedId === activeDashboardId) return;

    await switchDashboard(selectedId);

    if (isPreferencesOpen()) {
      syncLayoutDashboardSelector();
    }
  };
}

// ======================================================================
// Dashboard Display Helpers
// ======================================================================

function getDashboardDisplayName(dashboardId) {
  if (!dashboardId) return 'WebDash';
  if (dashboardState && dashboardState.id === dashboardId) {
    return dashboardState.name || 'WebDash';
  }
  return dashboardId === 'default' ? 'WebDash' : dashboardId;
}

async function finalizeActiveDashboardChange() {
  if (!userPreferences.appearance.identity.syncWithDashboard) return;
  if (!dashboardState) return;

  userPreferences.appearance.identity.name = dashboardState.name;
  await PreferencesService.save(userPreferences);
  applyIdentityToUI();
}

// ======================================================================
// Global Event Wiring (Startup / Static Listeners)
// ======================================================================

deleteDefaultSelect.addEventListener('change', () => {
  deleteDefaultConfirm.disabled = !deleteDefaultSelect.value;
});

deleteDefaultCancel.addEventListener(
  'click',
  closeDeleteDefaultDashboardModal
);

deleteDefaultClose.addEventListener(
  'click',
  closeDeleteDefaultDashboardModal
);

deleteDefaultConfirm.addEventListener('click', async () => {
  const newDefaultId = deleteDefaultSelect.value;
  if (!newDefaultId || !pendingDefaultDeletionId) return;

  // 1. Commit new default locally FIRST
  setDefaultDashboardId(
    newDefaultId,
    'deleteDefaultDashboard (reassign default)'
  );

  // 2. Persist default change to backend
  await DashboardService.setDefaultDashboardId(newDefaultId);

  // At this point:
  // defaultDashboardId exists in availableDashboards
  // invariants hold

  // 3. Now it is SAFE to delete the old default dashboard
  await deleteDashboard(pendingDefaultDeletionId, false);

  closeDeleteDefaultDashboardModal();
});

document
  .getElementById('create-dashboard-btn')
  ?.addEventListener('click', () => {
    isCreatingDashboard = true;
    renderDashboardManagementPanel();
});