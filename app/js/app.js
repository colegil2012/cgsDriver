// Simple SPA navigation for kiosk
const contentDiv = document.getElementById('content');
const navButtons = document.querySelectorAll('.nav-btn');

// ============================================================================
// Per-page initializers
// ============================================================================

const pageInitializers = {
  route: () => {
    // The map module's celtechSetRoute / celtechAddMarker queue calls made
    // before the map is built, so this ordering is safe:
    //   1. initMap (async — buildMap will run when the Google API loads)
    //   2. fetch active route (async)
    //   3. when it resolves, render header + stops, hand geometry to map
    if (typeof window.celtechInitMap === 'function') {
      window.celtechInitMap();
    } else {
      console.error('Map module not loaded');
    }
    refreshActiveRoute();
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

    navButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === pageName);
    });

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
    event.currentTarget.blur();
  });
});

// Event delegation for in-content navigation (handles elements with data-page
// inside loaded partials, like the Start Your Journey button on home and the
// Go to Orders button on the empty Route tab).
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

let selectedOrderIds = new Set();
let lastFetchedOrders = [];
let isGeneratingRoute = false;

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

  const routable = isRoutable(order);
  const checked = routable && selectedOrderIds.has(id) ? 'checked' : '';
  const checkbox = routable
      ? `<label class="order-select" aria-label="Select order ${escapeHtml(String(num))}">
           <input type="checkbox" class="order-select-checkbox" data-order-id="${escapeHtml(id)}" ${checked}>
         </label>`
      : `<span class="order-select order-select-placeholder" aria-hidden="true"></span>`;

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

