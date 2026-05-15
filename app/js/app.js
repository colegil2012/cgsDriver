// Simple SPA navigation for kiosk
const contentDiv = document.getElementById('content');
const navButtons = document.querySelectorAll('.nav-btn');

// ============================================================================
// Per-page initializers
// ============================================================================

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
// Orders page — listing, selection, Generate Route action
// ============================================================================

// Selected order ids, kept across re-renders of the Orders list. Cleared
// when route generation succeeds (those orders are now ASSIGNED and will
// filter out of the routable subset on the next render anyway).
let selectedOrderIds = new Set();

// Most recent fetch of orders. Cached so the Select All handler doesn't need
// to re-query. Refreshed every time renderOrdersList runs.
let lastFetchedOrders = [];

// Whether a route-generation request is in flight. Disables the action bar
// so a double-tap during the network call doesn't fire twice.
let isGeneratingRoute = false;

/**
 * Whether an order is eligible to be added to a new route.
 *
 *   - status must be PAID (financial state)
 *   - deliveryStatus must be null (no Delivery yet, lazy-create on POST)
 *     or "PENDING" (Delivery exists but not on a route)
 *
 * Anything else (ASSIGNED, OUT_FOR_DELIVERY, DELIVERED, FAILED, SKIPPED) is
 * still shown in the list, but without a checkbox.
 */
function isRoutable(order) {
  if (!order || order.status !== 'PAID') return false;
  const ds = order.deliveryStatus;
  return ds == null || ds === 'PENDING';
}

async function renderOrdersList() {
  const list = document.getElementById('orders-list');
  if (!list) return;

  const orders = await window.celtechApi.fetchOrders();

  if (orders === null) {
    lastFetchedOrders = [];
    list.innerHTML = `<p class="error">Could not reach the order service. Check the backend connection.</p>`;
    updateOrdersControls();
    return;
  }

  if (!Array.isArray(orders) || orders.length === 0) {
    lastFetchedOrders = [];
    list.innerHTML = `<p class="orders-empty">No orders to display.</p>`;
    updateOrdersControls();
    return;
  }

  lastFetchedOrders = orders;

  // Prune any selected ids that no longer appear in the routable subset —
  // they may have been delivered or assigned to another route while the
  // driver was elsewhere.
  const routableIds = new Set(orders.filter(isRoutable).map((o) => o.id));
  for (const id of [...selectedOrderIds]) {
    if (!routableIds.has(id)) selectedOrderIds.delete(id);
  }

  list.innerHTML = orders.map(renderOrderCard).join('');
  updateOrdersControls();
}

