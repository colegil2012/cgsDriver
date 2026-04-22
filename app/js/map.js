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

  const DEFAULT_ZOOM = 15;

  let map = null;
  let currentMarker = null;
  let apiLoaded = false;
  let apiLoading = false;

  // Load Google Maps JS API dynamically with the key from config
  function loadGoogleMapsApi(callback) {
    if (apiLoaded) {
      callback();
      return;
    }
    if (apiLoading) {
      // Another call is already loading the API — wait for it
      const checkInterval = setInterval(() => {
        if (apiLoaded) {
          clearInterval(checkInterval);
          callback();
        }
      }, 100);
      return;
    }

    if (!window.CELTECH_CONFIG || !window.CELTECH_CONFIG.GOOGLE_MAPS_API_KEY) {
      showError('Missing API key configuration');
      return;
    }

    apiLoading = true;
    window.__celtechMapsCallback = function () {
      apiLoaded = true;
      apiLoading = false;
      callback();
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${window.CELTECH_CONFIG.GOOGLE_MAPS_API_KEY}&callback=__celtechMapsCallback&loading=async`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      apiLoading = false;
      showError('Failed to load Google Maps');
    };
    document.head.appendChild(script);
  }

  // Get current location — uses browser geolocation for now.
  // When GPS hat arrives, replace this with a function that reads from it.
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
          enableHighAccuracy: false,  // Low accuracy OK for network-based location
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

    map = new google.maps.Map(mapDiv, {
      center: { lat: location.lat, lng: location.lng },
      zoom: DEFAULT_ZOOM,
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: 'greedy',  // Single-finger pan on touchscreens
      styles: [
        // Optional dark-ish theme to match the Celtech UI
        { elementType: 'geometry', stylers: [{ color: '#1a2415' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#1a2415' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#d4e0cc' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#3d5230' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1a08' }] }
      ]
    });

    currentMarker = new google.maps.Marker({
      position: { lat: location.lat, lng: location.lng },
      map: map,
      title: 'You are here'
    });

    updateStatus(location);
  }

  // Public entry point — called from app.js after route partial loads
  window.celtechInitMap = function () {
    loadGoogleMapsApi(() => {
      getCurrentPosition().then((location) => {
        initMap(location);
      });
    });
  };

  // Hook for future GPS hat updates — call this with new coords to recenter
  window.celtechUpdateLocation = function (lat, lng) {
    if (!map || !currentMarker) return;
    const pos = { lat, lng };
    currentMarker.setPosition(pos);
    map.panTo(pos);
  };
})();