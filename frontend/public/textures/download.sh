#!/usr/bin/env bash
# Download all planet textures from Solar System Scope (CC BY 4.0) and NASA.
# Run from the repo root: bash frontend/public/textures/download.sh
set -euo pipefail

DEST="$(dirname "$0")/planets"
mkdir -p "$DEST"
echo "Downloading planet textures → $DEST"

SSS="https://www.solarsystemscope.com/textures/download"

dl() {
  local file="$DEST/$1" url="$2"
  if [[ -f "$file" ]]; then
    echo "  ✓ $1 already exists"
  else
    echo "  ↓ $1"
    curl -fsSL "$url" -o "$file" && echo "    done" || echo "  ✗ failed: $url"
  fi
}

dl "sun.jpg"         "${SSS}/2k_sun.jpg"
dl "mercury.jpg"     "${SSS}/2k_mercury.jpg"
dl "venus.jpg"       "${SSS}/2k_venus_surface.jpg"
dl "moon.jpg"        "${SSS}/2k_moon.jpg"
dl "mars.jpg"        "${SSS}/2k_mars.jpg"
dl "jupiter.jpg"     "${SSS}/2k_jupiter.jpg"
dl "saturn.jpg"      "${SSS}/2k_saturn.jpg"
dl "saturn_ring.png" "${SSS}/2k_saturn_ring_alpha.png"
dl "uranus.jpg"      "${SSS}/2k_uranus.jpg"
dl "neptune.jpg"     "${SSS}/2k_neptune.jpg"
dl "earth_clouds.jpg" "${SSS}/2k_earth_clouds.jpg"

# NASA Blue Marble (Earth day) — public domain
dl "earth_day.jpg"   "https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74117/world.200412.3x5400x2700.jpg"

# NASA Black Marble (Earth night) — public domain
dl "earth_night.jpg" "https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.3600x1800.jpg"

echo ""
echo "Done."
