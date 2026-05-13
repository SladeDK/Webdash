// =====================================
// Create empty button
// =====================================
function createEmptyButton() {
  return {
    id: generateId('item'),
    label: 'New button',
    url: ''
  };
}

// =====================================
// Create and add button to category
// =====================================

async function addButtonToCategory(categoryId) {
  const category = pageCategories.find(c => c.id === categoryId);
  if (!category) return;

  const newButton = createEmptyButton();
  category.items.push(newButton);
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

      openConfirm({
        title: 'Delete button',
        message: `Delete button "${item.label}"?\nThis action cannot be undone.`,
        onConfirm: async () => {
          const latestIndex = category.items.findIndex(
            i => i.id === itemId
          );
          if (latestIndex === -1) return;

          category.items.splice(latestIndex, 1);

          await commitDashboardChange('deleteItem');
        }
      });

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

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');

  pushModal(overlay, closeButtonEditor);

  requestAnimationFrame(() => {
    focusFirstFocusableElement(overlay);
  });
}

function closeButtonEditor() {
  const overlay = document.getElementById('button-editor-overlay');
  if (!overlay) return;

  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  editingButtonContext = null;

  popModal(overlay);
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

buttonEditorCancel?.addEventListener('click', closeButtonEditor);
buttonEditorOverlay
  ?.querySelector('.modal-close')
  ?.addEventListener('click', closeButtonEditor);

buttonEditorForm?.addEventListener('submit', async e => {
  const nameErrorEl = document.getElementById('button-name-error');
  const urlErrorEl = document.getElementById('button-editor-error');
  const label = document.getElementById('button-label-input').value.trim();
  const url = document.getElementById('button-url-input').value.trim();

  // Reset errors
  if (nameErrorEl) nameErrorEl.classList.remove('is-visible');
  if (urlErrorEl) urlErrorEl.classList.remove('is-visible');

  e.preventDefault();
  if (!editingButtonContext) return;

  let hasErrors = false;

  /* ---- NAME: required ---- */
  if (!label) {
    hasErrors = true;
    if (nameErrorEl) {
      nameErrorEl.textContent = 'Button name is required.';
      nameErrorEl.classList.add('is-visible');
    }
  }

  /* ---- NAME: duplicate (only if name exists) ---- */
  if (label) {
    const duplicateName = pageCategories.some(category =>
      category.items.some(item =>
        item.label.toLowerCase() === label.toLowerCase() &&
        item.id !== editingButtonContext?.itemId
      )
    );

    if (duplicateName) {
      hasErrors = true;
      if (nameErrorEl) {
        nameErrorEl.textContent = 'A button with this name already exists.';
        nameErrorEl.classList.add('is-visible');
      }
    }
  }

  /* ---- URL: required ---- */
  if (!url) {
    hasErrors = true;
    if (urlErrorEl) {
      urlErrorEl.textContent = 'URL is required.';
      urlErrorEl.classList.add('is-visible');
    }
  }

  /* ---- Stop if ANY errors were found ---- */
  if (hasErrors) {
    return;
  }

  let normalizedUrl = url;

  // Add https:// if no protocol is present
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }
  
  // Basic URL sanity check: must contain a dot after protocol
  try {
    const parsed = new URL(normalizedUrl);
    const hostname = parsed.hostname;

    // Require at least one dot and a valid TLD (min 2 chars)
    const hostnameIsValid =
      /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i
        .test(hostname);

    if (!hostnameIsValid) {
      throw new Error('Invalid hostname');
    }
  } catch {
    const errorEl = document.getElementById('button-editor-error');
    if (errorEl) {
      errorEl.textContent = 'Please enter a valid URL (e.g. example.com)';
      errorEl.classList.add('is-visible');
    }
    return;
  }

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
  DashboardService.save(dashboardState);  
  renderCategories(pageCategories);
  renderLayoutEditor(pageCategories);

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