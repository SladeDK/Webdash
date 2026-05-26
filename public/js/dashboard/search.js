// ==============================================
// Search functionality for buttons / items
// ==============================================

// Quick filter / search
// - case-insensitive
// - starts-with by default
// - contains match when query starts with '*'
const searchInput = document.getElementById('service-search');
const categories = document.querySelectorAll('.category');

if (searchInput) {
  searchInput.addEventListener('input', () => {
    let query = searchInput.value.toLowerCase().trim();
    const useWildcard = query.startsWith('*');

    if (useWildcard) {
      query = query.slice(1);
    }

    document.querySelectorAll('.category').forEach(category => {
      const buttons = category.querySelectorAll('.buttons a');

      // If search is cleared, reset everything and show category
      if (query === '') {
        buttons.forEach(button => {
          button.style.display = '';
        });
        category.style.display = '';
        return;
      }

      // Active search behavior
      let hasVisibleButtons = false;

      buttons.forEach(button => {
        const text = button.textContent.toLowerCase().trim();
        const matches = useWildcard
          ? text.includes(query)
          : text.startsWith(query);

        button.style.display = matches ? '' : 'none';
        if (matches) hasVisibleButtons = true;
      });

      // Hide category only when searching and no matches
      category.style.display = hasVisibleButtons ? '' : 'none';
    });
  });
}