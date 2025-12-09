/**
 * Sun Position Calculator
 *
 * Calculates astronomical sun position based on date, time, and Earth's axial tilt.
 * Formulas based on NOAA Solar Calculator and suncalc library.
 *
 * References:
 * - https://github.com/mourner/suncalc
 * - https://gml.noaa.gov/grad/solcalc/
 */

import * as THREE from 'three';

// Constants
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const EARTH_OBLIQUITY = 23.4397 * RAD; // Earth's axial tilt in radians
const J1970 = 2440588;
const J2000 = 2451545;

/**
 * Convert date to Julian day number
 */
function toJulian(date) {
  return date.valueOf() / 86400000 - 0.5 + J1970;
}

/**
 * Convert Julian day to number of days since J2000
 */
function toDays(date) {
  return toJulian(date) - J2000;
}

/**
 * Calculate solar mean anomaly
 */
function solarMeanAnomaly(days) {
  return (357.5291 + 0.98560028 * days) * RAD;
}

/**
 * Calculate equation of center
 */
function equationOfCenter(M) {
  return (1.9148 * Math.sin(M) +
          0.0200 * Math.sin(2 * M) +
          0.0003 * Math.sin(3 * M)) * RAD;
}

/**
 * Calculate ecliptic longitude
 */
function eclipticLongitude(M) {
  const C = equationOfCenter(M);
  const P = (102.9372) * RAD; // perihelion
  return M + C + P + Math.PI;
}

/**
 * Calculate solar declination (sun's angle relative to Earth's equator)
 * This accounts for Earth's 23.44° axial tilt
 */
function solarDeclination(days) {
  const L = eclipticLongitude(solarMeanAnomaly(days));
  return Math.asin(Math.sin(L) * Math.sin(EARTH_OBLIQUITY));
}

/**
 * Calculate right ascension
 */
function rightAscension(days) {
  const L = eclipticLongitude(solarMeanAnomaly(days));
  return Math.atan2(
    Math.sin(L) * Math.cos(EARTH_OBLIQUITY),
    Math.cos(L)
  );
}

/**
 * Calculate sidereal time (rotation of Earth)
 */
function siderealTime(days, lng) {
  return (280.16 + 360.9856235 * days) * RAD - lng;
}

/**
 * Calculate sun position (altitude and azimuth)
 *
 * @param {Date} date - The date/time for calculation
 * @param {number} lat - Latitude in degrees (-90 to 90)
 * @param {number} lng - Longitude in degrees (-180 to 180)
 * @returns {Object} { altitude, azimuth, declination } in radians
 */
export function calculateSunPosition(date, lat = 0, lng = 0) {
  const lngRad = -lng * RAD;
  const phi = lat * RAD;
  const days = toDays(date);

  const dec = solarDeclination(days);
  const ra = rightAscension(days);
  const lmst = siderealTime(days, lngRad);
  const H = lmst - ra;

  // Calculate altitude (elevation angle above horizon)
  const altitude = Math.asin(
    Math.sin(phi) * Math.sin(dec) +
    Math.cos(phi) * Math.cos(dec) * Math.cos(H)
  );

  // Calculate azimuth (compass direction)
  const azimuth = Math.atan2(
    Math.sin(H),
    Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)
  );

  return {
    altitude,
    azimuth,
    declination: dec
  };
}

/**
 * Get sun direction as a THREE.Vector3
 * This returns a normalized direction vector pointing FROM the sun TO the Earth
 *
 * @param {Date} date - The date/time for calculation
 * @param {number} lat - Latitude in degrees (default 0 = equator)
 * @param {number} lng - Longitude in degrees (default 0 = prime meridian)
 * @returns {THREE.Vector3} Normalized direction vector
 */
export function getSunDirectionVector(date, lat = 0, lng = 0) {
  const pos = calculateSunPosition(date, lat, lng);

  // Convert spherical coordinates (altitude, azimuth) to Cartesian
  // Azimuth: 0 = North, π/2 = East, π = South, -π/2 = West
  // Altitude: 0 = horizon, π/2 = zenith, -π/2 = nadir

  const x = Math.cos(pos.altitude) * Math.sin(pos.azimuth);
  const y = Math.sin(pos.altitude);
  const z = Math.cos(pos.altitude) * Math.cos(pos.azimuth);

  // Return inverted direction (sun TO earth becomes earth TO sun for lighting)
  return new THREE.Vector3(-x, y, -z).normalize();
}

/**
 * Get simplified sun direction based on time of day only (no geo coordinates)
 * Useful for visualization and simplified day/night cycles
 *
 * @param {Date} date - The date/time
 * @returns {THREE.Vector3} Normalized direction vector
 */
export function getSimplifiedSunDirection(date) {
  const days = toDays(date);
  const dec = solarDeclination(days);

  // Simple rotation based on time of day
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
  const hourAngle = (hours / 24) * Math.PI * 2 - Math.PI; // -π to π

  // Create direction with declination (seasonal tilt)
  const x = Math.cos(dec) * Math.sin(hourAngle);
  const y = Math.sin(dec);
  const z = Math.cos(dec) * Math.cos(hourAngle);

  return new THREE.Vector3(x, y, z).normalize();
}

/**
 * Get day of year (1-365/366)
 */
export function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

/**
 * Calculate solar noon (when sun is highest in sky) for a location
 */
export function getSolarNoon(date, lng = 0) {
  const days = toDays(date);
  const lngRad = -lng * RAD;
  const ra = rightAscension(days);
  const lmst = siderealTime(days, lngRad);

  // When hour angle H = 0, sun is at solar noon
  const noonOffset = (ra - lmst) / (2 * Math.PI);

  const noon = new Date(date);
  noon.setUTCHours(12, 0, 0, 0);
  noon.setTime(noon.getTime() + noonOffset * 24 * 60 * 60 * 1000);

  return noon;
}
