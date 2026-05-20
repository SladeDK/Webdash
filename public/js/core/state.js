// =====================================================
// WebDash System Invariants (Authoritative)
// =====================================================
//
// These invariants define conditions that MUST always
// hold true for the application to behave correctly.
// They are relied upon across dashboard, UI, keyboard,
// and modal subsystems.
//
// These are declarative only. Enforcement comes later.
//
// -----------------------------------------------------
//
// DASHBOARD STATE
// -----------------------------------------------------
//
// INVARIANT: There must always be at least one dashboard.
// INVARIANT: There must always be exactly one default dashboard.
// INVARIANT: There must always be exactly one active dashboard.
// INVARIANT: activeDashboardId MUST reference an ID present in availableDashboards.
// INVARIANT: dashboardState.id MUST equal activeDashboardId once appReady === true.
// INVARIANT: pageCategories MUST reference dashboardState.categories.
//
// -----------------------------------------------------
// UI / OVERLAYS
// -----------------------------------------------------
//
// INVARIANT: At most one dropdown menu may be open at any time.
// INVARIANT: Only the top modal in the modal stack may receive input.
// INVARIANT: Dropdowns MUST close when a modal opens.
//
// -----------------------------------------------------
// INPUT / KEYBOARD
// -----------------------------------------------------
//
// INVARIANT: Escape key closes the highest‑priority UI layer in order:
//            1. Inline rename (no action)
//            2. Top modal
//            3. Open dropdowns
//
// -----------------------------------------------------
// LIFECYCLE
// -----------------------------------------------------
//
// INVARIANT: No UI rendering depending on dashboard state may occur
//            before appReady === true.
// INVARIANT: userPreferences MUST be loaded before identity sync runs.
//
// =====================================================

// =====================================================
// WebDash State Ownership & Mutation Authority
// =====================================================
//
// This file defines shared, cross-module application state.
// Mutation of this state is NOT free-form.
//
// The following rules define which modules are allowed
// to MUTATE specific pieces of state. All other modules
// must treat these values as READ-ONLY.
//
// Violating these rules is considered an architectural error,
// even if the runtime behavior appears to work.
//
// -----------------------------------------------------
// DASHBOARD STATE
// -----------------------------------------------------
// activeDashboardId
// defaultDashboardId
// availableDashboards
// dashboardState
// pageCategories
//
// May be mutated ONLY by:
//    - dashboard/dashboards.js
//
// -----------------------------------------------------
// UI EDITOR STATE
// -----------------------------------------------------
// renamingDashboardId
// renamingCategoryId
// renamingItemId
// isCreatingDashboard
// pendingDefaultDeletionId
// dashboardValidationError
//
// May be mutated by:
//    - dashboard/dashboards.js
//    - dashboard/categories.js
//    - dashboard/items.js
//
// -----------------------------------------------------
// DRAG & DROP STATE
// -----------------------------------------------------
// draggedCategoryId
// draggedItemContext
//
// May be mutated ONLY by:
//    - interactions/drag-drop.js
//
// -----------------------------------------------------
// UI OVERLAY STATE
// -----------------------------------------------------
// (No direct shared state; overlays are stack-managed)
//
// Modal stack is owned by:
//    - ui/modals.js
//
// Dropdown visibility is owned by:
//    - ui/dropdowns.js
//
// -----------------------------------------------------
// APPLICATION LIFECYCLE
// -----------------------------------------------------
// appReady
// userPreferences
//
// May be mutated ONLY by:
//    - core/init.js
//    - ui/preferences.js
//
// -----------------------------------------------------
// RULE OF THUMB
// -----------------------------------------------------
// If a module needs to change state it does NOT own,
// it must call an owning module’s API function.
//
// Direct mutation outside ownership boundaries
// is forbidden by design.
// =====================================================

const __DEV__ = true;

// ============================
// Global application state
// ============================

// Miscellaneous / editor state
let renamingCategoryId = null;
let renamingItemId = null;
let editingButtonContext = null;

// Drag & drop state
let draggedCategoryId = null;
let draggedItemContext = null;

// Dashboard data state
let dashboardState = null;
let pageCategories = null;

// Preferences / behavior state
let autoCloseDropdowns;

// Dashboard identity & selection
let activeDashboardId = null;
let defaultDashboardId = null;
let availableDashboards = [];

// Dashboard management UI state
let pendingDefaultDeletionId = null;
let isCreatingDashboard = false;
let renamingDashboardId = null;
let dashboardValidationError = null;

// App lifecycle state
let appReady = false;
let userPreferences = null;

// =====================================================
// Application lifecycle phases
// =====================================================
//
// These phases define when different parts of the system
// are allowed to run.
//
// Violating lifecycle order is a developer error.
//
const LifecyclePhase = {
  BOOTSTRAPPING: 'BOOTSTRAPPING',
  PREFERENCES_LOADED: 'PREFERENCES_LOADED',
  DASHBOARDS_LOADED: 'DASHBOARDS_LOADED',
  READY: 'READY'
};

