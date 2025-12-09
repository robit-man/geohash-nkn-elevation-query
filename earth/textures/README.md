# Earth Textures

This directory should contain high-resolution Earth texture maps for the globe visualization.

## Required Textures

Download the following textures from **Solar System Scope**:
[https://www.solarsystemscope.com/textures/](https://www.solarsystemscope.com/textures/)

### 1. Day Texture
**Filename:** `earth_day_4096.jpg` (or 2k/8k variant)
- Earth's surface in daylight
- Should include continents, oceans, clouds
- Recommended resolution: 4096x2048 or higher
- Color space: sRGB

### 2. Night Texture
**Filename:** `earth_night_4096.jpg` (or 2k/8k variant)
- Earth's city lights at night
- Black oceans with illuminated cities
- Recommended resolution: 4096x2048 or higher
- Color space: sRGB

### 3. Combined Bump/Roughness/Clouds Texture
**Filename:** `earth_bump_roughness_clouds_4096.jpg` (or 2k/8k variant)
- **Red Channel:** Terrain elevation/bump map
- **Green Channel:** Surface roughness (water = smooth, land = rough)
- **Blue Channel:** Cloud coverage
- Recommended resolution: 4096x2048 or higher
- Color space: Linear

## Alternative Sources

If Solar System Scope textures are unavailable, you can also use:

### NASA Visible Earth
[https://visibleearth.nasa.gov/](https://visibleearth.nasa.gov/)
- Free, high-resolution Earth imagery
- May require manual processing to combine channels

### Earth Observatory
[https://earthobservatory.nasa.gov/](https://earthobservatory.nasa.gov/)
- Various Earth science datasets
- Elevation data available from SRTM

### Blue Marble
[https://visibleearth.nasa.gov/collection/1484/blue-marble](https://visibleearth.nasa.gov/collection/1484/blue-marble)
- NASA's Blue Marble series
- 8K resolution available

## Processing Combined Texture

If you need to create the combined bump/roughness/clouds texture manually:

1. **Bump Map (Red Channel):** Use SRTM elevation data or topography maps
2. **Roughness (Green Channel):** Create land/water mask (water = dark, land = bright)
3. **Clouds (Blue Channel):** Use cloud cover imagery

You can combine channels using image editing software (Photoshop, GIMP) or ImageMagick:

```bash
# Example using ImageMagick
convert bump.jpg roughness.jpg clouds.jpg \
  -channel RGB -combine earth_bump_roughness_clouds_4096.jpg
```

## Fallback Behavior

If textures are not found, the application will use procedural fallback textures:
- Day: Solid blue-green color (#4488aa)
- Night: Solid dark color (#0a0a0a)
- Bump/Roughness/Clouds: Neutral gray values

**Note:** Fallback textures provide basic visualization but lack visual detail. Download real textures for best results.

## Resolution Recommendations

| Device | Resolution | File Size (est.) |
|--------|------------|------------------|
| Mobile | 2k (2048x1024) | ~1-2 MB each |
| Desktop | 4k (4096x2048) | ~3-5 MB each |
| High-end | 8k (8192x4096) | ~10-15 MB each |

The application will automatically select appropriate resolution based on device capabilities.

## License

Ensure you comply with the licensing terms of any textures you download:
- Solar System Scope: Free for personal/educational use
- NASA imagery: Generally public domain (verify specific dataset)
