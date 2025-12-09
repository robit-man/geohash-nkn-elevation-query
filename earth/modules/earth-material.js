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
    roughnessHigh = 0.35,

    // NEW: haze tuning (1 unit = 1 meter)
    atmosphereScale = 1.04,     // must match atmosphereMesh.scale.setScalar(...)
    hazeStrength = 0.85,        // overall haze amount on surface
    hazeFalloff = 900000.0,     // meters: bigger = clearer; smaller = hazier (try 600000..1400000)
    hazeMax = 0.85              // clamp so it never fully washes out
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
    roughnessHigh: { value: roughnessHigh },
    atmosphereScale: { value: atmosphereScale },
    hazeStrength: { value: hazeStrength },
    hazeFalloff: { value: hazeFalloff },
    hazeMax: { value: hazeMax },

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

    // NEW haze uniforms
    uniform float atmosphereScale;
    uniform float hazeStrength;
    uniform float hazeFalloff;
    uniform float hazeMax;

    varying vec2 vUv;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;

    // Entry distance along ray to sphere (center at origin). Returns 0 if camera is inside.
    float raySphereEntryT(vec3 ro, vec3 rd, float r) {
      float b = dot(ro, rd);
      float c = dot(ro, ro) - r * r;
      float h = b * b - c;
      if (h <= 0.0) return 0.0;
      float t = -b - sqrt(h);
      return max(t, 0.0);
    }

    void main() {
      #include <logdepthbuf_fragment>

      vec3 dayColor = texture2D(dayTexture, vUv).rgb;
      vec3 nightColor = texture2D(nightTexture, vUv).rgb;
      vec4 brc = texture2D(bumpRoughnessCloudsTexture, vUv);
      vec3 imageryColor = texture2D(imageryTexture, vUv).rgb;

      float clouds = brc.b;
      float cloudsStrength = smoothstep(0.2, 1.0, clouds);

      vec3 actualDayColor = mix(dayColor, imageryColor, useImagery);
      vec3 baseColor = mix(actualDayColor, vec3(1.0), cloudsStrength * 2.0);

      vec3 N = normalize(vWorldNormal);
      if (!gl_FrontFacing) N *= -1.0;

      vec3 sunDir = normalize(sunDirection);
      float sunOrientation = dot(N, sunDir);

      float dayStrength = smoothstep(-0.25, 0.5, sunOrientation);

      // Twilight→day atmosphere color
      float atmosphereMix = smoothstep(-0.25, 0.75, sunOrientation);
      vec3 atmosphereColor = mix(atmosphereTwilightColor, atmosphereDayColor, atmosphereMix);

      // Base day/night
      vec3 finalColor = mix(nightColor, baseColor, dayStrength);

      // ───────────────────────────────────────────────────────────
      // NEW: Altitude-dependent “aerial perspective” haze on surface
      // We approximate optical depth by: path length of camera→surface ray
      // that lies inside the atmosphere sphere (radius = planetR*atmosphereScale).
      // ───────────────────────────────────────────────────────────
      vec3 C = cameraPosition; // assumes planet centered at origin
      vec3 toP = vWorldPosition - C;
      float tSurface = length(toP);
      vec3 rd = toP / max(tSurface, 1e-6);

      float planetR = length(vWorldPosition);
      float atmR = planetR * atmosphereScale;

      float tEntry = raySphereEntryT(C, rd, atmR);
      float pathLen = max(0.0, tSurface - tEntry);

      // Optical depth → haze amount
      float haze = 1.0 - exp(-pathLen / max(hazeFalloff, 1.0));

      // Reduce haze on deep night side but keep some limb glow
      float sunFactor = 0.25 + 0.75 * smoothstep(-0.15, 0.25, sunOrientation);
      haze *= sunFactor;

      haze = clamp(haze * hazeStrength, 0.0, hazeMax);

      // Apply haze as a tint toward atmosphere color
      finalColor = mix(finalColor, atmosphereColor, haze);

      // Optional: a tiny extra brightening for “milky” look near horizon
      vec3 viewDir = normalize(C - vWorldPosition);
      float mu = clamp(dot(N, viewDir), 0.0, 1.0);        // 1 = straight down, 0 = horizon
      float horizon = pow(1.0 - mu, 2.0);
      finalColor += atmosphereColor * (0.08 * horizon * haze);

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
    atmosphereTwilightColor: { value: new THREE.Vector3(twilightColor.r, twilightColor.g, twilightColor.b) },

    // NEW halo tuning (match your mesh scale)
    atmosphereScale: { value: 1.04 },
    haloStrength: { value: 1.35 },     // bigger = denser/stronger halo
    haloPower: { value: 2.2 },         // smaller = thicker halo; larger = thinner ring
    heightFade: { value: 1400000.0 }   // meters: larger keeps halo visible higher up
  };


  const vertexShader = `
    #include <common>
    #include <logdepthbuf_pars_vertex>

    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;

    void main() {
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPosition = wp.xyz;

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

    uniform float atmosphereScale;
    uniform float haloStrength;
    uniform float haloPower;
    uniform float heightFade;

    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;

    void main() {
      #include <logdepthbuf_fragment>

      vec3 N = normalize(vWorldNormal);
      if (!gl_FrontFacing) N *= -1.0;

      vec3 C = cameraPosition; // assumes planet centered at origin
      vec3 viewDir = normalize(C - vWorldPosition);

      vec3 sunDir = normalize(sunDirection);
      float sunOrientation = dot(N, sunDir);

      float atmosphereMix = smoothstep(-0.25, 0.75, sunOrientation);
      vec3 atmosphereColor = mix(atmosphereTwilightColor, atmosphereDayColor, atmosphereMix);

      // Fresnel ring
      float fresnel = 1.0 - abs(dot(viewDir, N));
      float ring = pow(clamp(fresnel, 0.0, 1.0), haloPower);

      // Fade with altitude (stronger when you're lower in the atmosphere)
      float topR = length(vWorldPosition);
      float planetR = topR / max(atmosphereScale, 1e-6);
      float height = max(0.0, length(C) - planetR);
      float altFactor = exp(-height / max(heightFade, 1.0)); // 1 near ground → small in space

      // Keep some halo visible from space, but boost near-surface density
      float density = mix(0.18, 1.0, clamp(altFactor, 0.0, 1.0));

      // A touch of forward scattering toward the sun (nice “hot spot”)
      float sunSpot = pow(max(dot(-viewDir, sunDir), 0.0), 10.0);

      float alpha = haloStrength * density * ring;
      alpha += 0.35 * sunSpot * ring;

      // Never fully disappear on the night side; just reduce
      alpha *= (0.25 + 0.75 * smoothstep(-0.2, 0.25, sunOrientation));

      alpha = clamp(alpha, 0.0, 1.0);
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

  // NEW haze controls
  if (updates.atmosphereScale !== undefined) {
    uniforms.atmosphereScale.value = updates.atmosphereScale;
  }
  if (updates.hazeStrength !== undefined) {
    uniforms.hazeStrength.value = updates.hazeStrength;
  }
  if (updates.hazeFalloff !== undefined) {
    uniforms.hazeFalloff.value = updates.hazeFalloff;
  }
  if (updates.hazeMax !== undefined) {
    uniforms.hazeMax.value = updates.hazeMax;
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
