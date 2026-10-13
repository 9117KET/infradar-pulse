/**
 * Shared Leaflet basemap for every map in the app (landing hero, dashboard
 * overview, Geo Intelligence). Keep the URL in one place so a provider change
 * can't leave one map stranded on a dead endpoint.
 *
 * CARTO's keyless basemaps now stamp "API KEY REQUIRED" over every tile, so we
 * use Stadia Maps' Alidade Smooth Dark (near-identical look). Stadia serves
 * localhost without a key; production domains must be registered in the
 * Stadia dashboard (domain auth - no key ships in the bundle).
 */
export const BASEMAP_URL = 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png';

export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noopener">Stadia Maps</a> ' +
  '&copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
