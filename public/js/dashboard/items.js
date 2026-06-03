// =====================================
// Create empty button
// =====================================
function createEmptyButton(category) {
  return {
    id: generateId('item'),
    label: 'New button',
    url: '',
    order: category.items.length
  };
}

// =====================================
// Create and add button to category
// =====================================

async function addButtonToCategory(categoryId) {
  const category = pageCategories.find(c => c.id === categoryId); 
  if (!category) return; 

  const newButton = createEmptyButton(category); 
  category.items.push(newButton);

  // normalize order
  category.items.forEach((item, index) => {
    item.order = index;
  });

  await commitDashboardChange('addItem'); 
}

// =====================================
// Delete button
// =====================================
async function deleteButton(itemId) {
  for (const category of pageCategories) {
    const index = category.items.findIndex(item => item.id === itemId);
    if (index !== -1) {
      const item = category.items[index];

      async function performDelete() {
      const latestIndex = category.items.findIndex(
        i => i.id === itemId
      );

      if (latestIndex === -1) return;

      category.items.splice(latestIndex, 1);

      // Re-normalize order after deletion
      category.items.forEach((item, index) => {
        item.order = index;
      });

      await commitDashboardChange('deleteItem');
    }

    if (userPreferences.behavior.confirmDeleteButtons) {
      openConfirm({
        title: 'Delete button',
        message: `Delete button "${item.label}"?\nThis action cannot be undone.`,
        onConfirm: async () => {
          await performDelete();
        }
      });
    } else {
      await performDelete();
    }

      return;
    }
  }
}

// =====================================
// Open Button Editor
// =====================================

function openButtonEditor(context) {
  editingButtonContext = context;

  const overlay = document.getElementById('button-editor-overlay');
  const title = document.getElementById('button-editor-title');
  const labelInput = document.getElementById('button-label-input');
  const urlInput = document.getElementById('button-url-input');
  const errorEl = document.getElementById('button-editor-error');

  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = 'Please enter both a name and a valid URL.';
  }
  
  if (!overlay || !labelInput || !urlInput) return;

  if (context.mode === 'edit') {
    const category = pageCategories.find(c => c.id === context.categoryId);
    const item = category?.items.find(i => i.id === context.itemId);

    if (!item) return;

    title.textContent = 'Edit Button';
    labelInput.value = item.label;
    urlInput.value = item.url;
  } else {
    title.textContent = 'Add Button';
    labelInput.value = '';
    urlInput.value = '';
  }

  // OPEN with animation support
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');

  // Trigger animation (same pattern as before)
  overlay.classList.add('pre-open');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.remove('pre-open');
    });
  });

  pushModal(overlay, closeButtonEditor);

  requestAnimationFrame(() => {
    focusFirstFocusableElement(overlay);
  });
}

function closeButtonEditor() {
  const overlay = document.getElementById('button-editor-overlay');
  if (!overlay) return;

  // Start closing animation
  overlay.classList.add('is-closing');
  overlay.setAttribute('aria-hidden', 'true');

  setTimeout(() => {
    overlay.hidden = true;

    // cleanup
    overlay.classList.remove('is-closing');
    editingButtonContext = null;

    popModal(overlay);
  }, 160);
}

// =====================================
// Rename item (rename button)
// =====================================

async function renameItem(itemId, newLabel) {
  const trimmed = newLabel.trim();
  if (!trimmed) return;

  for (const category of pageCategories) {
    const item = category.items.find(i => i.id === itemId);
    if (item) {
      item.label = trimmed;
      await commitDashboardChange('renameItem');
      return;
    }
  }
}

// =====================================
// Button editor
// =====================================

const buttonEditorForm = document.getElementById('button-editor-form');
const buttonEditorCancel = document.getElementById('button-editor-cancel');
const buttonEditorOverlay = document.getElementById('button-editor-overlay');

function initializeButtonEditorBindings() {
  if (buttonEditorCancel && !buttonEditorCancel._wired) {
    buttonEditorCancel._wired = true;
    buttonEditorCancel.addEventListener('click', closeButtonEditor);
  }

  const closeBtn = buttonEditorOverlay
    ?.querySelector('.modal-close');

  if (closeBtn && !closeBtn._wired) {
    closeBtn._wired = true;
    closeBtn.addEventListener('click', closeButtonEditor);
  }

  if (buttonEditorForm && !buttonEditorForm._wired) {
    buttonEditorForm._wired = true;

    buttonEditorForm.addEventListener('submit', async e => {
      e.preventDefault();

      const nameErrorEl = document.getElementById('button-name-error');
      const urlErrorEl = document.getElementById('button-editor-error');
      const label = document.getElementById('button-label-input').value.trim();
      const url = document.getElementById('button-url-input').value.trim();

      const validation = validateButtonInput({
        label,
        url,
        existingItems: pageCategories.flatMap(c => c.items),
        currentItemId: editingButtonContext?.itemId
      });

      if (nameErrorEl) nameErrorEl.classList.remove('is-visible');
      if (urlErrorEl) urlErrorEl.classList.remove('is-visible');

      if (!validation.valid) {
        if (validation.errors.label && nameErrorEl) {
          nameErrorEl.textContent = validation.errors.label;
          nameErrorEl.classList.add('is-visible');
        }

        if (validation.errors.url && urlErrorEl) {
          urlErrorEl.textContent = validation.errors.url;
          urlErrorEl.classList.add('is-visible');
        }

        return;
      }

      if (!editingButtonContext) return;

      const normalizedUrl = validation.normalizedUrl;

      if (editingButtonContext.mode === 'create') {
        const category = pageCategories.find(
          c => c.id === editingButtonContext.categoryId
        );
        if (!category) return;

        category.items.push({
          id: generateId('item'),
          label,
          url: normalizedUrl
        });

        category.items.forEach((item, index) => {
          item.order = index;
        });

        await commitDashboardChange('createItem');
      } else {
        const category = pageCategories.find(
          c => c.id === editingButtonContext.categoryId
        );
        const item = category?.items.find(
          i => i.id === editingButtonContext.itemId
        );
        if (!item) return;

        item.label = label;
        item.url = normalizedUrl;
        await commitDashboardChange('updateItem');
      }

      closeButtonEditor();
    });
  }
}