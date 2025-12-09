/**
 * Lighting System
 *
 * Dynamic lighting controller with real-time sun updates.
 * Replaces static multi-light rig with dynamic single-sun system.
 */

import * as THREE from 'three';
import { getSunDirectionVector, getSimplifiedSunDirection } from './sun-calculator.js';

export class LightingSystem {
  /**
   * @param {THREE.Scene} scene - Three.js scene
   * @param {number} planetRadius - Radius of the planet in meters
   * @param {number} sunDistance - Distance from Earth to Sun in meters (default: 1 AU)
   */
  constructor(scene, planetRadius = 6_371_000, sunDistance = 149_597_870_700) {
    this.scene = scene;
    this.planetRadius = planetRadius;
    this.sunDistance = sunDistance;

    // Main directional light representing the sun at real astronomical distance
    this.sun = new THREE.DirectionalLight('#ffffff', 4);
    this.sun.position.set(0, 0, sunDistance); // Real Earth-Sun distance
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = false;
    this.sun.name = 'Sun';

    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Time control
    this.currentDate = new Date();
    this.useSimplified = true; // Use simplified calculation by default
    this.latitude = 0;
    this.longitude = 0;
    this.timeSpeed = 0; // Multiplier for time progression (0 = paused)
    this.lastUpdateTime = performance.now();

    // Optional: Add subtle ambient light to prevent completely black shadows
    this.ambient = new THREE.AmbientLight(0x404040, 0.15);
    this.ambient.name = 'AmbientFill';
    this.scene.add(this.ambient);
  }

  /**
   * Update sun position based on current date/time
   *
   * @param {Date} date - Optional date to use (if not provided, uses internal currentDate)
   */
  updateSunPosition(date = null) {
    if (date) {
      this.currentDate = date;
    }

    let direction;

    if (this.useSimplified) {
      // Simplified calculation (faster, good for visualization)
      direction = getSimplifiedSunDirection(this.currentDate);
    } else {
      // Full astronomical calculation with lat/lng
      direction = getSunDirectionVector(this.currentDate, this.latitude, this.longitude);
    }

    // Position sun light at real astronomical distance from Earth
    this.sun.position.copy(direction).multiplyScalar(this.sunDistance);
  }

  /**
   * Set time of day manually (uses current date)
   *
   * @param {number} hours - Hours (0-23)
   * @param {number} minutes - Minutes (0-59)
   */
  setTimeOfDay(hours, minutes = 0) {
    this.currentDate.setUTCHours(hours, minutes, 0, 0);
    this.updateSunPosition();
  }

  /**
   * Set specific date
   *
   * @param {Date} date - Date to set
   */
  setDate(date) {
    this.currentDate = new Date(date);
    this.updateSunPosition();
  }

  /**
   * Set location for astronomical calculations
   *
   * @param {number} lat - Latitude in degrees
   * @param {number} lng - Longitude in degrees
   */
  setLocation(lat, lng) {
    this.latitude = lat;
    this.longitude = lng;
    this.useSimplified = false; // Switch to full calculation
    this.updateSunPosition();
  }

  /**
   * Enable/disable simplified sun calculation
   *
   * @param {boolean} enabled - Whether to use simplified calculation
   */
  setSimplifiedMode(enabled) {
    this.useSimplified = enabled;
    this.updateSunPosition();
  }

  /**
   * Set time progression speed
   *
   * @param {number} speed - Time multiplier (1 = real-time, 60 = 1 minute per second, 0 = paused)
   */
  setTimeSpeed(speed) {
    this.timeSpeed = speed;
  }

  /**
   * Update time progression (call in animation loop)
   *
   * @param {number} deltaTime - Time elapsed in seconds
   */
  update(deltaTime) {
    if (this.timeSpeed !== 0) {
      // Progress simulated time
      const millisecondsElapsed = deltaTime * 1000 * this.timeSpeed;
      this.currentDate = new Date(this.currentDate.getTime() + millisecondsElapsed);
      this.updateSunPosition();
    }
  }

  /**
   * Set sun intensity
   *
   * @param {number} intensity - Light intensity
   */
  setIntensity(intensity) {
    this.sun.intensity = intensity;
  }

  /**
   * Set ambient light intensity
   *
   * @param {number} intensity - Ambient intensity
   */
  setAmbientIntensity(intensity) {
    this.ambient.intensity = intensity;
  }

  /**
   * Get current sun direction as normalized vector
   *
   * @returns {THREE.Vector3}
   */
  getSunDirection() {
    return this.sun.position.clone().normalize();
  }

  /**
   * Get current time info
   *
   * @returns {Object} { date, hours, minutes, timeOfDay }
   */
  getTimeInfo() {
    return {
      date: this.currentDate,
      hours: this.currentDate.getUTCHours(),
      minutes: this.currentDate.getUTCMinutes(),
      timeOfDay: this.currentDate.getUTCHours() + this.currentDate.getUTCMinutes() / 60
    };
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.scene.remove(this.sun);
    this.scene.remove(this.sun.target);
    this.scene.remove(this.ambient);
  }
}
