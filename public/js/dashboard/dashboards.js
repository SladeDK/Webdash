
//  * dashboards.js rendering and management UI * dashboards.js
//  * - Default dashboard handling
//  * - Selector synchronization
//  *
//  * This file coordinates dashboard state with UI rendering
//  * and persistence services. Structural layout is intentional
//  * and should be considered stable.

// =====================================================
// Dashboard state & constants
// =====================================================

let draggedDashboardId = null;
let lastDashboardDragDirection = null;
let lastDashboardDragTarget = null;
let isReorderingDashboards = false;
let pendingDashboardReorder = null;

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
  let newDashboardState = await DashboardService.load();

  if (!newDashboardState) {
    console.warn(
      `[WebDash] Dashboard "${dashboardId}" had no state. Recreating default dashboard state.`
    );

    const meta = availableDashboards.find(d => d.id === dashboardId);
    const name = meta?.name ?? 'Dashboard';

    newDashboardState = getDefaultDashboardTemplate({
      id: dashboardId,
      name
    });

    await DashboardService.save(newDashboardState);
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

async function processDashboardReorderQueue() {
  if (isReorderingDashboards) return;
  if (!pendingDashboardReorder) return;

  isReorderingDashboards = true;

  const payload = pendingDashboardReorder;
  pendingDashboardReorder = null;

  try {
    await fetch('/api/dashboards/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error('[Dashboard Reorder] Failed to persist order', err);
  } finally {
    isReorderingDashboards = false;

    // If user dragged again while saving → process next
    if (pendingDashboardReorder) {
      processDashboardReorderQueue();
    }
  }
}

function queueDashboardReorderSave() {

  // Remove transient order field from runtime state (not part of source of truth)
  availableDashboards.forEach(d => {
    if (typeof d.order !== 'undefined') {
      delete d.order;
    }
  });

  // Backend order is always derived from index
  pendingDashboardReorder = availableDashboards.map((d, index) => ({
    id: d.id,
    order: index
  }));

  processDashboardReorderQueue();
}

async function reorderDashboardsAdvanced(sourceId, targetId, insertBefore) {
  const sourceIndex = availableDashboards.findIndex(d => d.id === sourceId);
  const targetIndex = availableDashboards.findIndex(d => d.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1) return;

  // Clone for safe mutation
  const next = [...availableDashboards];
  const [moved] = next.splice(sourceIndex, 1);

  let insertIndex = targetIndex;

  if (sourceIndex < targetIndex) {
    insertIndex--;
  }

  if (!insertBefore) {
    insertIndex++;
  }

  next.splice(insertIndex, 0, moved);

  // Replace state (single source of truth)
  replaceAvailableDashboards(next, 'reorderDashboardsAdvanced');

  // DEV SAFETY: catch regressions immediately
  if (__DEV__) {
    console.assert(
      new Set(availableDashboards.map(d => d.id)).size === availableDashboards.length,
      "[Invariant Violation] Duplicate dashboards after reorder"
    );
  }

  // Update DOM immediately (UI feedback)
  const container = document.getElementById('dashboard-management-list');

  if (container) {
    const rows = Array.from(container.children);

    const sourceRow = rows.find(el => el.dataset.dashboardId === sourceId);
    const targetRow = rows.find(el => el.dataset.dashboardId === targetId);

    if (sourceRow && targetRow) {
      if (insertBefore) {
        container.insertBefore(sourceRow, targetRow);
      } else {
        container.insertBefore(sourceRow, targetRow.nextSibling);
      }
    }
  }

  // Sync UI controls
  syncDashboardUI();

  // Persist order (derived from index only)
  queueDashboardReorderSave();
}

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

  // Hydrate local state FIRST
  dashboardState = template;
  pageCategories = template.categories;

  // add to availableDashboards FIRST
  addAvailableDashboard({
    id,
    name
  }, 'createAndSwitchDashboard');

  // set active dashboard
  setActiveDashboardId(id, 'createAndSwitchDashboard');

  // Normalize order immediately after adding
  const normalized = availableDashboards.map((d, index) => ({
    ...d,
    order: index
  }));

  replaceAvailableDashboards(normalized, 'createAndSwitchDashboard');

  // Sync order to backend (single source of truth)
  queueDashboardReorderSave();

  // Identity transaction
  await commitPrehydratedDashboard(id, 'createAndSwitchDashboard');

  // UI bookkeeping (not identity)
  syncDashboardUI();
  renderDashboardManagementPanel();
}

async function deleteDashboard(dashboardId, autoSwitch = true) {
  const dashboard = availableDashboards.find(d => d.id === dashboardId);
  const dashboardName = dashboard?.name ?? 'Dashboard';
  if (availableDashboards.length <= 1) {
    showToast({
      title: 'Dashboard deletion failed',
      lines: [
        `The dashboard "${dashboardName}" could not be deleted.`,
        'You must have at least one dashboard.'
      ],
      type: 'error',
      duration: 5000
    });
    return;
  }

  const isDefault = dashboardId === defaultDashboardId;
  const remainingDashboards =
    availableDashboards.filter(d => d.id !== dashboardId);

  if (isDefault && remainingDashboards.length > 1) {
    pendingDefaultDeletionId = dashboardId;

    // First close confirm modal properly
    closeConfirm();

    // Then open next modal AFTER animation finishes
    setTimeout(() => {
      openDeleteDefaultDashboardModal(dashboardId);
    }, 160);

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

    showToast({
      title: 'Dashboard deletion failed',
      lines: [
        `The dashboard "${dashboardName}" could not be deleted.`,
        'Please try again.'
      ],
      type: 'error',
      duration: 5000
    });

    return;
  }

  // Ensure defaultDashboardId is valid BEFORE structural mutation
  if (dashboardId === defaultDashboardId) {
    // At this point, a new default MUST exist
    // Prefer the first remaining dashboard
    defaultDashboardId = remainingDashboards[0].id;
  }

  const normalized = remainingDashboards.map((d, index) => ({
    ...d,
    order: index
  }));

  replaceAvailableDashboards(normalized, 'deleteDashboard');

  // Ensure backend is updated with new order
  queueDashboardReorderSave();

  syncDashboardUI();
  renderDashboardManagementPanel();

  // await finalizeActiveDashboardChange();

  // pendingDefaultDeletionId = null;

  assertSystemInvariants('after deleteDashboard');
  showToast({
    title: 'Dashboard deleted',
    lines: [
      `The dashboard "${dashboardName}" was deleted successfully.`
    ],
    type: 'success',
    duration: 5000
  });
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

    if (dashboardState.identity) {
      dashboardState.identity.name = trimmed;
    }
  }

  renamingDashboardId = null;

  syncDashboardUI();
  renderDashboardManagementPanel();
  await finalizeActiveDashboardChange();
}

