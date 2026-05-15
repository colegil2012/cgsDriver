// Celtech Kiosk — Map Module (Google Maps)
//
// Public surface — preserved from the prior version, plus one addition:
//   window.celtechInitMap()
//   window.celtechUpdateLocation(lat, lng)
//   window.celtechSetRoute(geojsonLineString)
//   window.celtechAddMarker(lat, lng, label)
//   window.celtechClearRoute()                    <-- NEW
//
// Behavior addition (transparent to callers):
//   celtechSetRoute may be called BEFORE the map is built — e.g. the Orders
//   tab calls it the moment a route is generated, but the map only exists
//   after the Route partial mounts and the Google API loads. In that case
//   the route is queued and applied as soon as the map is ready.
//
//   Same for celtechAddMarker: pending markers are queued. (Less common but
//   keeps the contract consistent — anything you draw before init runs gets
//   applied when init runs.)
//
// No browser geolocation. The map centers on FALLBACK_LOCATION until the
// GPS chip integration calls celtechUpdateLocation() with real coordinates.

(function () {
  'use strict';

  // ===== Google Maps API loader =====
  function injectGoogleMapsLoader() {
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

  const FALLBACK_LOCATION = { lat: 38.003, lng: -85.715 };
  const DEFAULT_ZOOM = 14;

  // Celtech dark-green map style (unchanged — applied when no Map ID is set).
  const CELTECH_MAP_STYLE = [
    { elementType: 'geometry', stylers: [{ color: '#1a2415' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#d4e0cc' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#1a2415' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#3d5230' }] },
    { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#a8d49b' }] },
    { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#a8d49b' }] },
    { featureType: 'poi', stylers: [{ visibility: 'simplified' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#243320' }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#a8d49b' }] },
    { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#2a3a22' }] },
    { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#a8d49b' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#556b44' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#3d5230' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#d4e0cc' }] },
    { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#1a2415' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#6d8455' }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#c9a962' }] },
    { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#e8f0e3' }] },
    { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#7a9461' }] },
    { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#3d5230' }] },
    { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#a8d49b' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#3d5230' }] },
    { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#2a3a22' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f1a0c' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#a8d49b' }] },
    { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#0f1a0c' }] },
    { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#1f2c19' }] },
    { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#1a2415' }] }
  ];

  // Live state — populated when the map is built.
  let map = null;
  let currentMarker = null;
  let routePolyline = null;
  let extraMarkers = [];

  // Queue for draws that happen before the map is ready. Drained in buildMap.
  // Each entry is a function that draws against the live `map` once it exists.
  let pendingDraws = [];

  // Google API readiness — the loader calls this on ready. Gates buildMap.
  let apiReadyResolve;
  const apiReady = new Promise((resolve) => { apiReadyResolve = resolve; });
  window.celtechOnGoogleMapsReady = function () {
    apiReadyResolve();
  };

  // ===== Internal helpers =====

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
      gestureHandling: 'greedy',
      clickableIcons: false
    };

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

    // Drain anything queued before the map existed. Run in order so a
    // setRoute followed by clearRoute behaves predictably.
    if (pendingDraws.length > 0) {
      const draws = pendingDraws;
      pendingDraws = [];
      draws.forEach((fn) => {
        try { fn(); } catch (err) { console.error('Pending draw failed:', err); }
      });
    }
  }

  function setMarkerPosition(marker, lat, lng) {
    if (!marker) return;
    const pos = { lat, lng };
    if (typeof marker.setPosition === 'function') {
      marker.setPosition(pos);
    } else {
      marker.position = pos;
    }
  }

  function drawRoute(geojsonLineString) {
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
  }

  function drawMarker(lat, lng, label) {
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
  }

  function clearRouteState() {
    if (routePolyline) {
      routePolyline.setMap(null);
      routePolyline = null;
    }
    extraMarkers.forEach((m) => {
      if (typeof m.setMap === 'function') m.setMap(null);
      else m.map = null;                       // AdvancedMarkerElement
    });
    extraMarkers = [];
  }

  // ===== Public interface =====

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

  window.celtechUpdateLocation = function (lat, lng) {
    if (!map || !currentMarker) return;
    setMarkerPosition(currentMarker, lat, lng);
    map.panTo({ lat, lng });
    updateStatus({ lat, lng }, 'gps');
  };

  // Draw a route. Safe to call before the map exists — gets queued and
  // applied when buildMap runs.
  window.celtechSetRoute = function (geojsonLineString) {
    if (!geojsonLineString) return;
    if (map) {
      drawRoute(geojsonLineString);
    } else {
      // Replace any prior pending route — only the latest one matters.
      pendingDraws = pendingDraws.filter((d) => !d.__isRoute);
      const fn = () => drawRoute(geojsonLineString);
      fn.__isRoute = true;
      pendingDraws.push(fn);
    }
  };

  // Drop a marker. Safe to call before the map exists.
  window.celtechAddMarker = function (lat, lng, label) {
    if (map) return drawMarker(lat, lng, label);
    pendingDraws.push(() => drawMarker(lat, lng, label));
    return null;
  };

  // Clear the current route polyline and all extra markers. Used when
  // generating a new route after one was already drawn.
  window.celtechClearRoute = function () {
    if (map) {
      clearRouteState();
    } else {
      // Drop any pending draws — we don't want to apply a stale route after init.
      pendingDraws = pendingDraws.filter((d) => !d.__isRoute && !d.__isMarker);
    }
  };
})();