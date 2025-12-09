/**
 * Earth Material Factory
 *
 * Custom shader-based materials for Earth globe with day/night/atmosphere shaders.
 * Compatible with WebGLRenderer using GLSL shaders.
 *
 * References:
 * - https://threejs.org/examples/webgpu_tsl_earth.html
 * - Three.js Journey: https://threejs-journey.com/lessons/earth-shaders
 */

import * as THREE from 'three';

/**
 * Create Earth globe material with custom shaders
 *
 * Features:
 * - Day/night texture blending based on sun position
 * - Atmosphere color mixing with fresnel effect
 * - Bump mapping from terrain elevation
 * - Cloud rendering from texture channel
 * - Dynamic roughness based on water/land
 *
 * @param {Object} textures - { day, night, bumpRoughnessClouds }
 * @param {THREE.DirectionalLight} sunLight - Sun directional light
 * @param {Object} options - Material configuration options
 * @returns {THREE.ShaderMaterial}
 */
export function createEarthMaterial(textures, sunLight, options = {}) {
  const {
    atmosphereDayColor = new THREE.Color('#4db2ff'),
    atmosphereTwilightColor = new THREE.Color('#bc490b'),
    roughnessLow = 0.25,
    roughnessHigh = 0.35
  } = options;

  // Ensure colors are THREE.Color objects
  const dayColor = atmosphereDayColor instanceof THREE.Color
    ? atmosphereDayColor
    : new THREE.Color(atmosphereDayColor);
  const twilightColor = atmosphereTwilightColor instanceof THREE.Color
    ? atmosphereTwilightColor
    : new THREE.Color(atmosphereTwilightColor);

  const uniforms = {
    dayTexture: { value: textures.day },
    nightTexture: { value: textures.night },
    bumpRoughnessCloudsTexture: { value: textures.bumpRoughnessClouds },
    imageryTexture: { value: null }, // Optional ESRI imagery texture
    useImagery: { value: 0.0 }, // 0 = use day texture, 1 = use imagery
    sunDirection: { value: new THREE.Vector3() },
    atmosphereDayColor: { value: new THREE.Vector3(dayColor.r, dayColor.g, dayColor.b) },
    atmosphereTwilightColor: { value: new THREE.Vector3(twilightColor.r, twilightColor.g, twilightColor.b) },
    roughnessLow: { value: roughnessLow },
    roughnessHigh: { value: roughnessHigh }
  };

const vertexShader = `
  #include <common>
  #include <logdepthbuf_pars_vertex>

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;

    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;

    // World-space normal (ok for uniform scale; if you ever non-uniform scale, use inverse-transpose)
    vWorldNormal = normalize(mat3(modelMatrix) * normal);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const fragmentShader = `
  #include <common>
  #include <logdepthbuf_pars_fragment>

  uniform sampler2D dayTexture;
  uniform sampler2D nightTexture;
  uniform sampler2D bumpRoughnessCloudsTexture;
  uniform sampler2D imageryTexture;
  uniform float useImagery;
  uniform vec3 sunDirection;
  uniform vec3 atmosphereDayColor;
  uniform vec3 atmosphereTwilightColor;
  uniform float roughnessLow;
  uniform float roughnessHigh;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    #include <logdepthbuf_fragment>

    vec3 dayColor = texture2D(dayTexture, vUv).rgb;
    vec3 nightColor = texture2D(nightTexture, vUv).rgb;
    vec4 bumpRoughnessClouds = texture2D(bumpRoughnessCloudsTexture, vUv);
    vec3 imageryColor = texture2D(imageryTexture, vUv).rgb;

    float clouds = bumpRoughnessClouds.b;
    float cloudsStrength = smoothstep(0.2, 1.0, clouds);

    vec3 actualDayColor = mix(dayColor, imageryColor, useImagery);
    vec3 baseColor = mix(actualDayColor, vec3(1.0), cloudsStrength * 2.0);

    vec3 normalizedSunDir = normalize(sunDirection);

    // If you keep DoubleSide, flip normals for backfaces:
    vec3 N = normalize(vWorldNormal);
    if (!gl_FrontFacing) N *= -1.0;

    float sunOrientation = dot(N, normalizedSunDir);
    float dayStrength = smoothstep(-0.25, 0.5, sunOrientation);

    vec3 finalColor = mix(nightColor, baseColor, dayStrength);
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;


  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide
  });

  // Update sun direction uniform
  material.onBeforeRender = function() {
    uniforms.sunDirection.value.copy(sunLight.position).normalize();
  };

  // Intercept .map setter to handle imagery textures
  Object.defineProperty(material, 'map', {
    get: function() {
      return uniforms.imageryTexture.value;
    },
    set: function(texture) {
      uniforms.imageryTexture.value = texture;
      uniforms.useImagery.value = texture ? 1.0 : 0.0;
    }
  });

  material.userData.uniforms = uniforms;

  // Custom clone method that deep-copies uniforms for per-tile imagery
  material.clone = function() {
    const clonedUniforms = {
      dayTexture: { value: uniforms.dayTexture.value },
      nightTexture: { value: uniforms.nightTexture.value },
      bumpRoughnessCloudsTexture: { value: uniforms.bumpRoughnessCloudsTexture.value },
      imageryTexture: { value: null }, // Each tile gets independent imagery
      useImagery: { value: 0.0 },
      sunDirection: uniforms.sunDirection, // Share reference for synchronized updates
      atmosphereDayColor: uniforms.atmosphereDayColor, // Share reference
      atmosphereTwilightColor: uniforms.atmosphereTwilightColor, // Share reference
      roughnessLow: { value: uniforms.roughnessLow.value },
      roughnessHigh: { value: uniforms.roughnessHigh.value }
    };

    const clonedMaterial = new THREE.ShaderMaterial({
      uniforms: clonedUniforms,
      vertexShader: this.vertexShader,
      fragmentShader: this.fragmentShader,
      side: this.side
    });

    // Redefine map property for cloned material
    Object.defineProperty(clonedMaterial, 'map', {
      get: function() {
        return clonedUniforms.imageryTexture.value;
      },
      set: function(texture) {
        clonedUniforms.imageryTexture.value = texture;
        clonedUniforms.useImagery.value = texture ? 1.0 : 0.0;
      }
    });

    clonedMaterial.userData.uniforms = clonedUniforms;

    // Preserve the clone method itself
    clonedMaterial.clone = material.clone;

    return clonedMaterial;
  };

  return material;
}

