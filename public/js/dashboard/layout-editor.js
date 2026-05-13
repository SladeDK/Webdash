
//  * dashboard/layout-editor.js
//  UI:
//  * - Category rendering & editing
//  * - Item rendering & editing
//  * - Drag-and-drop for categories and items
//  * - Editor-only reorder helpers

// =====================================================
// Editor state & constants
// =====================================================

const SCROLL_ZONE  = 60;  // px from edge that triggers scrolling
const SCROLL_SPEED = 10;  // px per frame at full speed

// =====================================================
// Reorder helpers / mutation helpers
// =====================================================

async function reorderItems(categoryId, sourceItemId, targetItemId) {
  const category = pageCategories.find(c => c.id === categoryId);
  if (!category) return;

  const sourceIndex = category.items.findIndex(i => i.id === sourceItemId);
  const targetIndex = category.items.findIndex(i => i.id === targetItemId);

  if (sourceIndex === -1 || targetIndex === -1) return;

  const [moved] = category.items.splice(sourceIndex, 1);
  category.items.splice(targetIndex, 0, moved);
  await commitDashboardChange('reorderItems');
}

// =====================================================
// Dashboard rendering (non-editor view)
// =====================================================

function renderCategories(categories) {
  if (!appReady) return;
  const container = document.querySelector('.categories');
  if (!container) return;

  container.innerHTML = '';

  categories
    .filter(category => category.visible !== false)
    .sort((a, b) => a.order - b.order)
    .forEach(category => {
      const categoryEl = document.createElement('section');
      categoryEl.className = 'category';
      categoryEl.dataset.categoryId = category.id;

      categoryEl.innerHTML = `
        <h2 class="category-title">${category.title}</h2>
        <div class="buttons"></div>
      `;

      const buttonsEl = categoryEl.querySelector('.buttons');

      category.items.forEach(item => {
        const link = document.createElement('a');
        link.href = item.url;
        link.textContent = item.label;
        link.dataset.itemId = item.id;
        if (userPreferences.behavior.openLinksInNewTab) {
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        } else {
          link.removeAttribute('target');
          link.removeAttribute('rel');
        }
        buttonsEl.appendChild(link);
      });

      container.appendChild(categoryEl);
    });
}

// =====================================================
// Layout editor rendering (UI build)
// =====================================================

