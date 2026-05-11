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