// Celtech Kiosk — Geocoding Module (MapTiler)
// Converts addresses to coordinates and vice versa.

(function () {
  'use strict';

  const BASE_URL = 'https://api.maptiler.com/geocoding';

  function getKey() {
    const key = window.CELTECH_CONFIG && window.CELTECH_CONFIG.MAPTILER_API_KEY;
    if (!key) {
      console.error('MAPTILER_API_KEY missing from config');
      return null;
    }
    return key;
  }

  // Forward geocode: address string -> { lat, lng, formatted, confidence }
  // Returns null if no results or on error
  window.celtechGeocode = async function (address, options = {}) {
    const key = getKey();
    if (!key) return null;

    const query = encodeURIComponent(address);
    const params = new URLSearchParams({ key });

    // Bias results toward a center point if provided (helps keep results local)
    if (options.bias && options.bias.lat != null && options.bias.lng != null) {
      params.set('proximity', `${options.bias.lng},${options.bias.lat}`);
    }

    // Limit to a bounding box if provided
    // bbox format: { minLng, minLat, maxLng, maxLat }
    if (options.bbox) {
      const { minLng, minLat, maxLng, maxLat } = options.bbox;
      params.set('bbox', `${minLng},${minLat},${maxLng},${maxLat}`);
    }

    // Limit to country (ISO code, e.g. 'us')
    if (options.country) {
      params.set('country', options.country);
    }

    const url = `${BASE_URL}/${query}.json?${params.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error('Geocoding failed:', response.status);
        return null;
      }
      const data = await response.json();

      if (!data.features || data.features.length === 0) {
        return null;
      }

      const first = data.features[0];
      const [lng, lat] = first.center;
      return {
        lat,
        lng,
        formatted: first.place_name,
        confidence: first.relevance,
        raw: first
      };
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  };

  // Reverse geocode: coordinates -> readable address
  window.celtechReverseGeocode = async function (lat, lng) {
    const key = getKey();
    if (!key) return null;

    const url = `${BASE_URL}/${lng},${lat}.json?key=${key}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error('Reverse geocoding failed:', response.status);
        return null;
      }
      const data = await response.json();

      if (!data.features || data.features.length === 0) {
        return null;
      }

      const first = data.features[0];
      return {
        formatted: first.place_name,
        raw: first
      };
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return null;
    }
  };
})();
