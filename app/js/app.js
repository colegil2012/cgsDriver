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

// Event delegation for in-content navigation
contentDiv.addEventListener('click', (event) => {
  const target = event.target.closest('[data-page]');
  if (target && contentDiv.contains(target)) {
    loadPage(target.dataset.page);
    target.blur();
  }
});


// ============================================================================
// Shared helpers
// ============================================================================

function isRoutable(order) {
  if (!order || order.status !== 'PAID') return false;
  const ds = order.deliveryStatus;
  return ds == null || ds === 'PENDING';
}


// ============================================================================
// Orders page — listing, selection, Generate Route action
// ============================================================================

let selectedOrderIds = new Set();
let lastFetchedOrders = [];          // routable subset only (post-filter)
let isGeneratingRoute = false;

async function renderOrdersList() {
  const list = document.getElementById('orders-list');
  if (!list) return;

  const all = await window.celtechApi.fetchOrders();

  if (all === null) {
    lastFetchedOrders = [];
    list.innerHTML = `<p class="error">Could not reach the order service. Check the backend connection.</p>`;
    updateOrdersControls();
    return;
  }

  if (!Array.isArray(all) || all.length === 0) {
    lastFetchedOrders = [];
    list.innerHTML = `<p class="orders-empty">No orders to display.</p>`;
    updateOrdersControls();
    return;
  }

  const routable = all.filter(isRoutable);
  lastFetchedOrders = routable;

  const visibleIds = new Set(routable.map((o) => o.id));
  for (const id of [...selectedOrderIds]) {
    if (!visibleIds.has(id)) selectedOrderIds.delete(id);
  }

  if (routable.length === 0) {
    list.innerHTML = `<p class="orders-empty">No routable orders right now. New paid orders will appear here.</p>`;
    updateOrdersControls();
    return;
  }

  list.innerHTML = routable.map(renderOrderCard).join('');
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

  const checked = selectedOrderIds.has(id) ? 'checked' : '';
  const checkbox = `<label class="order-select" aria-label="Select order ${escapeHtml(String(num))}">
                      <input type="checkbox" class="order-select-checkbox" data-order-id="${escapeHtml(id)}" ${checked}>
                    </label>`;

  const statusBadge = deliveryStatus
      ? `<span class="order-status order-status-${deliveryStatus.toLowerCase()}" title="Delivery: ${deliveryStatus}">${deliveryStatus}</span>`
      : `<span class="order-status order-status-${orderStatus.toLowerCase()}">${orderStatus}</span>`;

  return `
    <div class="order-card" data-order-id="${escapeHtml(id)}">
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

  const routableCount = lastFetchedOrders.length;
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
    if (checked) lastFetchedOrders.forEach((o) => selectedOrderIds.add(o.id));
    else lastFetchedOrders.forEach((o) => selectedOrderIds.delete(o.id));
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

  applyRouteToView(result);
  selectedOrderIds.clear();
  loadPage('route');
}


// ============================================================================
// Modals — active-route conflict, cancel-confirm
//
// Both use the .kiosk-modal-backdrop pattern. Only one modal at a time —
// any existing backdrop is removed before opening a new one.
// ============================================================================

function openModal(html, onAction) {
  document.querySelectorAll('.kiosk-modal-backdrop').forEach((el) => el.remove());

  const backdrop = document.createElement('div');
  backdrop.className = 'kiosk-modal-backdrop';
  backdrop.innerHTML = html;
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (e) => {
    const action = e.target.dataset && e.target.dataset.modalAction;
    // Backdrop click (outside the modal box) = dismiss
    if (!action && e.target === backdrop) {
      backdrop.remove();
      return;
    }
    if (!action) return;
    if (action === 'dismiss') {
      backdrop.remove();
      return;
    }
    // Hand the action to the caller so it can decide whether to close.
    if (typeof onAction === 'function') {
      onAction(action, backdrop);
    }
  });
}

function showActiveRouteConflictModal(activeRouteId) {
  openModal(`
    <div class="kiosk-modal" role="dialog" aria-labelledby="kiosk-modal-title">
      <h3 id="kiosk-modal-title">You already have an active route</h3>
      <p>You can have one active route at a time. Open it to continue, complete it, or cancel it.</p>
      <div class="kiosk-modal-actions">
        <button class="btn-secondary" type="button" data-modal-action="dismiss">Stay Here</button>
        <button class="btn-primary" type="button" data-modal-action="open-route">Open Active Route</button>
      </div>
    </div>
  `, (action, backdrop) => {
    if (action === 'open-route') {
      backdrop.remove();
      loadPage('route');
    }
  });
}

function showCancelRouteModal() {
  openModal(`
    <div class="kiosk-modal" role="dialog" aria-labelledby="kiosk-modal-title">
      <h3 id="kiosk-modal-title">Cancel this route?</h3>
      <p>All deliveries on this route will be released back to PENDING and become available to add to a new route. This can't be undone.</p>
      <div class="kiosk-modal-actions">
        <button class="btn-secondary" type="button" data-modal-action="dismiss">Keep Route</button>
        <button class="btn-danger" type="button" data-modal-action="confirm-cancel">Cancel Route</button>
      </div>
    </div>
  `, (action, backdrop) => {
    if (action === 'confirm-cancel') {
      backdrop.remove();
      handleRouteCancel();
    }
  });
}


// ============================================================================
// Route page — status bar + map + next-stop overlay
// ============================================================================

let currentRoute = null;

async function refreshActiveRoute() {
  const route = await window.celtechApi.getActiveRoute();
  applyRouteToView(route);
}

/**
 * Find the next stop that still needs action. A stop is "actionable" while
 * its status is not terminal (DELIVERED/FAILED/SKIPPED). Stops are sorted
 * by sequence so we get the first undelivered one in delivery order.
 */
function getNextStop(route) {
  if (!route || !Array.isArray(route.stops) || route.stops.length === 0) return null;
  const sorted = [...route.stops].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  return sorted.find((s) => {
    const st = s.status || 'PENDING';
    return st !== 'DELIVERED' && st !== 'FAILED' && st !== 'SKIPPED';
  }) || null;
}

/**
 * Paints the Route page. Three concerns:
 *
 *   1. Status bar contents — either the "No active route" empty form or
 *      the route's number/status/summary + appropriate action buttons.
 *   2. Map artifacts — clear and redraw geometry + stop markers when
 *      there's an active non-terminal route; clear them otherwise.
 *   3. Next-stop overlay — show only when the route is IN_PROGRESS AND
 *      there's a still-actionable stop.
 */
function applyRouteToView(route) {
  currentRoute = route;

  const statusInfo = document.getElementById('route-status-info');
  const statusEmpty = document.getElementById('route-status-empty');
  const statusActions = document.getElementById('route-status-actions');

  // If the route partial isn't mounted (the user navigated away during
  // an in-flight fetch), there's nothing to paint.
  if (!statusInfo || !statusEmpty) return;

  // ---- No active route ----
  if (!route) {
    statusInfo.hidden = true;
    statusEmpty.hidden = false;
    statusActions.innerHTML = '';
    if (typeof window.celtechClearRoute === 'function') {
      window.celtechClearRoute();
    }
    hideNextStopOverlay();
    return;
  }

  // ---- Active route — status bar ----
  statusEmpty.hidden = true;
  statusInfo.hidden = false;

  const number = document.getElementById('route-status-number');
  const pill = document.getElementById('route-status-pill');
  const summary = document.getElementById('route-status-summary');

  number.textContent = `Route ${route.routeNumber || ''}`;
  pill.textContent = route.status || '';
  pill.className = `route-status-pill route-status-pill-${(route.status || '').toLowerCase()}`;

  const totals = route.totals || {};
  const distKm = totals.distanceMeters != null ? (totals.distanceMeters / 1000).toFixed(1) + ' km' : '';
  const durMin = totals.durationSeconds != null ? Math.round(totals.durationSeconds / 60) + ' min' : '';
  const stopCount = totals.stopCount != null ? `${totals.stopCount} stop${totals.stopCount === 1 ? '' : 's'}` : '';
  summary.textContent = [stopCount, distKm, durMin].filter(Boolean).join(' · ');

  statusActions.innerHTML = renderStatusActions(route);

  // ---- Map artifacts ----
  const isTerminal = route.status === 'COMPLETED' || route.status === 'CANCELLED';
  if (typeof window.celtechClearRoute === 'function') {
    window.celtechClearRoute();
  }
  if (!isTerminal) {
    if (route.geometry && typeof window.celtechSetRoute === 'function') {
      window.celtechSetRoute(route.geometry);
    }
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

  // ---- Next-stop overlay ----
  // Only shown when the route is IN_PROGRESS (otherwise there's no Mark
  // Delivered action to take) AND there's still an actionable stop.
  if (route.status === 'IN_PROGRESS') {
    const next = getNextStop(route);
    if (next) showNextStopOverlay(next);
    else hideNextStopOverlay();
  } else {
    hideNextStopOverlay();
  }
}

function renderStatusActions(route) {
  const status = route.status;
  if (status === 'PLANNED') {
    return `
      <button class="btn-primary" type="button" data-route-action="start">Start Route</button>
      <button class="btn-secondary" type="button" data-route-action="cancel-prompt">Cancel</button>
    `;
  }
  if (status === 'IN_PROGRESS') {
    return `
      <button class="btn-primary" type="button" data-route-action="complete">Complete Route</button>
      <button class="btn-secondary" type="button" data-route-action="cancel-prompt">Cancel</button>
    `;
  }
  // COMPLETED / CANCELLED — terminal states.
  return `
    <button class="btn-primary" type="button" data-page="orders">Plan Another Route</button>
  `;
}

/**
 * Populate the bottom-left overlay with the given stop. Resets to the
 * collapsed view on each call (a new "current" stop shouldn't inherit
 * the previous one's expansion state).
 */
function showNextStopOverlay(stop) {
  const overlay = document.getElementById('next-stop-overlay');
  const seq = document.getElementById('next-stop-seq');
  const customerName = document.getElementById('next-stop-customer-name');
  const addrShort = document.getElementById('next-stop-address-short');
  const details = document.getElementById('next-stop-details');
  const phone = document.getElementById('next-stop-phone');
  const addrFull = document.getElementById('next-stop-address-full');
  const instructions = document.getElementById('next-stop-instructions');
  const markBtn = document.getElementById('next-stop-mark-btn');

  if (!overlay) return;

  seq.textContent = stop.sequence != null ? String(stop.sequence) : '?';
  customerName.textContent = stop.customerName || 'Unknown customer';

  const addr = stop.address || {};
  const cityState = [addr.city, addr.state].filter(Boolean).join(', ')
      + (addr.zip ? ` ${addr.zip}` : '');
  addrShort.textContent = cityState || '—';

  // Expanded view content
  phone.textContent = stop.customerPhone || '';
  phone.style.display = stop.customerPhone ? '' : 'none';

  const fullAddr = [addr.street1, addr.street2].filter(Boolean).join(', ');
  addrFull.textContent = fullAddr + (fullAddr && cityState ? ' · ' : '') + cityState;

  if (stop.deliveryInstructions) {
    instructions.textContent = `📋 ${stop.deliveryInstructions}`;
    instructions.hidden = false;
  } else {
    instructions.textContent = '';
    instructions.hidden = true;
  }

  // Mark Delivered button — carries the delivery id and is re-enabled
  // (in case the previous stop's mark put it in a "Marking…" state).
  markBtn.dataset.deliveryId = stop.deliveryId || '';
  markBtn.disabled = false;
  markBtn.textContent = 'Mark Delivered';

  // Always start collapsed for a freshly-shown stop.
  details.hidden = true;
  overlay.classList.remove('next-stop-overlay-expanded');
  overlay.hidden = false;
}

function hideNextStopOverlay() {
  const overlay = document.getElementById('next-stop-overlay');
  if (overlay) overlay.hidden = true;
}

function toggleNextStopExpansion() {
  const overlay = document.getElementById('next-stop-overlay');
  const details = document.getElementById('next-stop-details');
  if (!overlay || !details) return;
  const willExpand = details.hidden;
  details.hidden = !willExpand;
  overlay.classList.toggle('next-stop-overlay-expanded', willExpand);
}

function onRoutePageClick(event) {
  // Status bar action buttons
  const actionTarget = event.target.closest('[data-route-action]');
  if (actionTarget) {
    const action = actionTarget.dataset.routeAction;
    if (action === 'start') return handleRouteStart();
    if (action === 'complete') return handleRouteComplete();
    if (action === 'cancel-prompt') return showCancelRouteModal();
    return;
  }

  // Overlay actions
  const stopAction = event.target.closest('[data-stop-action]');
  if (stopAction) {
    const action = stopAction.dataset.stopAction;
    if (action === 'mark-delivered') {
      return handleMarkDelivered(stopAction.dataset.deliveryId, stopAction);
    }
    if (action === 'toggle-expand') {
      // Tap on the toggle button anywhere in the body — flip expansion.
      return toggleNextStopExpansion();
    }
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

async function handleRouteCancel() {
  if (!currentRoute) return;
  const updated = await window.celtechApi.cancelRoute(currentRoute.id);
  if (!updated) {
    alert('Could not cancel route. Try again.');
    return;
  }
  // After cancel, no route is active. Refresh from /active so the UI
  // accurately shows the empty state instead of the cancelled route.
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
  // Re-fetch the active route so applyRouteToView picks the new
  // "next stop" — or hides the overlay if everything's done.
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