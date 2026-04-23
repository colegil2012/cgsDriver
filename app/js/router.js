// Celtech Kiosk — Routing Module (OpenRouteService)
// Calculates driving routes between points.

(function () {
  'use strict';

  const BASE_URL = 'https://api.openrouteservice.org/v2/directions';

  function getKey() {
    const key = window.CELTECH_CONFIG && window.CELTECH_CONFIG.ORS_API_KEY;
    if (!key) {
      console.error('ORS_API_KEY missing from config');
      return null;
    }
    return key;
  }

  // Calculate a route between waypoints.
  // Inputs:
  //   points: array of { lat, lng } — at least 2 (start and end)
  //   profile: 'driving-car' (default) | 'driving-hgv' | 'cycling-regular' | 'foot-walking'
  //
  // Returns an object with:
  //   geojson: GeoJSON LineString (pass this straight to celtechSetRoute)
  //   distanceMeters: total distance
  //   durationSeconds: estimated driving time
  //   steps: turn-by-turn instructions
  //   raw: full API response
  //
  // Returns null on error
  window.celtechGetRoute = async function (points, profile = 'driving-car') {
    const key = getKey();
    if (!key) return null;

    if (!Array.isArray(points) || points.length < 2) {
      console.error('celtechGetRoute requires at least 2 points');
      return null;
    }

    // ORS expects [lng, lat] order
    const coordinates = points.map((p) => [p.lng, p.lat]);

    const url = `${BASE_URL}/${profile}/geojson`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': key,
          'Content-Type': 'application/json',
          'Accept': 'application/json, application/geo+json'
        },
        body: JSON.stringify({
          coordinates,
          instructions: true,
          units: 'mi'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Routing failed:', response.status, errorText);
        return null;
      }

      const data = await response.json();

      if (!data.features || data.features.length === 0) {
        console.warn('No route found');
        return null;
      }

      const route = data.features[0];
      const summary = route.properties.summary || {};
      const segments = route.properties.segments || [];

      // Flatten all turn-by-turn steps across segments
      const steps = [];
      segments.forEach((segment) => {
        (segment.steps || []).forEach((step) => {
          steps.push({
            instruction: step.instruction,
            distanceMeters: step.distance,
            durationSeconds: step.duration,
            name: step.name
          });
        });
      });

      return {
        geojson: {
          type: 'Feature',
          geometry: route.geometry,
          properties: {}
        },
        distanceMeters: summary.distance || 0,
        durationSeconds: summary.duration || 0,
        steps,
        raw: data
      };
    } catch (error) {
      console.error('Routing error:', error);
      return null;
    }
  };

  // Helper: format duration as "1h 23m" or "45m"
  window.celtechFormatDuration = function (seconds) {
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  };

  // Helper: format distance in miles
  window.celtechFormatDistance = function (meters) {
    const miles = meters / 1609.344;
    if (miles < 0.1) return `${Math.round(meters)} m`;
    return `${miles.toFixed(1)} mi`;
  };
})();