// ======================================================================
// Dashboard Rendering
// ======================================================================

function syncDashboardUI() {
  syncDefaultDashboardSelector();
  syncLayoutDashboardSelector();
  renderDashboardList();
}

function updateActiveDashboardUI(dashboardId) {
  const buttons = document.querySelectorAll('.dashboard-item');

  buttons.forEach(btn => {
    if (btn.textContent === getDashboardDisplayName(dashboardId)) {
      btn.classList.add('active-dashboard');
    } else {
      btn.classList.remove('active-dashboard');
    }
  });
}

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
      // Immediate feedback
      updateActiveDashboardUI(id);

      // Show loading state
      document.body.classList.add('dashboard-loading');

      // Perform switch
      await switchDashboard(id);

      // Allow DOM to update before removing loading state
      requestAnimationFrame(() => {
        document.body.classList.remove('dashboard-loading');
      });

      // Final UI sync
      renderDashboardList();

      closeAllDropdowns();
    });

    container.appendChild(btn);
  });
}

function setupDashboardDragAndDrop(container) {

  // DRAG START / END
  container.querySelectorAll('.layout-dashboard .drag-handle').forEach(handle => {
    const row = handle.closest('.layout-dashboard');
    const id = row?.dataset.dashboardId;
    if (!id) return;

    handle.draggable = true;

    handle.addEventListener('dragstart', e => {
      e.stopPropagation();

      draggedDashboardId = id;
      row.classList.add('is-dragging');

      document.body.classList.add('drag-active');

      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    });

    handle.addEventListener('dragend', () => {
      draggedDashboardId = null;
      lastDashboardDragDirection = null;
      lastDashboardDragTarget = null;

      row.classList.remove('is-dragging');
      document.body.classList.remove('drag-active');

      container.querySelectorAll(
        '.layout-dashboard.drag-over, .layout-dashboard.drag-over-top, .layout-dashboard.drag-over-bottom'
      ).forEach(el => {
        el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
      });
    });
  });

  // DRAG OVER
  container.addEventListener('dragover', e => {
    if (!draggedDashboardId) return;
    e.preventDefault();

    const target = e.target.closest('.layout-dashboard');
    if (!target || target.dataset.dashboardId === draggedDashboardId) return;

    const rect = target.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;

    let direction = e.clientY < midpoint ? 'top' : 'bottom';

    // ONLY update if something actually changed
    if (
      target === lastDashboardDragTarget &&
      direction === lastDashboardDragDirection
    ) {
      return;
    }

    // Clear only the previous target (NOT everything)
    if (lastDashboardDragTarget) {
      lastDashboardDragTarget.classList.remove(
        'drag-over',
        'drag-over-top',
        'drag-over-bottom'
      );
    }

    lastDashboardDragTarget = target;
    lastDashboardDragDirection = direction;

    target.classList.add('drag-over');

    if (direction === 'top') {
      target.classList.add('drag-over-top');
    } else {
      target.classList.add('drag-over-bottom');
    }
  });

  // DROP
  container.addEventListener('drop', e => {
    if (!draggedDashboardId) return;

    e.preventDefault();

    const target = e.target.closest('.layout-dashboard');
    if (!target) return;

    const targetId = target.dataset.dashboardId;
    if (!targetId || targetId === draggedDashboardId) return;

    // determine insert position from actual mouse position
    const rect = target.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;

    const insertBefore = e.clientY < midpoint;

    // Cleanup visuals
    container.querySelectorAll(
      '.layout-dashboard.drag-over, .layout-dashboard.drag-over-top, .layout-dashboard.drag-over-bottom'
    ).forEach(el => {
      el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
    });

    lastDashboardDragTarget = null;
    lastDashboardDragDirection = null;

    // Call reorder with correct value
    reorderDashboardsAdvanced(
      draggedDashboardId,
      targetId,
      insertBefore
    );
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
    row.className = 'layout-category layout-dashboard';
    row.dataset.dashboardId = id;

    const header = document.createElement('div');
    header.className = 'layout-category-header';
    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    dragHandle.textContent = '☰';

    header.appendChild(dragHandle);

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

      // Cancel on blur (click outside)
      input.addEventListener('blur', () => {
        cancel();
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

      // Prevent blur firing before button clicks
      wrapper.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });

      wrapper.append(input, saveBtn, cancelBtn);
      title = wrapper;
    } else {
      const titleSlot = document.createElement('div');
      titleSlot.className = 'category-title-slot';

      const span = document.createElement('span');
      span.className = 'category-title';
      span.textContent = name;

      titleSlot.appendChild(span);

      // click-to-edit
      titleSlot.addEventListener('click', (e) => {
        // Prevent conflicts with future drag handle
        if (e.target.closest('.drag-handle')) return;

        renamingDashboardId = id;
        renderDashboardManagementPanel();
      });

      title = titleSlot;
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

      const id = generateId('dashboard');
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
  setupDashboardDragAndDrop(container);
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
  placeholder.hidden = true;

  deleteDefaultSelect.appendChild(placeholder);

  remaining.forEach(({ id, name }) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = name;
    deleteDefaultSelect.appendChild(option);
  });

  const overlay = deleteDefaultOverlay;
  if (!overlay) return;

  // OPEN with animation support
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');

  // Trigger animation (same pattern as others)
  overlay.classList.add('pre-open');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.remove('pre-open');
    });
  });

  pushModal(overlay, closeDeleteDefaultDashboardModal);

  requestAnimationFrame(() => {
    focusFirstFocusableElement(overlay);
  });
}

