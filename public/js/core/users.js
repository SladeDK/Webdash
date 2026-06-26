async function initUserDropdown() {
  const select = document.getElementById('user-select');
  if (!select) return;

  const users = await UserService.listUsers();
  const current = getActiveUser();

  select.innerHTML = '';

  users.forEach(user => {
    const opt = document.createElement('option');
    opt.value = user;
    opt.textContent = user;

    if (user === current) {
      opt.selected = true;
    }

    select.appendChild(opt);
  });

  // Force sync fallback (important edge case fix)
  if (!users.includes(current) && users.length > 0) {
    select.value = users[0];
  } else {
    select.value = current;
  }

  // Update label AFTER select
  const label = document.getElementById('current-user-label');
  if (label) {
    label.textContent = select.value;
  }

  select.onchange = () => {
    switchUser(select.value);
  };
}

function switchUser(user) {
  if (!user) return;

  const url = new URL(window.location.href);
  url.searchParams.set('user', user);

  window.location.href = url.toString();
}

async function createUser(name) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const users = await UserService.listUsers();

  const exists = users.some(
    u => u.toLowerCase() === trimmed.toLowerCase()
  );

  if (exists) {
    showToast({
      title: 'User exists',
      lines: ['User names must be unique'],
      type: 'error',
			duration: 5000
    });
    return;
  }

  // Create user first
  await UserService.createUser(trimmed);

  // Then switch user
  switchUser(trimmed);
}

function initCreateUserModal() {
  const form = document.getElementById('create-user-form');
  const input = document.getElementById('create-user-input');
  const error = document.getElementById('create-user-error');
  const cancelBtn = document.getElementById('create-user-cancel');
  const closeBtn = document.getElementById('create-user-close');

  if (!form || !input) return;

  // Prevent double binding if init is called again
  if (form._wired) return;
  form._wired = true;

  // Clear error when typing (important UX polish)
  input.addEventListener('input', () => {
    error?.classList.remove('is-visible');
  });

  // Submit handler (same pattern as button editor)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = input.value.trim();
    if (!name) return;

    const users = await UserService.listUsers();

    const exists = users.some(
      u => u.toLowerCase() === name.toLowerCase()
    );

    if (exists) {
      error.textContent = "User already exists";
      error.classList.add('is-visible');
      return;
    }

    try {
			await UserService.createUser(name);

			closeCreateUserModal();
			switchUser(name);

    } catch (err) {
      console.error('[Create User]', err);

      error.textContent = "Failed to create user";
      error.classList.add('is-visible');
    }
  });

  // Close buttons
  cancelBtn?.addEventListener('click', closeCreateUserModal);
  closeBtn?.addEventListener('click', closeCreateUserModal);
}

function openCreateUserModal() {
  const overlay = document.getElementById('create-user-overlay');
  const input = document.getElementById('create-user-input');
  const error = document.getElementById('create-user-error');

  if (!overlay || !input) return;

  error?.classList.remove('is-visible');
  input.value = '';

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');

  overlay.classList.add('pre-open');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.remove('pre-open');
    });
  });

  pushModal(overlay, closeCreateUserModal);

  requestAnimationFrame(() => {
    input.focus();
  });
}

function closeCreateUserModal() {
  const overlay = document.getElementById('create-user-overlay');
  if (!overlay) return;

  overlay.classList.add('is-closing');
  overlay.setAttribute('aria-hidden', 'true');

  setTimeout(() => {
    overlay.hidden = true;
    overlay.classList.remove('is-closing');

    popModal(overlay);
  }, 160);
}

function openEditUserModal() {
  const overlay = document.getElementById('edit-user-overlay');
  const input = document.getElementById('edit-user-name');

  if (!overlay || !input) return;

  input.value = getActiveUser();

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');

  // Match animation system
  overlay.classList.add('pre-open');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.remove('pre-open');
    });
  });

  pushModal(overlay, closeEditUserModal);

  requestAnimationFrame(() => input.focus());
}

function closeEditUserModal() {
  const overlay = document.getElementById('edit-user-overlay');
  if (!overlay) return;

  overlay.classList.add('is-closing');
  overlay.setAttribute('aria-hidden', 'true');

  setTimeout(() => {
    overlay.hidden = true;
    overlay.classList.remove('is-closing');

    popModal(overlay);
  }, 160);
}

function initEditUserModal() {
  const form = document.getElementById('edit-user-form');
  const input = document.getElementById('edit-user-name');
  const cancelBtn = form?.querySelector('.secondary-btn');
  const closeBtn = document
    .getElementById('edit-user-overlay')
    ?.querySelector('.modal-close');

  if (!form || !input || form._wired) return;
  form._wired = true;

  // Clear error on typing
  input.addEventListener('input', () => {
    // if you add error span later, hook here
  });

  cancelBtn?.addEventListener('click', closeEditUserModal);
  closeBtn?.addEventListener('click', closeEditUserModal);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newName = input.value.trim();
    const current = getActiveUser();

    if (!newName) return;

    try {
      const users = await UserService.listUsers();

      const exists = users.some(
        u => u.toLowerCase() === newName.toLowerCase()
      );

      if (exists) {
        showToast({
          title: 'User exists',
          lines: ['User names must be unique'],
          type: 'error',
          duration: 5000
        });
        return;
      }

      if (newName === current) return;

			await UserService.renameUser(current, newName);

			closeEditUserModal();
			switchUser(newName);

    } catch (err) {
      console.error('[Rename user]', err);

      showToast({
        title: 'Rename failed',
        lines: ['Could not rename user'],
        type: 'error',
        duration: 5000
      });
    }
  });
}

function initUserActions() {

	const panel = document.getElementById('panel-user');
	const editBtn = panel?.querySelector('.edit-user-btn');
	const deleteBtn = panel?.querySelector('.delete-user-btn');

  // Prevent double binding (important)
  if (editBtn && !editBtn._wired) {
    editBtn._wired = true;
    editBtn.addEventListener('click', openEditUserModal);
  }

  if (deleteBtn && !deleteBtn._wired) {
    deleteBtn._wired = true;
    deleteBtn.addEventListener('click', async () => {

      const current = getActiveUser();
      const users = await UserService.listUsers();

      if (users.length <= 1) {
        showToast({
          title: 'Cannot delete user',
          lines: ['At least one user must exist'],
          type: 'error'
        });
        return;
      }

      openConfirm({
				title: 'Delete user',
				message: `Delete "${current}" permanently?`,
				confirmLabel: 'Delete',

				onConfirm: async () => {
					try {
						await UserService.deleteUser(current);

						const nextUser = users.find(u => u !== current) || users[0];

						if (nextUser) {
							switchUser(nextUser);
						}

					} catch (err) {
						console.error('[Delete user]', err);
					}
				}
			});
    });
  }
}
