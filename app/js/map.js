// Celtech Kiosk — Map Module
// Handles Google Maps initialization and current-location centering.
// Designed to swap in GPS hat data later without changing this interface.

(function () {
  'use strict';

  // Dev fallback location — used if geolocation fails or is denied
  // Set this to your shop or home base coordinates
  const FALLBACK_LOCATION = {
    lat: 38.003,
    lng: -85.715
  };

  const DEFAULT_ZOOM = 14;

  // MapTiler style URL — "streets-v2" is their main interactive style.
  // Other options: "basic-v2", "outdoor-v2", "satellite", "hybrid", "toner-v2"
  function getStyleUrl() {
    const key = window.CELTECH_CONFIG && window.CELTECH_CONFIG.MAPTILER_API_KEY;
    if (!key) {
      console.error('MAPTILER_API_KEY missing from config');
      return null;
    }
    return `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`;
  }

  let map = null;
  let currentMarker = null;
  let routeLayerAdded = false;

  // Get current location — browser geolocation for now,
  // GPS hat integration later will replace this function only
  function getCurrentPosition() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        console.warn('Geolocation not available, using fallback');
        resolve({ ...FALLBACK_LOCATION, source: 'fallback' });
        return;
      }

      const timeoutId = setTimeout(() => {
        console.warn('Geolocation timeout, using fallback');
        resolve({ ...FALLBACK_LOCATION, source: 'fallback' });
      }, 8000);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            source: 'browser'
          });
        },
        (error) => {
          clearTimeout(timeoutId);
          console.warn('Geolocation error:', error.message, '— using fallback');
          resolve({ ...FALLBACK_LOCATION, source: 'fallback' });
        },
        {
          enableHighAccuracy: false,
          timeout: 7000,
          maximumAge: 60000
        }
      );
    });
  }

  function showError(message) {
    const status = document.getElementById('map-status');
    if (status) {
      status.textContent = message;
      status.classList.add('error');
    }
  }

  function updateStatus(location) {
    const status = document.getElementById('map-status');
    if (!status) return;

    if (location.source === 'fallback') {
      status.textContent = 'Using fallback location (GPS unavailable)';
      status.classList.add('warning');
    } else {
      status.textContent = `Location: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
      setTimeout(() => {
        status.classList.add('fade-out');
      }, 3000);
    }
  }

  function initMap(location) {
    const mapDiv = document.getElementById('map');
    if (!mapDiv) return;

    const styleUrl = getStyleUrl();
    if (!styleUrl) {
      showError('Missing map API key');
      return;
    }

    map = new maplibregl.Map({
      container: 'map',
      style: styleUrl,
      center: [location.lng, location.lat],  // MapLibre uses [lng, lat] order
      zoom: DEFAULT_ZOOM,
      attributionControl: true
    });

    // Navigation controls (zoom in/out, compass)
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    // Drop a "you are here" marker
    currentMarker = new maplibregl.Marker({ color: '#c9a962' })
      .setLngLat([location.lng, location.lat])
      .addTo(map);

    updateStatus(location);
  }

  // ===== Public interface =====

  // Called by app.js after route partial loads
  window.celtechInitMap = function () {
    if (typeof maplibregl === 'undefined') {
      showError('MapLibre GL not loaded');
      return;
    }
    getCurrentPosition().then((location) => {
      initMap(location);
    });
  };

  // Called by GPS integration later to update the current location marker
  window.celtechUpdateLocation = function (lat, lng) {
    if (!map || !currentMarker) return;
    currentMarker.setLngLat([lng, lat]);
    map.panTo([lng, lat]);
  };

  // Draw a route on the map — takes a GeoJSON LineString (as returned by router.js)
  window.celtechSetRoute = function (geojsonLineString) {
    if (!map) return;

    // Wait until map style is loaded before adding sources/layers
    const addRoute = () => {
      if (routeLayerAdded) {
        map.getSource('celtech-route').setData(geojsonLineString);
        return;
      }

      map.addSource('celtech-route', {
        type: 'geojson',
        data: geojsonLineString
      });

      map.addLayer({
        id: 'celtech-route-line',
        type: 'line',
        source: 'celtech-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#c9a962',
          'line-width': 5,
          'line-opacity': 0.85
        }
      });

      routeLayerAdded = true;
    };

    if (map.isStyleLoaded()) {
      addRoute();
    } else {
      map.once('load', addRoute);
    }
  };

  // Drop a marker at an arbitrary lat/lng (used for delivery stops)
  window.celtechAddMarker = function (lat, lng, label) {
    if (!map) return null;
    const marker = new maplibregl.Marker({ color: '#a8d49b' })
      .setLngLat([lng, lat])
      .addTo(map);
    if (label) {
      const popup = new maplibregl.Popup({ offset: 25 }).setText(label);
      marker.setPopup(popup);
    }
    return marker;
  };
})();