function closeDeleteDefaultDashboardModal() {
  const overlay = deleteDefaultOverlay;
  if (!overlay) return;

  pendingDefaultDeletionId = null;

  // Start closing animation
  overlay.classList.add('is-closing');
  overlay.setAttribute('aria-hidden', 'true');

  // Delay removal
  setTimeout(() => {
    overlay.hidden = true;

    // cleanup
    overlay.classList.remove('is-closing');

    popModal(overlay);
  }, 160);
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

    // Re-render dashboard list to update highlighting
    renderDashboardList();

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
  // Always update UI when dashboard changes
  if (!dashboardState || !dashboardState.identity) {
    applyIdentityToUI();
    return;
  }

  // Apply sync logic ONLY when enabled
  if (userPreferences.appearance.identity.syncWithDashboard) {
    dashboardState.identity.name = dashboardState.name;
    await DashboardService.save(dashboardState);
  }

  applyIdentityToUI();
}

// ======================================================================
// Global Event Wiring (Startup / Static Listeners)
// ======================================================================

function initializeDashboardUIBindings() {
  if (deleteDefaultSelect && !deleteDefaultSelect._wired) {
    deleteDefaultSelect._wired = true;

    deleteDefaultSelect.addEventListener('change', () => {
      deleteDefaultConfirm.disabled = !deleteDefaultSelect.value;
    });
  }

  if (deleteDefaultCancel && !deleteDefaultCancel._wired) {
    deleteDefaultCancel._wired = true;
    deleteDefaultCancel.addEventListener(
      'click',
      closeDeleteDefaultDashboardModal
    );
  }

  if (deleteDefaultClose && !deleteDefaultClose._wired) {
    deleteDefaultClose._wired = true;
    deleteDefaultClose.addEventListener(
      'click',
      closeDeleteDefaultDashboardModal
    );
  }

  if (deleteDefaultConfirm && !deleteDefaultConfirm._wired) {
    deleteDefaultConfirm._wired = true;

    deleteDefaultConfirm.addEventListener('click', async () => {
      const newDefaultId = deleteDefaultSelect.value;

      if (!newDefaultId || !pendingDefaultDeletionId) return;

      setDefaultDashboardId(
        newDefaultId,
        'deleteDefaultDashboard (reassign default)'
      );

      await DashboardService.setDefaultDashboardId(newDefaultId);

      await deleteDashboard(pendingDefaultDeletionId, false);

      syncDefaultDashboardSelector();
      syncLayoutDashboardSelector();
      renderDashboardList();
      renderDashboardManagementPanel();

      closeDeleteDefaultDashboardModal();
    });
  }

  const createBtn = document.getElementById('create-dashboard-btn');

  if (createBtn && !createBtn._wired) {
    createBtn._wired = true;

    createBtn.addEventListener('click', () => {
      isCreatingDashboard = true;
      renderDashboardManagementPanel();
    });
  }
}