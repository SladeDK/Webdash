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