// Celtech Kiosk — Backend API Client
//
// Thin wrapper around the Spring Boot driver endpoints. Centralizes:
//   - base URL resolution (from CELTECH_CONFIG.API_BASE_URL)
//   - bearer-token injection (from CELTECH_CONFIG.DRIVER_DEVICE_TOKEN)
//   - JSON handling + error logging
//
// All methods return null on failure so callers don't need try/catch — matches
// the convention used by geocoder.js and router.js.
//
// Backend endpoints expected (build these on the Spring Boot side as needed):
//   GET   /api/driver/orders                 -> [DriverOrderDTO]
//   (future) PATCH /api/driver/orders/{id}/status
//   (future) POST  /api/driver/gps
//   (future) GET   /api/driver/route

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
        const token = window.CELTECH_CONFIG && window.CELTECH_CONFIG.DRIVER_DEVICE_TOKEN;
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        } else {
            console.warn('DRIVER_DEVICE_TOKEN missing — API requests will be rejected');
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
        fetchOrders: function () {
            return request('GET', '/api/driver/orders');
        }
    };
})();