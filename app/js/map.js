// Celtech Kiosk — Map Module (Google Maps)
//
// Public surface unchanged from the MapLibre version, so app.js doesn't need
// to be touched:
//   window.celtechInitMap()
//   window.celtechUpdateLocation(lat, lng)
//   window.celtechSetRoute(geojsonLineString)
//   window.celtechAddMarker(lat, lng, label)
//
// Behavior change: no browser geolocation. The map centers on FALLBACK_LOCATION
// until the GPS chip integration calls celtechUpdateLocation() with real
// coordinates.
//
// This module also injects the Google Maps JS API loader script. config.js
// must be loaded before this file (it is, per the script order in index.html)
// so CELTECH_CONFIG.GOOGLE_MAPS_API_KEY is available.

(function () {
  'use strict';

  // ===== Google Maps API loader =====
  // Inject the loader script as soon as map.js parses. The API will download
  // in parallel with the rest of the page; the callback resolves apiReady
  // (defined below) so celtechInitMap() can fire whenever the route page
  // mounts, regardless of API load order.
  function injectGoogleMapsLoader() {
    // Don't double-inject if map.js somehow runs twice.
    if (document.querySelector('script[data-celtech-google-maps]')) return;

    const key = window.CELTECH_CONFIG && window.CELTECH_CONFIG.GOOGLE_MAPS_API_KEY;
    if (!key) {
      console.error('GOOGLE_MAPS_API_KEY missing from config — map will not load');
      return;
    }

    const s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js'
        + '?key=' + encodeURIComponent(key)
        + '&libraries=marker,geometry'
        + '&loading=async'
        + '&v=weekly'
        + '&callback=celtechOnGoogleMapsReady';
    s.async = true;
    s.defer = true;
    s.dataset.celtechGoogleMaps = 'true';
    document.head.appendChild(s);
  }

  injectGoogleMapsLoader();

  // ===== Config / state =====

  // Dev fallback / shop home base. Keep in sync with the storefront site.
  const FALLBACK_LOCATION = {
    lat: 38.003,
    lng: -85.715
  };

  const DEFAULT_ZOOM = 14;

  // Celtech dark-green map style. Applied as inline styles when no
  // GOOGLE_MAP_ID is configured. (When a Map ID is set, Google uses the
  // cloud-based style for that ID and ignores this array.)
  //
  // Palette pulled from style.css:
  //   #1a2415  body bg            -> map land
  //   #243320  body gradient end  -> POI / parks
  //   #2a3a22  sidebar bg
  //   #3d5230  borders
  //   #556b44  active bg          -> roads
  //   #a8d49b  green-light accent -> natural feature labels
  //   #c9a962  gold accent        -> highway hint, label strokes
  //   #d4e0cc  body text          -> general label text
  //   #e8f0e3  brightest text
  const CELTECH_MAP_STYLE = [
    { elementType: 'geometry', stylers: [{ color: '#1a2415' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#d4e0cc' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#1a2415' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

    // Administrative boundaries — subdued
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#3d5230' }] },
    { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#a8d49b' }] },
    { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#a8d49b' }] },

    // Points of interest — muted so delivery markers stand out
    { featureType: 'poi', stylers: [{ visibility: 'simplified' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#243320' }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#a8d49b' }] },
    { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#2a3a22' }] },
    { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#a8d49b' }] },

    // Roads — primary visual content; need to read clearly against the land
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#556b44' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#3d5230' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#d4e0cc' }] },
    { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#1a2415' }] },

    // Highways — slight gold treatment so main arteries pop
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#6d8455' }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#c9a962' }] },
    { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#e8f0e3' }] },
    { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#7a9461' }] },

    // Local roads quieter
    { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#3d5230' }] },
    { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#a8d49b' }] },

    // Transit
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#3d5230' }] },
    { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#2a3a22' }] },

    // Water — darker than land, with a slight teal-green cool tone
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f1a0c' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#a8d49b' }] },
    { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#0f1a0c' }] },

    // Natural features (forests, etc.)
    { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#1f2c19' }] },
    { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#1a2415' }] }
  ];

  let map = null;
  let currentMarker = null;
  let routePolyline = null;
  let extraMarkers = [];

  // The Google loader calls this global on ready. celtechInitMap may fire
  // before or after the API loads, so we gate map construction on a promise
  // that resolves when this is invoked.
  let apiReadyResolve;
  const apiReady = new Promise((resolve) => { apiReadyResolve = resolve; });
  window.celtechOnGoogleMapsReady = function () {
    apiReadyResolve();
  };

  function showError(message) {
    const status = document.getElementById('map-status');
    if (status) {
      status.textContent = message;
      status.classList.add('error');
    }
  }

  function updateStatus(location, source) {
    const status = document.getElementById('map-status');
    if (!status) return;

    if (source === 'fallback') {
      status.textContent = 'Awaiting GPS — showing home base';
      status.classList.remove('fade-out');
      status.classList.add('warning');
    } else {
      status.classList.remove('warning', 'error');
      status.textContent = `Location: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
      setTimeout(() => { status.classList.add('fade-out'); }, 3000);
    }
  }

  function hasAdvancedMarker() {
    const mapId = window.CELTECH_CONFIG && window.CELTECH_CONFIG.GOOGLE_MAP_ID;
    return !!(mapId
        && google.maps.marker
        && google.maps.marker.AdvancedMarkerElement);
  }

  function buildMap(location) {
    const mapDiv = document.getElementById('map');
    if (!mapDiv) return;

    const mapId = window.CELTECH_CONFIG && window.CELTECH_CONFIG.GOOGLE_MAP_ID;

    const options = {
      center: { lat: location.lat, lng: location.lng },
      zoom: DEFAULT_ZOOM,
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: 'greedy',  // single-finger pan on touch — kiosk-friendly
      clickableIcons: false
    };

    // Map ID enables cloud styling + AdvancedMarkerElement, and when set,
    // Google ignores inline `styles`. So we only apply the inline Celtech
    // style when no Map ID is configured.
    if (mapId) {
      options.mapId = mapId;
    } else {
      options.styles = CELTECH_MAP_STYLE;
    }

    map = new google.maps.Map(mapDiv, options);

    // "You are here" / home base marker.
    if (hasAdvancedMarker()) {
      const pin = new google.maps.marker.PinElement({
        background: '#c9a962',
        borderColor: '#1a2415',
        glyphColor: '#1a2415',
        scale: 1.1
      });
      currentMarker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: location.lat, lng: location.lng },
        content: pin.element,
        title: 'Current location'
      });
    } else {
      currentMarker = new google.maps.Marker({
        map,
        position: { lat: location.lat, lng: location.lng },
        title: 'Current location'
      });
    }

    updateStatus(location, 'fallback');
  }

  function setMarkerPosition(marker, lat, lng) {
    if (!marker) return;
    const pos = { lat, lng };
    if (typeof marker.setPosition === 'function') {
      // Legacy google.maps.Marker
      marker.setPosition(pos);
    } else {
      // AdvancedMarkerElement
      marker.position = pos;
    }
  }

  // ===== Public interface (unchanged signatures) =====

  window.celtechInitMap = function () {
    apiReady.then(() => {
      try {
        buildMap(FALLBACK_LOCATION);
      } catch (err) {
        console.error('Map init failed:', err);
        showError('Map failed to load');
      }
    });
  };

  // GPS hat integration will call this with real coordinates.
  window.celtechUpdateLocation = function (lat, lng) {
    if (!map || !currentMarker) return;
    setMarkerPosition(currentMarker, lat, lng);
    map.panTo({ lat, lng });
    updateStatus({ lat, lng }, 'gps');
  };

  // Draw a route on the map. Accepts a GeoJSON LineString Feature (same shape
  // router.js returns) so the existing routing module continues to work.
  // GeoJSON coordinates are [lng, lat] order.
  window.celtechSetRoute = function (geojsonLineString) {
    if (!map || !geojsonLineString) return;

    const geom = geojsonLineString.geometry || geojsonLineString;
    if (!geom || geom.type !== 'LineString' || !Array.isArray(geom.coordinates)) {
      console.warn('celtechSetRoute: expected GeoJSON LineString');
      return;
    }

    const path = geom.coordinates.map(([lng, lat]) => ({ lat, lng }));

    if (routePolyline) {
      routePolyline.setMap(null);
    }

    routePolyline = new google.maps.Polyline({
      path,
      geodesic: false,
      strokeColor: '#c9a962',
      strokeOpacity: 0.85,
      strokeWeight: 5,
      map
    });

    if (path.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      path.forEach((pt) => bounds.extend(pt));
      map.fitBounds(bounds, 60);
    }
  };

  // Drop a marker at an arbitrary lat/lng (used for delivery stops).
  window.celtechAddMarker = function (lat, lng, label) {
    if (!map) return null;

    let marker;
    if (hasAdvancedMarker()) {
      const pin = new google.maps.marker.PinElement({
        background: '#a8d49b',
        borderColor: '#1a2415',
        glyphColor: '#1a2415'
      });
      marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat, lng },
        content: pin.element,
        title: label || ''
      });
    } else {
      marker = new google.maps.Marker({
        map,
        position: { lat, lng },
        title: label || ''
      });
    }

    if (label) {
      const info = new google.maps.InfoWindow({ content: label });
      const isLegacy = (typeof marker.setPosition === 'function');
      const eventName = isLegacy ? 'click' : 'gmp-click';
      marker.addListener(eventName, () => info.open({ map, anchor: marker }));
    }

    extraMarkers.push(marker);
    return marker;
  };
})();