function updateOrdersControls() {
  const selectAll = document.getElementById('orders-select-all');
  const count = document.getElementById('orders-action-count');
  const generate = document.getElementById('orders-generate-btn');

  const routable = lastFetchedOrders.filter(isRoutable);
  const routableCount = routable.length;
  const selectedCount = selectedOrderIds.size;

  if (selectAll) {
    selectAll.disabled = routableCount === 0 || isGeneratingRoute;
    if (routableCount === 0 || selectedCount === 0) {
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

function onOrdersPageClick(event) {
  const genBtn = event.target.closest('#orders-generate-btn');
  if (genBtn) {
    handleGenerateRoute();
    return;
  }
}

function onOrdersPageChange(event) {
  const cb = event.target.closest('.order-select-checkbox');
  if (cb) {
    const id = cb.dataset.orderId;
    if (!id) return;
    if (cb.checked) selectedOrderIds.add(id);
    else selectedOrderIds.delete(id);
    updateOrdersControls();
    return;
  }

  const selectAll = event.target.closest('#orders-select-all');
  if (selectAll) {
    const checked = selectAll.checked;
    const routable = lastFetchedOrders.filter(isRoutable);
    if (checked) routable.forEach((o) => selectedOrderIds.add(o.id));
    else routable.forEach((o) => selectedOrderIds.delete(o.id));
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
  const idempotencyKey = (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID()
      : `kiosk-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  isGeneratingRoute = true;
  updateOrdersControls();

  const result = await window.celtechApi.generateRoute(orderIds, idempotencyKey);

  isGeneratingRoute = false;

  // Special case: 409 "route already active" — show a modal that lets the
  // driver navigate to the existing route. The safer-cancel UX choice means
  // there's no "throw away the active route and replace" button here; to
  // cancel, the driver must go to the Route tab.
  if (result && result.__apiError && result.status === 409) {
    const activeRouteId = result.body
        && result.body.details
        && result.body.details.activeRouteId;
    showActiveRouteConflictModal(activeRouteId);
    updateOrdersControls();
    return;
  }

  if (!result) {
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

  // Success.
  applyRouteToView(result);
  selectedOrderIds.clear();
  loadPage('route');
}

/**
 * Build a small modal informing the driver that a route is already active.
 * Single action — navigate to the Route tab; cancellation happens there
 * with a separate confirmation step.
 */
function showActiveRouteConflictModal(activeRouteId) {
  // Remove any existing modal first (in case the driver triggered twice).
  document.querySelectorAll('.kiosk-modal-backdrop').forEach((el) => el.remove());

  const backdrop = document.createElement('div');
  backdrop.className = 'kiosk-modal-backdrop';
  backdrop.innerHTML = `
    <div class="kiosk-modal" role="dialog" aria-labelledby="kiosk-modal-title">
      <h3 id="kiosk-modal-title">You already have an active route</h3>
      <p>You can have one active route at a time. Open it to continue, complete it, or cancel it.</p>
      <div class="kiosk-modal-actions">
        <button class="btn-secondary" type="button" data-modal-action="dismiss">Stay Here</button>
        <button class="btn-primary" type="button" data-modal-action="open-route">Open Active Route</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (e) => {
    const action = e.target.dataset && e.target.dataset.modalAction;
    if (action === 'dismiss' || e.target === backdrop) {
      backdrop.remove();
    } else if (action === 'open-route') {
      backdrop.remove();
      loadPage('route');
    }
  });
}


// ============================================================================
// Route page — active-route fetch, header, stops, lifecycle actions
// ============================================================================

// Last fetched active route. Used by lifecycle handlers so they don't have
// to refetch just to know the id/status. Cleared when the route's no longer
// active or when navigating away.
let currentRoute = null;

/**
 * Called from pageInitializers.route. Fetches the active route from the
 * backend, then renders the header + stops + drops the geometry on the map.
 * If no active route exists, renders the empty state.
 */
async function refreshActiveRoute() {
  const route = await window.celtechApi.getActiveRoute();
  applyRouteToView(route);
}

/**
 * Render whatever the current view of the active route should be. Called
 * after the active fetch, after a Generate succeeds (no need to re-fetch
 * what we just got back), and after every lifecycle action.
 *
 * Pass null to mean "no active route — show the empty state."
 */
function applyRouteToView(route) {
  currentRoute = route;

  const header = document.getElementById('route-header');
  const headerNumber = document.getElementById('route-header-number');
  const headerStatus = document.getElementById('route-header-status');
  const headerSummary = document.getElementById('route-header-summary');
  const headerActions = document.getElementById('route-header-actions');
  const empty = document.getElementById('route-empty');
  const mapWrap = document.getElementById('route-map-wrapper');
  const stops = document.getElementById('route-stops');
  const confirmPanel = document.getElementById('route-confirm-cancel');

  // If the Route partial isn't currently mounted, bail. This can happen if
  // refreshActiveRoute resolves after the user nav'd away.
  if (!header || !stops) return;

  // Always hide the cancel-confirm panel on (re)render — a fresh state means
  // a fresh decision.
  if (confirmPanel) confirmPanel.hidden = true;

  // No active route — clear map artifacts, show empty state.
  if (!route) {
    if (typeof window.celtechClearRoute === 'function') {
      window.celtechClearRoute();
    }
    header.hidden = true;
    if (mapWrap) mapWrap.style.display = 'none';
    stops.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }

  // Active route — render the header + stops + map.
  if (empty) empty.hidden = true;

  const isTerminal = route.status === 'COMPLETED' || route.status === 'CANCELLED';

  // Map: hide for terminal routes (the geometry is meaningless once done).
  // For PLANNED / IN_PROGRESS, show and re-draw.
  if (mapWrap) mapWrap.style.display = isTerminal ? 'none' : '';

  if (!isTerminal) {
    if (typeof window.celtechClearRoute === 'function') {
      window.celtechClearRoute();
    }
    if (route.geometry && typeof window.celtechSetRoute === 'function') {
      window.celtechSetRoute(route.geometry);
    }
    // Numbered stop markers — sequence as the visible label.
    if (Array.isArray(route.stops) && typeof window.celtechAddMarker === 'function') {
      route.stops.forEach((stop) => {
        const a = stop.address || {};
        if (a.latitude != null && a.longitude != null) {
          const label = `#${stop.sequence} — ${stop.customerName || 'Stop'}`;
          window.celtechAddMarker(a.latitude, a.longitude, label);
        }
      });
    }
  }

  // Header.
  header.hidden = false;
  headerNumber.textContent = `Route ${route.routeNumber || ''}`;
  headerStatus.textContent = route.status || '';
  headerStatus.className = `route-header-status route-header-status-${(route.status || '').toLowerCase()}`;

  const totals = route.totals || {};
  const distKm = totals.distanceMeters != null ? (totals.distanceMeters / 1000).toFixed(1) + ' km' : '';
  const durMin = totals.durationSeconds != null ? Math.round(totals.durationSeconds / 60) + ' min' : '';
  const stopCount = totals.stopCount != null ? `${totals.stopCount} stop${totals.stopCount === 1 ? '' : 's'}` : '';
  headerSummary.textContent = [stopCount, distKm, durMin].filter(Boolean).join(' · ');

  // Header actions based on status.
  headerActions.innerHTML = renderHeaderActions(route);

  // Stops list.
  stops.innerHTML = route.stops && route.stops.length
      ? route.stops.map((s) => renderStopCard(s, route.status)).join('')
      : `<p class="route-empty-stops">This route has no stops.</p>`;
}

function renderHeaderActions(route) {
  const status = route.status;

  if (status === 'PLANNED') {
    return `
      <button class="btn-primary" type="button" data-route-action="start">Start Route</button>
      <button class="btn-link-danger" type="button" data-route-action="cancel-prompt">Cancel</button>
    `;
  }
  if (status === 'IN_PROGRESS') {
    return `
      <button class="btn-primary" type="button" data-route-action="complete">Complete Route</button>
      <button class="btn-link-danger" type="button" data-route-action="cancel-prompt">Cancel</button>
    `;
  }
  // Terminal — COMPLETED or CANCELLED. Offer a path back to planning a new one.
  return `
    <button class="btn-secondary" type="button" data-page="orders">Plan Another Route</button>
  `;
}

function renderStopCard(stop, routeStatus) {
  const seq = stop.sequence != null ? String(stop.sequence) : '?';
  const customer = escapeHtml(stop.customerName || 'Unknown customer');
  const phone = escapeHtml(stop.customerPhone || '');
  const deliveryId = stop.deliveryId || '';
  const status = stop.status || 'PENDING';

  const addr = stop.address || {};
  const addrLine1 = escapeHtml([addr.street1, addr.street2].filter(Boolean).join(', ') || '—');
  const addrLine2 = escapeHtml(
      [addr.city, addr.state].filter(Boolean).join(', ') +
      (addr.zip ? ` ${addr.zip}` : '')
  );

  const instructions = stop.deliveryInstructions
      ? `<div class="stop-instructions">📋 ${escapeHtml(stop.deliveryInstructions)}</div>`
      : '';

  // Mark Delivered button — only when this stop is still actionable, AND
  // the route is in a state where action makes sense. For now: show on
  // IN_PROGRESS routes for stops that haven't reached a terminal delivery
  // state. (Round B+ scope; Skip/Failed are explicitly deferred.)
  const stopIsTerminal = status === 'DELIVERED' || status === 'FAILED' || status === 'SKIPPED';
  const showMarkDelivered = routeStatus === 'IN_PROGRESS' && !stopIsTerminal;
  const markBtn = showMarkDelivered
      ? `<button class="btn-primary stop-mark-btn" type="button"
                 data-stop-action="mark-delivered"
                 data-delivery-id="${escapeHtml(deliveryId)}">Mark Delivered</button>`
      : '';

  return `
    <div class="stop-card stop-card-${status.toLowerCase()}" data-delivery-id="${escapeHtml(deliveryId)}">
      <div class="stop-card-header">
        <span class="stop-seq">${seq}</span>
        <div class="stop-customer">
          <div class="stop-customer-name">${customer}</div>
          ${phone ? `<div class="stop-customer-phone">${phone}</div>` : ''}
        </div>
        <span class="stop-status stop-status-${status.toLowerCase()}">${escapeHtml(status)}</span>
      </div>
      <div class="stop-address">
        <div>${addrLine1}</div>
        <div>${addrLine2}</div>
      </div>
      ${instructions}
      ${markBtn ? `<div class="stop-actions">${markBtn}</div>` : ''}
    </div>
  `;
}

/**
 * Click handler on the Route tab. Single delegated listener.
 */
function onRoutePageClick(event) {
  const actionTarget = event.target.closest('[data-route-action]');
  if (actionTarget) {
    const action = actionTarget.dataset.routeAction;
    if (action === 'start') return handleRouteStart();
    if (action === 'complete') return handleRouteComplete();
    if (action === 'cancel-prompt') return showCancelConfirm();
    return;
  }

  const stopAction = event.target.closest('[data-stop-action]');
  if (stopAction) {
    const action = stopAction.dataset.stopAction;
    if (action === 'mark-delivered') {
      return handleMarkDelivered(stopAction.dataset.deliveryId, stopAction);
    }
    return;
  }

  // Cancel confirm panel buttons.
  if (event.target.id === 'route-confirm-cancel-no') {
    const panel = document.getElementById('route-confirm-cancel');
    if (panel) panel.hidden = true;
    return;
  }
  if (event.target.id === 'route-confirm-cancel-yes') {
    return handleRouteCancel();
  }
}

async function handleRouteStart() {
  if (!currentRoute) return;
  const updated = await window.celtechApi.startRoute(currentRoute.id);
  if (!updated) {
    alert('Could not start route. Try again.');
    return;
  }
  applyRouteToView(updated);
}

async function handleRouteComplete() {
  if (!currentRoute) return;
  const updated = await window.celtechApi.completeRoute(currentRoute.id);
  if (!updated) {
    alert('Could not complete route. Try again.');
    return;
  }
  applyRouteToView(updated);
}

function showCancelConfirm() {
  const panel = document.getElementById('route-confirm-cancel');
  if (panel) {
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

async function handleRouteCancel() {
  if (!currentRoute) return;
  const updated = await window.celtechApi.cancelRoute(currentRoute.id);
  if (!updated) {
    alert('Could not cancel route. Try again.');
    return;
  }
  // After cancel, the route is CANCELLED — but it's no longer "the active
  // route" from the server's perspective. Refresh from /active so the UI
  // accurately reflects "no active route" instead of showing the cancelled
  // one with stale data.
  await refreshActiveRoute();
}

async function handleMarkDelivered(deliveryId, btnEl) {
  if (!deliveryId) return;
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = 'Marking…';
  }
  const result = await window.celtechApi.updateDeliveryStatus(deliveryId, 'SUCCESS');
  if (!result) {
    alert('Could not mark delivered. Try again.');
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = 'Mark Delivered';
    }
    return;
  }
  // Re-fetch the active route so the UI reflects the new delivery status.
  // Doing a full refresh (rather than mutating in place) is cheaper to reason
  // about and avoids drift if the backend's view diverges from ours.
  await refreshActiveRoute();
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

contentDiv.addEventListener('click', onOrdersPageClick);
contentDiv.addEventListener('change', onOrdersPageChange);
contentDiv.addEventListener('click', onRoutePageClick);


// Load home page on startup
loadPage('home');