/**
 * Create atmosphere shell material
 *
 * Renders a glowing atmosphere around the Earth using back-face rendering.
 * The glow is stronger at the edges (fresnel) and on the day side.
 *
 * @param {Object} colors - { day, twilight }
 * @param {THREE.DirectionalLight} sunLight - Sun directional light
 * @returns {THREE.ShaderMaterial}
 */
export function createAtmosphereMaterial(colors, sunLight) {
  const {
    day = new THREE.Color('#4db2ff'),
    twilight = new THREE.Color('#bc490b')
  } = colors;

  // Ensure colors are THREE.Color objects and convert to Vector3
  const dayColor = day instanceof THREE.Color ? day : new THREE.Color(day);
  const twilightColor = twilight instanceof THREE.Color ? twilight : new THREE.Color(twilight);

  const uniforms = {
    sunDirection: { value: new THREE.Vector3() },
    atmosphereDayColor: { value: new THREE.Vector3(dayColor.r, dayColor.g, dayColor.b) },
    atmosphereTwilightColor: { value: new THREE.Vector3(twilightColor.r, twilightColor.g, twilightColor.b) }
  };

  const vertexShader = `
    #include <common>
    #include <logdepthbuf_pars_vertex>

    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;

    void main() {
      vWorldNormal = normalize(mat3(modelMatrix) * normal);

      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }
  `;

  const fragmentShader = `
    #include <common>
    #include <logdepthbuf_pars_fragment>

    uniform vec3 sunDirection;
    uniform vec3 atmosphereDayColor;
    uniform vec3 atmosphereTwilightColor;

    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;

    void main() {
      #include <logdepthbuf_fragment>

      vec3 N = normalize(vWorldNormal);
      if (!gl_FrontFacing) N *= -1.0;

      // Sun orientation
      vec3 normalizedSunDir = normalize(sunDirection);
      float sunOrientation = dot(N, normalizedSunDir);

      // Atmosphere color (twilight to day)
      float atmosphereMix = smoothstep(-0.25, 0.75, sunOrientation);
      vec3 atmosphereColor = mix(atmosphereTwilightColor, atmosphereDayColor, atmosphereMix);

      // Fresnel effect
      vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
      float fresnel = 1.0 - abs(dot(viewDirection, N));

      // Alpha calculation matching TSL example
      float fresnelRemapped = 1.0 - ((fresnel - 0.73) / (1.0 - 0.73));
      fresnelRemapped = clamp(fresnelRemapped, 0.0, 1.0);
      float alpha = pow(fresnelRemapped, 3.0);
      alpha = alpha * smoothstep(-0.5, 1.0, sunOrientation);

      gl_FragColor = vec4(atmosphereColor, alpha);
    }
  `;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: false
  });

  // Update sun direction uniform
  material.onBeforeRender = function() {
    uniforms.sunDirection.value.copy(sunLight.position).normalize();
  };

  material.userData.uniforms = uniforms;

  return material;
}

/**
 * Update material uniforms (for GUI/runtime tweaking)
 *
 * @param {THREE.ShaderMaterial} material - Earth material
 * @param {Object} updates - { atmosphereDayColor?, atmosphereTwilightColor?, roughnessLow?, roughnessHigh? }
 */
export function updateEarthMaterialUniforms(material, updates) {
  const uniforms = material.userData.uniforms;

  if (!uniforms) {
    console.warn('Material does not have exposed uniforms');
    return;
  }

  if (updates.atmosphereDayColor !== undefined) {
    uniforms.atmosphereDayColor.value.set(updates.atmosphereDayColor);
  }

  if (updates.atmosphereTwilightColor !== undefined) {
    uniforms.atmosphereTwilightColor.value.set(updates.atmosphereTwilightColor);
  }

  if (updates.roughnessLow !== undefined) {
    uniforms.roughnessLow.value = updates.roughnessLow;
  }

  if (updates.roughnessHigh !== undefined) {
    uniforms.roughnessHigh.value = updates.roughnessHigh;
  }
}

/**
 * Create simple fallback material (if textures fail to load)
 *
 * @returns {THREE.MeshStandardMaterial}
 */
export function createFallbackMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x4b5563,
    metalness: 0.0,
    roughness: 0.95,
    flatShading: false,
    side: THREE.DoubleSide
  });
}
