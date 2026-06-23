// ==============================================
// Search functionality for buttons / items
// ==============================================

// - case-insensitive
// - includes match by default
// - "*" prefix optional (kept for flexibility)

const searchInput = document.getElementById('service-search');

if (searchInput) {
  searchInput.addEventListener('input', () => {
    let query = searchInput.value.toLowerCase().trim();

    const useWildcard = query.startsWith('*');
    if (useWildcard) {
      query = query.slice(1);
    }

    const categories = document.querySelectorAll('.category');

    categories.forEach(category => {
      const buttons = category.querySelectorAll('.buttons a');

      // Reset
      if (query === '') {
        buttons.forEach(button => {
          button.style.display = '';
        });
        category.style.display = '';
        return;
      }

      let hasVisibleButtons = false;

      buttons.forEach(button => {
        // Cache search text ONCE per element
        if (!button.dataset.searchText) {
          button.dataset.searchText =
            button.textContent.toLowerCase().trim();
        }

        const text = button.dataset.searchText;

        const matches = useWildcard
          ? text.includes(query)
          : text.includes(query); // improved UX

        button.style.display = matches ? '' : 'none';

        if (matches) {
          hasVisibleButtons = true;
        }
      });

      category.style.display = hasVisibleButtons ? '' : 'none';
    });
  });
}