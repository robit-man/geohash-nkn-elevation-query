/**
 * Texture Loader
 *
 * Centralized texture management for Earth visualization.
 * Handles loading and configuration of day, night, and bump/roughness/clouds textures.
 */

import * as THREE from 'three';

/**
 * Load a single texture with configuration
 *
 * @param {string} url - Texture URL
 * @param {Object} options - Texture configuration
 * @returns {Promise<THREE.Texture>}
 */
function loadTexture(url, options = {}) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();

    loader.load(
      url,
      (texture) => {
        // Apply configuration
        if (options.colorSpace) {
          texture.colorSpace = options.colorSpace === 'srgb'
            ? THREE.SRGBColorSpace
            : THREE.LinearSRGBColorSpace;
        }

        if (options.anisotropy) {
          texture.anisotropy = options.anisotropy;
        }

        if (options.wrapS) {
          texture.wrapS = options.wrapS;
        }

        if (options.wrapT) {
          texture.wrapT = options.wrapT;
        }

        if (options.minFilter) {
          texture.minFilter = options.minFilter;
        }

        if (options.magFilter) {
          texture.magFilter = options.magFilter;
        }

        resolve(texture);
      },
      undefined,
      (error) => {
        console.error(`Failed to load texture: ${url}`, error);
        reject(error);
      }
    );
  });
}

/**
 * Load all Earth textures
 *
 * Textures should be downloaded from:
 * https://www.solarsystemscope.com/textures/
 *
 * Required files:
 * - earth_day_4096.jpg (or 2k/8k variants)
 * - earth_night_4096.jpg
 * - earth_bump_roughness_clouds_4096.jpg (combined texture with R=bump, G=roughness, B=clouds)
 *
 * @param {string} basePath - Base path to textures directory
 * @param {string} resolution - Resolution suffix (e.g., '4096', '2k', '8k')
 * @returns {Promise<Object>} { day, night, bumpRoughnessClouds }
 */
export async function loadEarthTextures(basePath = './textures/', resolution = '4096') {
  console.log(`Loading Earth textures from ${basePath}...`);

  try {
    const [day, night, bumpRoughnessClouds] = await Promise.all([
      loadTexture(`${basePath}earth_day_${resolution}.jpg`, {
        colorSpace: 'srgb',
        anisotropy: 8
      }),
      loadTexture(`${basePath}earth_night_${resolution}.jpg`, {
        colorSpace: 'srgb',
        anisotropy: 8
      }),
      loadTexture(`${basePath}earth_bump_roughness_clouds_${resolution}.jpg`, {
        colorSpace: 'linear',
        anisotropy: 8
      })
    ]);

    console.log('Earth textures loaded successfully');

    return {
      day,
      night,
      bumpRoughnessClouds
    };
  } catch (error) {
    console.error('Failed to load Earth textures:', error);
    throw error;
  }
}

/**
 * Create placeholder/fallback textures if actual textures fail to load
 *
 * @returns {Object} { day, night, bumpRoughnessClouds }
 */
export function createFallbackTextures() {
  console.warn('Using fallback textures - download real textures from https://www.solarsystemscope.com/textures/');

  // Create simple colored textures as fallbacks
  const createColorTexture = (color) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 512);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };

  const createDataTexture = (r, g, b) => {
    const size = 512;
    const data = new Uint8Array(size * size * 3);

    for (let i = 0; i < data.length; i += 3) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBFormat);
    texture.needsUpdate = true;
    return texture;
  };

  return {
    day: createColorTexture('#4488aa'),
    night: createColorTexture('#0a0a0a'),
    bumpRoughnessClouds: createDataTexture(128, 180, 0) // R=bump, G=roughness, B=clouds
  };
}

/**
 * Load Earth textures with automatic fallback
 *
 * @param {string} basePath - Base path to textures directory
 * @param {string} resolution - Resolution suffix
 * @returns {Promise<Object>} { day, night, bumpRoughnessClouds, usingFallback }
 */
export async function loadEarthTexturesWithFallback(basePath = './textures/', resolution = '4096') {
  try {
    const textures = await loadEarthTextures(basePath, resolution);
    return { ...textures, usingFallback: false };
  } catch (error) {
    console.warn('Failed to load textures, using fallback');
    const textures = createFallbackTextures();
    return { ...textures, usingFallback: true };
  }
}

/**
 * Preload and cache textures
 *
 * @param {Array<string>} urls - Array of texture URLs
 * @returns {Promise<Array<THREE.Texture>>}
 */
export async function preloadTextures(urls) {
  const promises = urls.map(url => loadTexture(url));
  return Promise.all(promises);
}

/**
 * Get recommended resolution based on device capabilities
 *
 * @param {THREE.WebGLRenderer|THREE.WebGPURenderer} renderer - Three.js renderer
 * @returns {string} Resolution suffix ('2k', '4096', '8k')
 */
export function getRecommendedResolution(renderer) {
  const maxTextureSize = renderer.capabilities?.maxTextureSize || 4096;
  const pixelRatio = window.devicePixelRatio || 1;

  if (maxTextureSize >= 8192 && pixelRatio >= 2) {
    return '8k';
  } else if (maxTextureSize >= 4096) {
    return '4096';
  } else {
    return '2k';
  }
}