// Current lifecycle phase (dev-visible)
let lifecyclePhase = LifecyclePhase.BOOTSTRAPPING;

// =====================================================
// State mutation API — Dashboard identity
// =====================================================

// NOTE:
// This function is the ONLY approved way to change
// activeDashboardId going forward.
//
// Direct assignment (activeDashboardId = …)
// outside dashboard/dashboards.js is forbidden by design.

function setActiveDashboardId(nextId, context = '') {
  // Dev safety: catch accidental misuse early
  if (__DEV__) {
    if (!nextId) {
      throw new Error(
        `[State Mutation Error] setActiveDashboardId called with invalid value (${context})`
      );
    }
  }

  
  activeDashboardId = nextId;
  assertSystemInvariants(`setActiveDashboardId${context ? `: ${context}` : ''}`);
}


// =====================================================
// State mutation API — Default dashboard identity
// =====================================================
//
// This function is the ONLY approved way to change
// defaultDashboardId going forward.
//
// Direct assignment (defaultDashboardId = …)
// outside dashboard/dashboards.js is forbidden by design.
function setDefaultDashboardId(nextId, context = '') {
  if (__DEV__) {
    if (!nextId) {
      throw new Error(
        `[State Mutation Error] setDefaultDashboardId called with invalid value (${context})`
      );
    }
  }

  
  defaultDashboardId = nextId;
  assertSystemInvariants(`setDefaultDashboardId${context ? `: ${context}` : ''}`);
}


// =====================================================
// State mutation API — Available dashboards
// =====================================================
//
// These functions are the ONLY approved way to structurally
// modify availableDashboards going forward.
//
// Direct mutation (push / reassignment / filter)
// outside dashboard/dashboards.js is forbidden by design.
function addAvailableDashboard({ id, name }, context = '') {
  if (__DEV__) {
    if (!id || !name) {
      throw new Error(
        `[State Mutation Error] addAvailableDashboard received invalid data (${context})`
      );
    }

    if (availableDashboards.some(d => d.id === id)) {
      throw new Error(
        `[State Mutation Error] Duplicate dashboard id "${id}" (${context})`
      );
    }
  }

  availableDashboards.push({ id, name });
}

function replaceAvailableDashboards(nextDashboards, context = '') {
  if (__DEV__) {
    if (!Array.isArray(nextDashboards)) {
      throw new Error(
        `[State Mutation Error] replaceAvailableDashboards expects an array (${context})`
      );
    }
  }

  availableDashboards = nextDashboards;
  assertSystemInvariants(`replaceAvailableDashboards${context ? `: ${context}` : ''}`);
}


// =====================================================
// Lifecycle assertions (dev-time)
// =====================================================
function assertLifecyclePhase(requiredPhase, context = '') {
  if (!__DEV__) return;

  if (lifecyclePhase !== requiredPhase) {
    throw new Error(
      `[Lifecycle Error] Expected phase "${requiredPhase}", but current phase is "${lifecyclePhase}" (${context})`
    );
  }
}

// =====================================================
// Dev-only invariant enforcement
// =====================================================
function assertInvariant(condition, message) {
  if (!__DEV__) return;
  if (!condition) {
    throw new Error(`[Invariant Violation] ${message}`);
  }
}

/**
 * Asserts all critical WebDash system invariants.
 * Must be called ONLY at safe synchronization points.
 */
function assertSystemInvariants(context = '') {
  if (!__DEV__) return;

  const ctx = context ? ` (${context})` : '';

  // --------------------------------------------------
  // Dashboard identity invariants
  // --------------------------------------------------
  assertInvariant(
    activeDashboardId !== null,
    `activeDashboardId is null${ctx}`
  );

  assertInvariant(
    defaultDashboardId !== null,
    `defaultDashboardId is null${ctx}`
  );

  assertInvariant(
    availableDashboards.some(d => d.id === activeDashboardId),
    `activeDashboardId "${activeDashboardId}" does not exist in availableDashboards${ctx}`
  );

  assertInvariant(
    availableDashboards.some(d => d.id === defaultDashboardId),
    `defaultDashboardId "${defaultDashboardId}" does not exist in availableDashboards${ctx}`
  );

  // --------------------------------------------------
  // Ready-phase invariants
  // --------------------------------------------------
  if (appReady) {
    assertInvariant(
      dashboardState !== null,
      `dashboardState is null after appReady === true${ctx}`
    );

    assertInvariant(
      dashboardState.id === activeDashboardId,
      `dashboardState.id ("${dashboardState.id}") does not match activeDashboardId ("${activeDashboardId}")${ctx}`
    );

    // pageCategories MUST reference dashboardState.categories
    assertInvariant(
      pageCategories === dashboardState.categories,
      `pageCategories is not the same reference as dashboardState.categories${ctx}`
    );
  }

  // --------------------------------------------------
  // Lifecycle sanity
  // --------------------------------------------------
  assertInvariant(
    lifecyclePhase !== null,
    `lifecyclePhase is null${ctx}`
  );
}