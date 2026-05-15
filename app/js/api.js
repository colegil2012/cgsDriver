// Celtech Kiosk — Backend API Client
//
// Thin wrapper around the Spring Boot driver endpoints. Centralizes:
//   - base URL resolution (from CELTECH_CONFIG.API_BASE_URL)
//   - bearer-token injection (from CELTECH_CONFIG.CELTECH_DRIVER_TOKEN)
//   - JSON handling + error logging
//
// All methods return null on failure so callers don't need try/catch — matches
// the convention used by geocoder.js and router.js.
//
// generateRoute is the one method that DOES return more than just null on
// failure: a 409 (route-already-active) returns an object with an `error`
// shape so the kiosk can navigate the driver to the existing route. Other
// 409s are logged and return null like other failures.
//
// Backend endpoints:
//   GET   /api/driver/orders                          -> [DriverOrderDTO]
//   POST  /api/driver/routes                          -> RouteDTO   (201 new / 200 idempotency)
//                                                       409 if a route is already active
//   GET   /api/driver/routes/active                   -> RouteDTO   (404 if none)
//   GET   /api/driver/routes/{id}                     -> RouteDTO
//   POST  /api/driver/routes/{id}/start               -> RouteDTO
//   POST  /api/driver/routes/{id}/complete            -> RouteDTO
//   POST  /api/driver/routes/{id}/cancel              -> RouteDTO
//   PATCH /api/driver/deliveries/{id}/status          -> { deliveryId, status, deliveredAt, attemptCount }

(function () {
    'use strict';

    function getBase() {
        const base = window.CELTECH_CONFIG && window.CELTECH_CONFIG.API_BASE_URL;
        if (!base) {
            console.error('API_BASE_URL missing from config');
            return null;
        }
        return base.replace(/\/$/, '');
    }

    function authHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = window.CELTECH_CONFIG && window.CELTECH_CONFIG.CELTECH_DRIVER_TOKEN;
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        } else {
            console.warn('CELTECH_DRIVER_TOKEN missing — API requests will be rejected');
        }
        return headers;
    }

    /**
     * Core fetch wrapper.
     *
     * Behavior on non-2xx:
     *   - quiet404: returns null without logging (used by /active where 404 is expected)
     *   - capture409: returns the parsed error body so callers can branch on it
     *                 (used by POST /routes for the active-route conflict)
     *   - otherwise: logs the error and returns null
     */
    async function request(method, path, body, opts) {
        opts = opts || {};
        const base = getBase();
        if (!base) return null;

        const fetchOpts = {
            method,
            headers: authHeaders()
        };
        if (body !== undefined) {
            fetchOpts.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(`${base}${path}`, fetchOpts);

            if (!response.ok) {
                // Quiet 404 — expected for /active when no route is active.
                if (response.status === 404 && opts.quiet404) {
                    return null;
                }
                // 409 — let the caller see the parsed body if asked.
                if (response.status === 409 && opts.capture409) {
                    const errBody = await response.json().catch(() => null);
                    return { __apiError: true, status: 409, body: errBody };
                }
                const text = await response.text().catch(() => '');
                console.error(`API ${method} ${path} failed:`, response.status, text);
                return null;
            }

            if (response.status === 204) return true;

            const text = await response.text();
            if (!text) return true;
            try {
                return JSON.parse(text);
            } catch (parseErr) {
                console.error(`API ${method} ${path} returned non-JSON:`, parseErr);
                return null;
            }
        } catch (error) {
            console.error(`API ${method} ${path} network error:`, error);
            return null;
        }
    }

    window.celtechApi = {

        // ====================================================================
        // Orders
        // ====================================================================

        fetchOrders: function () {
            return request('GET', '/api/driver/orders');
        },

        // ====================================================================
        // Routes
        // ====================================================================

        /**
         * Generate a route. The idempotency key guards against double-clicks.
         *
         * Special handling: on a 409 from the active-route guard, returns an
         * object {__apiError: true, status: 409, body: {error, message, details: {activeRouteId}}}
         * so the kiosk can navigate the driver to the existing route. All
         * other failures still return null.
         */
        generateRoute: function (orderIds, idempotencyKey) {
            return request(
                'POST',
                '/api/driver/routes',
                { orderIds, idempotencyKey },
                { capture409: true }
            );
        },

        /**
         * Fetch the currently-active route, or null if none. A 404 from the
         * backend is treated as a successful "no active route" result — no
         * scary console error in that case.
         */
        getActiveRoute: function () {
            return request('GET', '/api/driver/routes/active', undefined, { quiet404: true });
        },

        /** Fetch a specific route by id. */
        getRoute: function (routeId) {
            return request('GET', `/api/driver/routes/${encodeURIComponent(routeId)}`);
        },

        /** Transition PLANNED -> IN_PROGRESS. */
        startRoute: function (routeId) {
            return request('POST', `/api/driver/routes/${encodeURIComponent(routeId)}/start`);
        },

        /** Transition IN_PROGRESS -> COMPLETED. */
        completeRoute: function (routeId) {
            return request('POST', `/api/driver/routes/${encodeURIComponent(routeId)}/complete`);
        },

        /** Cancel an active route. Releases its deliveries back to PENDING. */
        cancelRoute: function (routeId) {
            return request('POST', `/api/driver/routes/${encodeURIComponent(routeId)}/cancel`);
        },

        // ====================================================================
        // Deliveries
        // ====================================================================

        updateDeliveryStatus: function (deliveryId, outcome, notes) {
            const body = { outcome };
            if (notes != null && notes !== '') body.notes = notes;
            return request(
                'PATCH',
                `/api/driver/deliveries/${encodeURIComponent(deliveryId)}/status`,
                body
            );
        }
    };
})();