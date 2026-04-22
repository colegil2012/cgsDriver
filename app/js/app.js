// Simple SPA navigation for kiosk
const contentDiv = document.getElementById('content');
const navButtons = document.querySelectorAll('.nav-btn');

// Pages that need JS initialization after load
const pageInitializers = {
  route: () => {
    if (typeof window.celtechInitMap === 'function') {
      window.celtechInitMap();
    } else {
      console.error('Map module not loaded');
    }
  }
};

// Load a partial HTML file
async function loadPage(pageName) {
  try {
    const response = await fetch(`partials/${pageName}.html`);
    if (!response.ok) throw new Error('Page not found');
    const html = await response.text();
    contentDiv.innerHTML = html;

    // Update active button
    navButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === pageName);
    });

    // Run page-specific initialization if needed
    if (pageInitializers[pageName]) {
      pageInitializers[pageName]();
    }
  } catch (error) {
    contentDiv.innerHTML = '<div class="error">Page could not be loaded</div>';
    console.error(error);
  }
}


// Set up navigation
navButtons.forEach(button => {
  button.addEventListener('click', (event) => {
    loadPage(button.dataset.page);
    event.currentTarget.blur();  // Release focus after tap
  });
});

// Load home page on startup
loadPage('home');