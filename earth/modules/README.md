# Earth Globe Modules

This directory contains modular ES6 components for the Earth globe visualization system with real-time astronomical lighting.

## Module Overview

### 🌞 sun-calculator.js
**Astronomical sun position calculator**

Calculates accurate sun position based on date, time, and Earth's 23.44° axial tilt using NOAA Solar Calculator formulas.

**Key Exports:**
- `calculateSunPosition(date, lat, lng)` - Full astronomical calculation
- `getSunDirectionVector(date, lat, lng)` - Returns THREE.Vector3 for lighting
- `getSimplifiedSunDirection(date)` - Faster time-of-day-only calculation
- `getDayOfYear(date)` - Day number (1-365/366)
- `getSolarNoon(date, lng)` - Calculate solar noon time

**Usage:**
```javascript
import { getSunDirectionVector } from './modules/sun-calculator.js';

const sunDirection = getSunDirectionVector(new Date(), 40.7128, -74.0060); // NYC
light.position.copy(sunDirection).multiplyScalar(1000);
```

---

### 💡 lighting-system.js
**Dynamic lighting controller**

Manages sun directional light with time progression and real-time updates.

**Key Exports:**
- `LightingSystem` class

**Methods:**
- `updateSunPosition(date)` - Update sun position
- `setTimeOfDay(hours, minutes)` - Set specific time
- `setTimeSpeed(speed)` - Time progression multiplier (0=paused, 60=1min/sec)
- `update(deltaTime)` - Call in animation loop
- `setLocation(lat, lng)` - Enable geographic calculations
- `setSimplifiedMode(enabled)` - Toggle calculation mode

**Usage:**
```javascript
import { LightingSystem } from './modules/lighting-system.js';

const lightingSystem = new LightingSystem(scene, PLANET_RADIUS);
lightingSystem.setTimeSpeed(60); // 60× speed
lightingSystem.updateSunPosition(new Date());

// In animation loop:
function animate() {
  lightingSystem.update(deltaTime);
  renderer.render(scene, camera);
}
```

---

### 🎨 earth-material.js
**TSL-based Earth and atmosphere materials**

Creates advanced shader materials using Three.js Shading Language (TSL) for realistic Earth rendering.

**Key Exports:**
- `createEarthMaterial(textures, sunLight, options)` - Earth surface material
- `createAtmosphereMaterial(colors, sunLight)` - Atmosphere shell material
- `updateEarthMaterialUniforms(material, updates)` - Runtime parameter updates
- `createFallbackMaterial()` - Simple fallback if TSL unavailable

**Features:**
1. **Day/Night Blending** - Smooth transition based on sun angle
2. **Fresnel Atmosphere** - Edge glow effect
3. **Bump Mapping** - Terrain elevation from texture
4. **Cloud Rendering** - Extracted from texture channel
5. **Dynamic Roughness** - Water smooth, land rough

**Usage:**
```javascript
import { createEarthMaterial, createAtmosphereMaterial } from './modules/earth-material.js';

// After loading textures:
const earthMaterial = createEarthMaterial(textures, lightingSystem.sun, {
  atmosphereDayColor: '#4db2ff',
  atmosphereTwilightColor: '#bc490b',
  roughnessLow: 0.25,
  roughnessHigh: 0.35
});

const atmosphereMaterial = createAtmosphereMaterial(
  { day: '#4db2ff', twilight: '#bc490b' },
  lightingSystem.sun
);
```

**Texture Requirements:**
```javascript
{
  day: THREE.Texture,                  // RGB - Earth surface
  night: THREE.Texture,                // RGB - City lights
  bumpRoughnessClouds: THREE.Texture  // R=bump, G=roughness, B=clouds
}
```

---

### 🖼️ texture-loader.js
**Texture loading and management**

Centralized texture loading with automatic fallback to procedural textures if files are missing.

**Key Exports:**
- `loadEarthTextures(basePath, resolution)` - Load all textures
- `loadEarthTexturesWithFallback(basePath, resolution)` - Auto-fallback version
- `createFallbackTextures()` - Generate simple colored textures
- `getRecommendedResolution(renderer)` - Device-appropriate resolution

**Usage:**
```javascript
import { loadEarthTexturesWithFallback } from './modules/texture-loader.js';

const textures = await loadEarthTexturesWithFallback('./textures/', '4096');

if (textures.usingFallback) {
  console.warn('Using fallback textures - download real textures for better quality');
}

// Use textures.day, textures.night, textures.bumpRoughnessClouds
```

**Supported Resolutions:**
- `'2k'` - 2048×1024 (mobile)
- `'4096'` - 4096×2048 (desktop)
- `'8k'` - 8192×4096 (high-end)

---

## Module Dependencies

```
geo.html
  │
  ├─► lighting-system.js
  │     └─► sun-calculator.js
  │           └─► three (WebGPU)
  │
  ├─► earth-material.js
  │     └─► three/tsl
  │
  └─► texture-loader.js
        └─► three
```

---

## Integration Example

Complete integration in main application:

