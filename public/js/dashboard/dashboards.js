
//  * dashboards.js rendering and management UI * dashboards.js
//  * - Default dashboard handling
//  * - Selector synchronization
//  *
//  * This file coordinates dashboard state with UI rendering
//  * and persistence services. Structural layout is intentional
//  * and should be considered stable.


// ======================================================================
// Dashboard lifecycle / core actions
// ======================================================================

async function switchDashboard(dashboardId) {
  if (dashboardId === activeDashboardId) return;

  await DashboardService.setActiveDashboardId(dashboardId);

  activeDashboardId = dashboardId;

  const newDashboardState = await DashboardService.load();
  if (!newDashboardState) {
    console.warn('[WebDash] Switched dashboard has no data');
    return;
  }

  dashboardState = newDashboardState;
  pageCategories = dashboardState.categories;
  
  applyDashboardAppearance();
  
  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);
  
  
  if (isPreferencesOpen()) {
    syncLayoutDashboardSelector();
  }

  await finalizeActiveDashboardChange();
}

async function createAndSwitchDashboard({ id, name }) {
  const template = getDefaultDashboardTemplate({ id, name });

  await DashboardService.createDashboard({
    id: template.id,
    name: template.name
  });

  // Persist default layout immediately
  dashboardState = template;
  await DashboardService.save(dashboardState);

  availableDashboards.push({ id, name });

  activeDashboardId = id;

  const newDashboardState = await DashboardService.load();
  dashboardState = newDashboardState;
  pageCategories = dashboardState.categories;

  syncLayoutDashboardSelector();
  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);
  syncDefaultDashboardSelector();
  renderDashboardList();
  renderDashboardManagementPanel();
  await finalizeActiveDashboardChange();
}

async function deleteDashboard(dashboardId, autoSwitch = true) {
  // Must always have at least one dashboard
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

  // Perform backend delete
  const res = await fetch(`/api/dashboards/${dashboardId}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    console.error('[WebDash] Failed to delete dashboard', dashboardId);
    return;
  }

  // Update local dashboard metadata
  availableDashboards = remainingDashboards;

  // If default was deleted and one dashboard remains
  if (isDefault && remainingDashboards.length === 1) {
    defaultDashboardId = remainingDashboards[0].id;
    await DashboardService.setDefaultDashboardId(defaultDashboardId);
  }

  // If active dashboard was deleted then fallback to default
  if (dashboardId === activeDashboardId) {
    activeDashboardId = defaultDashboardId;
    await DashboardService.setActiveDashboardId(activeDashboardId);

    const newDashboardState = await DashboardService.load();
    dashboardState = newDashboardState;
    pageCategories = dashboardState.categories;

    renderCategories(pageCategories);
    renderLayoutEditor(pageCategories);
    await finalizeActiveDashboardChange();
  }

  syncDefaultDashboardSelector();
  syncLayoutDashboardSelector();
  renderDashboardManagementPanel();
  renderDashboardList();
  
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

  // Sync identity name if enabled AND this is the active dashboard
  // if (
  //   dashboardState &&
  //   dashboardState.id === dashboardId &&
  //   userPreferences.appearance.identity.syncWithDashboard
  // ) {
  //   userPreferences.appearance.identity.name = trimmed;
  //   await PreferencesService.save(userPreferences);
  //   applyIdentityToUI();
  // }

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

  // Assign new default first
  defaultDashboardId = newDefaultId;
  await DashboardService.setDefaultDashboardId(newDefaultId);

  // Now delete the old default
  await deleteDashboard(pendingDefaultDeletionId, false);

  closeDeleteDefaultDashboardModal();
});

document
  .getElementById('create-dashboard-btn')
  ?.addEventListener('click', () => {
    isCreatingDashboard = true;
    renderDashboardManagementPanel();
});