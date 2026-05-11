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
  },
  orders: () => {
    renderOrdersList();
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

// Event delegation for in-content navigation (handles elements with data-page
// inside loaded partials, like the Start Your Journey button on home)
contentDiv.addEventListener('click', (event) => {
  const target = event.target.closest('[data-page]');
  if (target && contentDiv.contains(target)) {
    loadPage(target.dataset.page);
    target.blur();
  }
});


// ============================================================================
// Orders page rendering
// ============================================================================

async function renderOrdersList() {
  const list = document.getElementById('orders-list');
  if (!list) return;

  const orders = await window.celtechApi.fetchOrders();

  if (orders === null) {
    list.innerHTML = `<p class="error">Could not reach the order service. Check the backend connection.</p>`;
    return;
  }

  if (!Array.isArray(orders) || orders.length === 0) {
    list.innerHTML = `<p class="orders-empty">No orders to display.</p>`;
    return;
  }

  list.innerHTML = orders.map(renderOrderCard).join('');
}

function renderOrderCard(order) {
  // Defensive against missing fields — the backend DTO may evolve.
  const id = order.id || '';
  const num = order.orderNumber || '—';
  const customer = escapeHtml(order.customerName || 'Unknown customer');
  const phone = escapeHtml(order.customerPhone || '');
  const status = escapeHtml(order.status || 'unknown');
  const total = formatCurrency(order.total);

  const ship = order.shipTo || {};
  const addrLine1 = escapeHtml([ship.street1, ship.street2].filter(Boolean).join(', ') || '—');
  const addrLine2 = escapeHtml(
      [ship.city, ship.state].filter(Boolean).join(', ') +
      (ship.zip ? ` ${ship.zip}` : '')
  );

  const items = Array.isArray(order.items) ? order.items : [];
  const itemSummary = items.length
      ? items.map((it) => `${it.quantity || 1} × ${escapeHtml(it.name || 'item')}`).join(', ')
      : '—';

  const instructions = order.deliveryInstructions
      ? `<div class="order-instructions">📋 ${escapeHtml(order.deliveryInstructions)}</div>`
      : '';

  return `
    <div class="order-card" data-order-id="${escapeHtml(id)}">
      <div class="order-card-header">
        <span class="order-number">#${escapeHtml(String(num))}</span>
        <span class="order-status order-status-${status.toLowerCase()}">${status}</span>
      </div>
      <div class="order-customer">${customer}</div>
      ${phone ? `<div class="order-phone">${phone}</div>` : ''}
      <div class="order-address">
        <div>${addrLine1}</div>
        <div>${addrLine2}</div>
      </div>
      <div class="order-items">${itemSummary}</div>
      ${instructions}
      <div class="order-card-footer">
        <span class="order-total">${total}</span>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

function formatCurrency(amount) {
  if (amount == null || isNaN(Number(amount))) return '';
  return `$${Number(amount).toFixed(2)}`;
}


// Load home page on startup
loadPage('home');