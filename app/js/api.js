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
// Backend endpoints:
//   GET   /api/driver/orders                          -> [DriverOrderDTO]
//   POST  /api/driver/routes                          -> RouteDTO    (201 new / 200 idempotency match)
//   GET   /api/driver/routes/{id}                     -> RouteDTO
//   PATCH /api/driver/deliveries/{id}/status          -> { deliveryId, status, deliveredAt, attemptCount }

(function () {
    'use strict';

    function getBase() {
        const base = window.CELTECH_CONFIG && window.CELTECH_CONFIG.API_BASE_URL;
        if (!base) {
            console.error('API_BASE_URL missing from config');
            return null;
        }
        // Strip trailing slash so we can concatenate paths without doubling it.
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

    async function request(method, path, body) {
        const base = getBase();
        if (!base) return null;

        const opts = {
            method,
            headers: authHeaders()
        };
        if (body !== undefined) {
            opts.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(`${base}${path}`, opts);
            if (!response.ok) {
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
            // Network errors land here — DNS failure, connection refused, etc.
            console.error(`API ${method} ${path} network error:`, error);
            return null;
        }
    }

    window.celtechApi = {

        // ====================================================================
        // Orders
        // ====================================================================

        /**
         * Fetch every order (sorted newest first server-side).
         * @returns {Promise<Array|null>} array of DriverOrderDTO, or null on failure
         */
        fetchOrders: function () {
            return request('GET', '/api/driver/orders');
        },

        // ====================================================================
        // Routes
        // ====================================================================

        /**
         * Generate a route from selected order ids.
         *
         * The idempotency key guards against double-clicks and network retries:
         * resubmitting with the same key returns the existing route (HTTP 200)
         * instead of generating a new one (HTTP 201). Callers should generate
         * a fresh UUID per Generate-Route click.
         *
         * @param {string[]} orderIds       order ids selected by the driver
         * @param {string}   idempotencyKey UUID per generation attempt
         * @returns {Promise<Object|null>}  RouteDTO, or null on failure
         */
        generateRoute: function (orderIds, idempotencyKey) {
            return request('POST', '/api/driver/routes', {
                orderIds,
                idempotencyKey
            });
        },

        /**
         * Re-fetch a previously generated route by id.
         * Used when the kiosk navigates back to the Route tab after losing
         * in-memory state (e.g. page refresh).
         *
         * @param {string} routeId
         * @returns {Promise<Object|null>} RouteDTO, or null on failure
         */
        getRoute: function (routeId) {
            return request('GET', `/api/driver/routes/${encodeURIComponent(routeId)}`);
        },

        // ====================================================================
        // Deliveries
        // ====================================================================

        /**
         * Record the outcome of a delivery attempt.
         *
         * @param {string} deliveryId
         * @param {('SUCCESS'|'FAILED'|'SKIPPED')} outcome
         * @param {string} [notes] optional driver notes captured on the attempt
         * @returns {Promise<Object|null>} { deliveryId, status, deliveredAt, attemptCount } or null
         */
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