function buildLayoutEditorDOM(container, categories) {
  container.innerHTML = '';

  categories
    .sort((a, b) => a.order - b.order)
    .forEach(category => {
      const categoryRow = document.createElement('div');
      categoryRow.className = 'layout-category';
      categoryRow.dataset.categoryId = category.id;

      categoryRow.innerHTML = `
        <div class="layout-category-header">
          <span class="drag-handle" title="Reorder">☰</span>

          <div class="category-title-slot"></div>

          <div class="category-actions">
            <button
              type="button"
              class="icon-button visibility-btn ${category.visible === false ? 'is-hidden' : ''}"
              aria-label="Toggle visibility"
              title="Toggle visibility"
              data-category-id="${category.id}"
            >
              ${category.visible === false
                ? '<i class="fa-solid fa-eye-slash"></i>'
                : '<i class="fa-solid fa-eye"></i>'}
            </button>

            <button
              type="button"
              class="icon-button rename-category-btn"
              title="Rename category"
              data-category-id="${category.id}"
            >
              <i class="fa-solid fa-pen-to-square"></i>
            </button>

            <button
              type="button"
              class="icon-button delete-category-btn"
              title="Delete category"
              data-category-id="${category.id}"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <div class="layout-category-items">
          ${category.items.map(item => `
            <div class="layout-item" data-item-id="${item.id}">
              <span class="drag-handle" title="Reorder">☰</span>

              ${renamingItemId === item.id
                ? `
                  <input
                    class="rename-input rename-item-input"
                    type="text"
                    data-item-id="${item.id}"
                    value="${item.label}"
                  />
                `
                : `
                  <span class="item-label">${item.label}</span>
                `
              }

              <div class="item-actions">
                <button type="button" class="icon-button rename-item-btn" data-item-id="${item.id}">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button type="button" class="icon-button delete-item-btn" data-item-id="${item.id}">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>
          `).join('')}

          <button
            type="button"
            class="layout-action-btn add-item-btn"
            data-category-id="${category.id}"
          >
            <span class="action-icon"><i class="fa-solid fa-plus"></i></span>
            <span>Add button</span>
          </button>
        </div>
      `;

      // Category rename slot
      const titleSlot = categoryRow.querySelector('.category-title-slot');

      if (renamingCategoryId === category.id) {
        const wrapper = document.createElement('div');
        wrapper.className = 'rename-wrapper';

        const input = document.createElement('input');
        input.className = 'rename-input';
        input.type = 'text';
        input.value = category.title;

        requestAnimationFrame(() => {
          input.focus();
          input.select();
        });

        const save = () => {
          const trimmed = input.value.trim();
          if (!trimmed) return;
          renameCategory(category.id, trimmed);
          renamingCategoryId = null;
          renderLayoutEditor(pageCategories);
        };

        const cancel = () => {
          renamingCategoryId = null;
          renderLayoutEditor(pageCategories);
        };

        input.addEventListener('keydown', e => {
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

        // Cancel when clicking outside (blur)
        input.addEventListener('blur', () => {
          cancel();
        });

        const saveBtn = document.createElement('button');
        saveBtn.className = 'icon-button confirm';
        saveBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
        saveBtn.onclick = save;

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'icon-button cancel';
        cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        cancelBtn.onclick = cancel;

        // Prevent blur firing before button clicks
        wrapper.addEventListener('mousedown', (e) => {
          e.preventDefault();
        });

        wrapper.append(input, saveBtn, cancelBtn);
        titleSlot.appendChild(wrapper);
      } else {
        const span = document.createElement('span');
        span.className = 'category-title';
        span.textContent = category.title;
        titleSlot.appendChild(span);
      }

      container.appendChild(categoryRow);
    });
}

// =====================================================
// Layout editor event wiring
// =====================================================

function wireLayoutEditorActions(container) {
  // Add Category button wiring
  const addCategoryButton = document.getElementById('add-category-btn');
  if (addCategoryButton) {
    addCategoryButton.onclick = () => {
      addCategory();
    };
  }

  // Wire visibility toggles
  container.querySelectorAll('.visibility-btn').forEach(button => {
    button.onclick = () => {
      const categoryId = button.dataset.categoryId;
      toggleCategoryVisibility(categoryId);
    };
  });

  // Wire rename category button
  container.querySelectorAll('.rename-category-btn').forEach(button => {
    button.onclick = () => {
      renamingCategoryId = button.dataset.categoryId;
      renderLayoutEditor(pageCategories);
    };
  });

  // Wire delete category buttons
  container.querySelectorAll('.delete-category-btn').forEach(button => {
    button.onclick = () => {
      const categoryId = button.dataset.categoryId;
      deleteCategory(categoryId);
    };
  });

  // Wire rename item inputs
  container.querySelectorAll('.rename-item-btn').forEach(button => {
    button.onclick = () => {
      const itemId = button.dataset.itemId;

      for (const category of pageCategories) {
        const item = category.items.find(i => i.id === itemId);
        if (item) {
          openButtonEditor({
            mode: 'edit',
            categoryId: category.id,
            itemId
          });
          break;
        }
      }
    };
  });

  // Wire edit button to open button editor modal
  container.querySelectorAll('.add-item-btn').forEach(button => {
    button.onclick = () => {
      openButtonEditor({
        mode: 'create',
        categoryId: button.dataset.categoryId
      });
    };
  });

  // Wire delete button actions
  container.querySelectorAll('.delete-item-btn').forEach(button => {
    button.onclick = () => {
      const itemId = button.dataset.itemId;
      deleteButton(itemId);
    };
  });
}

// =====================================================
// Drag & drop - categories
// =====================================================

function setupCategoryDragAndDrop(container) {
  // Wire drag handles
  // Scope to category-level handles only (first .drag-handle child of .layout-category-header)
  // to avoid item-level handles incorrectly setting draggedCategoryId.
  container.querySelectorAll('.layout-category-header > .drag-handle').forEach(handle => {
    const categoryEl = handle.closest('.layout-category');
    if (!categoryEl) return;

    handle.draggable = true;

    handle.addEventListener('dragstart', e => {
      e.stopPropagation();

      draggedCategoryId = categoryEl.dataset.categoryId;
      categoryEl.classList.add('is-dragging');

      e.dataTransfer.effectAllowed = 'move';
      // Required for Firefox
      e.dataTransfer.setData('text/plain', draggedCategoryId);
    });

    handle.addEventListener('dragend', () => {
      draggedCategoryId = null;
      categoryEl.classList.remove('is-dragging');

      // Clear all drop-target highlights
      container.querySelectorAll('.layout-category.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });
    });
  });

  // Auto-scroll state for drag
  // The HTML5 DnD API doesn't scroll automatically, so we run a rAF loop
  // that nudges the scrollable modal panel when the pointer is near an edge.

  // The scrollable container is .modal-content (overflow-y: auto)
  const scrollContainer = container.closest('.modal-content');

  let scrollRAF = null;
  let scrollVelocity = 0; // negative = up, positive = down

  function startScrollLoop() {
    if (scrollRAF) return; // already running
    function tick() {
      if (scrollVelocity === 0 || !scrollContainer) {
        scrollRAF = null;
        return;
      }
      scrollContainer.scrollTop += scrollVelocity;
      scrollRAF = requestAnimationFrame(tick);
    }
    scrollRAF = requestAnimationFrame(tick);
  }

  function stopScrollLoop() {
    if (scrollRAF) {
      cancelAnimationFrame(scrollRAF);
      scrollRAF = null;
    }
    scrollVelocity = 0;
  }

  // Wire drop handling
  // Use a named function reference so we can remove and re-add it on each
  // renderLayoutEditor() call — prevents duplicate listener accumulation.
  if (container._dragoverHandler) {
    container.removeEventListener('dragover', container._dragoverHandler);
  }
  if (container._dropHandler) {
    container.removeEventListener('drop', container._dropHandler);
  }
  if (container._dragleaveHandler) {
    container.removeEventListener('dragleave', container._dragleaveHandler);
  }

  container._dragoverHandler = e => {
    if (!draggedCategoryId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const targetCategory = e.target.closest('.layout-category');

    // Update drag-over highlight
    container.querySelectorAll('.layout-category.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });

    if (targetCategory && targetCategory.dataset.categoryId !== draggedCategoryId) {
      targetCategory.classList.add('drag-over');
    }

    // Auto-scroll: measure pointer position relative to the scroll container
    if (scrollContainer) {
      const rect = scrollContainer.getBoundingClientRect();
      const distFromTop    = e.clientY - rect.top;
      const distFromBottom = rect.bottom - e.clientY;

      if (distFromTop < SCROLL_ZONE) {
        // Pointer near top — scroll up; faster the closer to the edge
        scrollVelocity = -SCROLL_SPEED * (1 - distFromTop / SCROLL_ZONE);
        startScrollLoop();
      } else if (distFromBottom < SCROLL_ZONE) {
        // Pointer near bottom — scroll down
        scrollVelocity = SCROLL_SPEED * (1 - distFromBottom / SCROLL_ZONE);
        startScrollLoop();
      } else {
        stopScrollLoop();
      }
    }
  };

  container._dropHandler = e => {
    e.preventDefault();
    stopScrollLoop();
    if (!draggedCategoryId) return;

    // Clear highlights
    container.querySelectorAll('.layout-category.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });

    const targetCategory = e.target.closest('.layout-category');
    if (!targetCategory) return;

    const targetId = targetCategory.dataset.categoryId;
    if (!targetId || targetId === draggedCategoryId) return;

    reorderCategories(draggedCategoryId, targetId);
  };

  container._dragleaveHandler = e => {
    // Only clear highlight when leaving the container entirely
    if (!container.contains(e.relatedTarget)) {
      container.querySelectorAll('.layout-category.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });
      stopScrollLoop();
    }
  };

  container.addEventListener('dragover', container._dragoverHandler);
  container.addEventListener('drop', container._dropHandler);
  container.addEventListener('dragleave', container._dragleaveHandler);

  // Also stop scrolling on dragend (fires on the handle, not the container)
  container.querySelectorAll('.layout-category-header > .drag-handle').forEach(handle => {
    handle.addEventListener('dragend', stopScrollLoop, { once: false });
  });
}

// =====================================================
// Drag & drop - items
// =====================================================

function setupItemDragAndDrop(container) {
  container.querySelectorAll('.layout-category').forEach(categoryEl => {
    const categoryId = categoryEl.dataset.categoryId;
    const itemsContainer = categoryEl.querySelector('.layout-category-items');
    if (!itemsContainer) return;

    // Drag handles
    itemsContainer.querySelectorAll('.layout-item > .drag-handle').forEach(handle => {
      const itemEl = handle.closest('.layout-item');
      const itemId = itemEl?.dataset.itemId;
      if (!itemId) return;

      handle.draggable = true;

      handle.addEventListener('dragstart', e => {
        e.stopPropagation();
        draggedItemContext = { categoryId, itemId };
        itemEl.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', itemId);
      });

      handle.addEventListener('dragend', () => {
        draggedItemContext = null;
        itemEl.classList.remove('is-dragging');
      });
    });

    // Visual feedback only
    itemsContainer.addEventListener('dragover', e => {
      if (!draggedItemContext) return;
      if (draggedItemContext.categoryId !== categoryId) return;

      e.preventDefault();

      const targetItem = e.target.closest('.layout-item');

      itemsContainer
        .querySelectorAll('.layout-item.drag-over')
        .forEach(el => el.classList.remove('drag-over'));

      if (
        targetItem &&
        targetItem.dataset.itemId !== draggedItemContext.itemId
      ) {
        targetItem.classList.add('drag-over');
      }
    });

    // Single source of truth — SAME CATEGORY ONLY
    itemsContainer.addEventListener('drop', e => {
      e.preventDefault();
      if (!draggedItemContext) return;
      if (draggedItemContext.categoryId !== categoryId) return;

      const targetItem = e.target.closest('.layout-item');
      if (!targetItem) return;

      const targetItemId = targetItem.dataset.itemId;
      if (!targetItemId || targetItemId === draggedItemContext.itemId) return;

      itemsContainer
        .querySelectorAll('.layout-item.drag-over')
        .forEach(el => el.classList.remove('drag-over'));

      reorderItems(categoryId, draggedItemContext.itemId, targetItemId);
    });
  });
}

// =====================================================
// Layout editor entry point
// =====================================================

function renderLayoutEditor(categories) {
  if (!appReady) return;
  const container = document.getElementById('layout-categories');
  if (!container) return;

  buildLayoutEditorDOM(container, categories);
  wireLayoutEditorActions(container);
  setupCategoryDragAndDrop(container);
  setupItemDragAndDrop(container);
}