function renderOrderCard(order) {
  const id = order.id || '';
  const num = order.orderNumber || '—';
  const customer = escapeHtml(order.customerName || 'Unknown customer');
  const phone = escapeHtml(order.customerPhone || '');
  const orderStatus = escapeHtml(order.status || 'unknown');
  const deliveryStatus = order.deliveryStatus ? escapeHtml(order.deliveryStatus) : '';
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

  // Checkbox only on routable orders. The card markup still includes a
  // placeholder column on non-routable rows so the grid lines up.
  const routable = isRoutable(order);
  const checked = routable && selectedOrderIds.has(id) ? 'checked' : '';
  const checkbox = routable
      ? `<label class="order-select" aria-label="Select order ${escapeHtml(String(num))}">
           <input type="checkbox" class="order-select-checkbox" data-order-id="${escapeHtml(id)}" ${checked}>
         </label>`
      : `<span class="order-select order-select-placeholder" aria-hidden="true"></span>`;

  // Combine order + delivery status into one badge area. Delivery is the
  // more informative signal when present.
  const statusBadge = deliveryStatus
      ? `<span class="order-status order-status-${deliveryStatus.toLowerCase()}" title="Delivery: ${deliveryStatus}">${deliveryStatus}</span>`
      : `<span class="order-status order-status-${orderStatus.toLowerCase()}">${orderStatus}</span>`;

  return `
    <div class="order-card${routable ? '' : ' order-card-locked'}" data-order-id="${escapeHtml(id)}">
      <div class="order-card-header">
        ${checkbox}
        <span class="order-number">#${escapeHtml(String(num))}</span>
        ${statusBadge}
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

/**
 * Refresh the Select All checkbox state + action bar count/disabled state.
 * Called whenever the selection set changes, or after a render.
 */
function updateOrdersControls() {
  const selectAll = document.getElementById('orders-select-all');
  const count = document.getElementById('orders-action-count');
  const generate = document.getElementById('orders-generate-btn');

  const routable = lastFetchedOrders.filter(isRoutable);
  const routableCount = routable.length;
  const selectedCount = selectedOrderIds.size;

  if (selectAll) {
    selectAll.disabled = routableCount === 0 || isGeneratingRoute;
    if (routableCount === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    } else if (selectedCount === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    } else if (selectedCount === routableCount) {
      selectAll.checked = true;
      selectAll.indeterminate = false;
    } else {
      selectAll.checked = false;
      selectAll.indeterminate = true;
    }
  }

  if (count) {
    count.textContent = selectedCount === 0
        ? 'No orders selected'
        : `${selectedCount} order${selectedCount === 1 ? '' : 's'} selected`;
  }

  if (generate) {
    generate.disabled = selectedCount === 0 || isGeneratingRoute;
    generate.textContent = isGeneratingRoute
        ? 'Generating route…'
        : `Generate Route${selectedCount > 0 ? ` (${selectedCount})` : ''}`;
  }
}

/**
 * Event delegation on the Orders page — handles checkbox toggles, Select All,
 * and the Generate Route button. One listener on the content div, attached
 * once (see bottom of file).
 */
function onOrdersPageClick(event) {
  // Generate Route button
  const genBtn = event.target.closest('#orders-generate-btn');
  if (genBtn) {
    handleGenerateRoute();
    return;
  }
}

function onOrdersPageChange(event) {
  // Per-order checkbox
  const cb = event.target.closest('.order-select-checkbox');
  if (cb) {
    const id = cb.dataset.orderId;
    if (!id) return;
    if (cb.checked) selectedOrderIds.add(id);
    else selectedOrderIds.delete(id);
    updateOrdersControls();
    return;
  }

  // Select-all toggle
  const selectAll = event.target.closest('#orders-select-all');
  if (selectAll) {
    const checked = selectAll.checked;
    const routable = lastFetchedOrders.filter(isRoutable);
    if (checked) {
      routable.forEach((o) => selectedOrderIds.add(o.id));
    } else {
      routable.forEach((o) => selectedOrderIds.delete(o.id));
    }
    // Reflect the new state on every per-order checkbox in the DOM. Avoids
    // re-rendering the whole list for what's essentially a visual toggle.
    document.querySelectorAll('.order-select-checkbox').forEach((box) => {
      box.checked = selectedOrderIds.has(box.dataset.orderId);
    });
    updateOrdersControls();
    return;
  }
}

async function handleGenerateRoute() {
  if (isGeneratingRoute || selectedOrderIds.size === 0) return;

  const orderIds = Array.from(selectedOrderIds);

  // Fresh UUID per attempt. Multiple Generate-Route clicks for the same
  // basket should produce ONE route (the second click matches via key);
  // but if the driver intentionally regenerates after marking some stops
  // failed/skipped, that's a new attempt with a new key. crypto.randomUUID
  // is available in all modern browsers including Chromium on Wayland.
  const idempotencyKey = (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID()
      : `kiosk-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  isGeneratingRoute = true;
  updateOrdersControls();

  const route = await window.celtechApi.generateRoute(orderIds, idempotencyKey);

  isGeneratingRoute = false;

  if (!route) {
    // The API client already logged the failure. Surface it on the page.
    const bar = document.getElementById('orders-action-bar');
    if (bar) {
      const existing = bar.querySelector('.orders-action-error');
      if (existing) existing.remove();
      const err = document.createElement('div');
      err.className = 'orders-action-error';
      err.textContent = 'Could not generate route. Check the connection and try again.';
      bar.appendChild(err);
    }
    updateOrdersControls();
    return;
  }

  // Success. Hand the route off to the map module — celtechSetRoute is safe
  // to call before the map exists (it queues). Clear any prior route first.
  if (typeof window.celtechClearRoute === 'function') {
    window.celtechClearRoute();
  }
  if (route.geometry && typeof window.celtechSetRoute === 'function') {
    // RouteDTO.geometry is { type: "LineString", coordinates: [...] } already,
    // which is exactly what celtechSetRoute accepts.
    window.celtechSetRoute(route.geometry);
  }

  // Stash the route so Round B's route panel renderer can read it. Until
  // that ships, navigating to the Route tab just shows the polyline.
  window.celtechCurrentRoute = route;

  // Clear the selection — those orders are now ASSIGNED and won't reappear
  // in the routable subset.
  selectedOrderIds.clear();

  // Navigate to the Route tab. loadPage will call celtechInitMap which
  // resolves apiReady → buildMap → drains the queued setRoute.
  loadPage('route');
}


// ============================================================================
// Helpers
// ============================================================================

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


// ============================================================================
// Cross-page listeners
// ============================================================================

// One click listener and one change listener at the content root. They
// dispatch based on what was clicked/changed, so we don't need to re-attach
// handlers every time the Orders partial re-renders.
contentDiv.addEventListener('click', onOrdersPageClick);
contentDiv.addEventListener('change', onOrdersPageChange);


// Load home page on startup
loadPage('home');