```javascript
import * as THREE from 'three/webgpu';
import { LightingSystem } from './modules/lighting-system.js';
import { createEarthMaterial, createAtmosphereMaterial } from './modules/earth-material.js';
import { loadEarthTexturesWithFallback } from './modules/texture-loader.js';

// Setup scene
const scene = new THREE.Scene();
const renderer = new THREE.WebGPURenderer({ antialias: true });

// Initialize lighting
const lightingSystem = new LightingSystem(scene, PLANET_RADIUS);
lightingSystem.updateSunPosition(new Date());
lightingSystem.setTimeSpeed(0); // Paused

// Load textures and create materials
(async function initEarth() {
  const textures = await loadEarthTexturesWithFallback('./textures/', '4096');

  const earthMaterial = createEarthMaterial(textures, lightingSystem.sun);
  const atmosphereMaterial = createAtmosphereMaterial(
    { day: '#4db2ff', twilight: '#bc490b' },
    lightingSystem.sun
  );

  // Create globe
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS, 64, 64),
    earthMaterial
  );
  scene.add(globe);

  // Create atmosphere
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS, 64, 64),
    atmosphereMaterial
  );
  atmosphere.scale.setScalar(1.04);
  scene.add(atmosphere);
})();

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  lightingSystem.update(deltaTime);
  renderer.render(scene, camera);
}
```

---

## TSL Shader Details

### Earth Material Nodes

The earth material uses the following TSL node graph:

```
Input Textures → Extract Channels → Calculate View/Sun Data → Compose Colors → Output
     ↓                ↓                        ↓                    ↓           ↓
  day.rgb      clouds (blue ch)          fresnel              mix colors    final RGB
  night.rgb    rough (green ch)      sun orientation      day/night blend   normals
  combined     bump (red ch)         atmosphere color     atmosphere mix    roughness
```

### Atmosphere Material Nodes

```
View Direction → Fresnel → Color Gradient → Alpha Falloff → Output
      ↓             ↓             ↓               ↓            ↓
  normalize     edge glow   twilight→day    day-side only   RGBA + alpha
                           based on sun
```

---

## Performance Characteristics

| Module | CPU Load | GPU Load | Network | Notes |
|--------|----------|----------|---------|-------|
| sun-calculator.js | Low | None | None | Pure math, < 1ms per call |
| lighting-system.js | Very Low | None | None | Calls sun-calculator once per update |
| earth-material.js | None | Medium-High | None | TSL shaders run on GPU |
| texture-loader.js | Low | None | 5-15 MB | One-time download, cached |

**Optimization Tips:**
- Use `setSimplifiedMode(true)` for faster sun calculations
- Reduce texture resolution on mobile devices
- Disable atmosphere for low-end GPUs
- Pause time progression when not needed (`setTimeSpeed(0)`)

---

## Testing

### Unit Tests (Conceptual)

```javascript
// sun-calculator.js
test('Sun at solar noon points upward in tropics', () => {
  const direction = getSunDirectionVector(new Date('2024-06-21T12:00:00Z'), 0, 0);
  expect(direction.y).toBeGreaterThan(0.9); // Nearly vertical
});

// lighting-system.js
test('Time progression advances date', () => {
  const system = new LightingSystem(scene, 1000);
  const startTime = system.currentDate.getTime();
  system.setTimeSpeed(60);
  system.update(1); // 1 second → 60 seconds simulated
  expect(system.currentDate.getTime()).toBeGreaterThan(startTime + 59000);
});

// texture-loader.js
test('Fallback textures created when files missing', async () => {
  const textures = await loadEarthTexturesWithFallback('./nonexistent/', '4096');
  expect(textures.usingFallback).toBe(true);
  expect(textures.day).toBeInstanceOf(THREE.Texture);
});
```

---

## Troubleshooting

### Module Not Found Error
**Symptom:** `Failed to resolve module specifier`
**Fix:** Ensure paths are relative (`./modules/`) and files exist

### TSL Shader Compilation Error
**Symptom:** Black globe, console errors about nodes
**Fix:** Verify using WebGPU renderer, not WebGL

### Sun Position Incorrect
**Symptom:** Sun on wrong side of Earth
**Fix:** Check date/time is UTC, not local time

### Textures Not Loading
**Symptom:** Console shows 404 errors
**Fix:** Download textures to `earth/textures/` directory

### Performance Issues
**Symptom:** Low FPS with atmosphere enabled
**Fix:** Reduce texture resolution, disable atmosphere, or use simplified sun mode

---

## Future Enhancements

Potential additions to this module system:

1. **Stars Module** - Procedural star field based on date/location
2. **Moon Module** - Lunar phases and orbital mechanics
3. **Clouds Module** - Animated cloud layer separate from texture
4. **Weather Module** - Real-time weather data overlay
5. **Seasons Module** - Animate Earth's axial tilt through the year

---

## Contributing

When adding new modules:

1. Use ES6 module syntax (`import`/`export`)
2. Document all public functions with JSDoc
3. Include usage examples in module header
4. Keep dependencies minimal
5. Export only necessary functions/classes
6. Use TypeScript-style type hints in comments

---

## License

These modules are part of the NKN Tritree Globe project. Ensure compliance with:
- Three.js (MIT License)
- Texture sources (check individual licenses)
- NOAA algorithms (public domain)

---

**Last Updated:** 2025-12-08
**Three.js Version:** r170
**Author:** Earth Globe Lighting Upgrade Project
