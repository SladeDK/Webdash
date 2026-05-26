// =====================================
// Create empty category
// =====================================

function createEmptyCategory(categories) {
  return {
    id: generateId('category'),
    title: 'New Category',
    order: categories.length,
    items: []
  };
}

// =====================================
// Add category
// =====================================

async function addCategory() {
  const newCategory = createEmptyCategory(pageCategories);
  pageCategories.push(newCategory);

  await commitDashboardChange('addCategory');
}

// =====================================
// Delete category
// =====================================
async function deleteCategory(categoryId) {
  const category = pageCategories.find(c => c.id === categoryId);
  if (!category) return;

  openConfirm({
    title: 'Delete category',
    message: `Delete category "${category.title}"?\nThis will remove the category and all its buttons.`,
    onConfirm: async () => {
      const index = pageCategories.findIndex(c => c.id === categoryId);
      if (index === -1) return;

      pageCategories.splice(index, 1);
      pageCategories.forEach((c, i) => {
        c.order = i;
      });
      await commitDashboardChange('deleteCategory');
    }
  });
}

// =====================================
// Rename category
// =====================================

async function renameCategory(categoryId, newTitle) {
  const category = pageCategories.find(c => c.id === categoryId);
  if (!category) return;

  const trimmed = newTitle.trim();
  if (!trimmed) return;

  category.title = trimmed;
  await commitDashboardChange('renameCategory');
}

// =====================================
// Toggle category visibility
// =====================================

async function toggleCategoryVisibility(categoryId) {
  const category = pageCategories.find(c => c.id === categoryId);
  if (!category) return;

  category.visible = category.visible === false ? true : false;
  await commitDashboardChange('toggleCategoryVisibility');
}

// =====================================
// Reorder categories
// =====================================
async function reorderCategories(sourceId, targetId) {
  const sourceIndex = pageCategories.findIndex(c => c.id === sourceId);
  const targetIndex = pageCategories.findIndex(c => c.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1) return;

  const [moved] = pageCategories.splice(sourceIndex, 1);
  pageCategories.splice(targetIndex, 0, moved);
  pageCategories.forEach((c, i) => {
    c.order = i;
  });
  await commitDashboardChange('reorderCategories');
}