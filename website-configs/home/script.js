// Wait for the DOM content to be fully loaded before executing the script
document.addEventListener('DOMContentLoaded', function() {
    
    // Select the button and the dropdown menu for pages
    var dropdownPagesButton = document.querySelector('.dropdownPages-button');
    var dropdownPages = document.querySelector('.dropdownPages');
    
    // Toggle the visibility of the pages dropdown menu when the button is clicked
    dropdownPagesButton.addEventListener('click', function(event) {
        event.stopPropagation(); // Prevent the event from bubbling up
        dropdownPages.classList.toggle('show'); // Toggle the 'show' class to display or hide the dropdown
    });

    // Select the button, dropdown menu, and theme links for themes
    var dropdownThemesButton = document.querySelector('.dropdownThemes-button');
    var dropdownThemes = document.querySelector('.dropdownThemes');
    var themeLinks = document.querySelectorAll('.dropdownThemes-content a');

    // Retrieve the last selected theme from localStorage
    var lastSelectedTheme = localStorage.getItem('selectedTheme');
    if (lastSelectedTheme) {
        document.body.classList.add(lastSelectedTheme); // Apply the last selected theme to the body
    }

    // Toggle the visibility of the themes dropdown menu when the button is clicked
    dropdownThemesButton.addEventListener('click', function(event) {
        event.stopPropagation(); // Prevent the event from bubbling up
        dropdownThemes.classList.toggle('show'); // Toggle the 'show' class to display or hide the dropdown
    });

    // Handle clicks on each theme link
    themeLinks.forEach(link => {
        link.addEventListener('click', function(event) {
            event.preventDefault(); // Prevent the default link behavior (e.g., navigating to a new page)
            var bgClass = this.getAttribute('data-bg'); // Get the data-bg attribute value

            // Remove all existing theme classes from the body
            document.body.classList.remove('bg1', 'bg2', 'bg3', 'bg4', 'bg5', 'bg6', 'bg7'); // Update with your specific theme classes

            // Add the new selected theme class to the body
            document.body.classList.add(bgClass);

            // Store the selected theme in localStorage for future visits
            localStorage.setItem('selectedTheme', bgClass);

            // Hide the themes dropdown menu after selecting a theme
            dropdownThemes.classList.remove('show');
        });
    });

    // Close dropdown menus if clicking outside of them
    window.addEventListener('click', function() {
        if (dropdownPages.classList.contains('show')) {
            dropdownPages.classList.remove('show'); // Hide the pages dropdown if it's shown
        }
        if (dropdownThemes.classList.contains('show')) {
            dropdownThemes.classList.remove('show'); // Hide the themes dropdown if it's shown
        }
    });
});