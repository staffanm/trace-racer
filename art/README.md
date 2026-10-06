# Trace Racer bitmap art

Gritty ink, distressed paint, halftone and worn surfaces, with strong surface
colors and five distinct car silhouettes designed to read at phone size.

## Files

- `tracks/track-0.png` — Asphalt Circuit: tarmac, pit garages, spectator stand,
  gravel trap and tyre walls.
- `tracks/track-1.png` — Gravel Rally: loose gravel, scrub, rocks, hay bales and
  a marshal camp.
- `tracks/track-2.png` — Ice Lake: scratched sheet ice, snow banks, frozen reeds,
  pines and a fishing hut.
- `tracks/track-3.png` — Stadium Rallycross: mixed tarmac/gravel, three ramp lips,
  infield dirt, two trackside stands, floodlights, barriers and maintenance gear.
- `tracks/track-N-texture.png` — four 512×512 seamless ground tiles.
- `tracks/track-N-check.png` — four 2560×1440 composites with the mask's road
  perimeter drawn in a one-pixel cyan contour.
- `cars/car-player.png`, `car-steady.png`, `car-balanced.png`, `car-hotshot.png`,
  `car-reckless.png` — transparent 128×80 sprites, all facing right.
- `cars/cars-check.png` — all five cars at **32×20**, on asphalt, gravel, ice and grass.
- `cars/cars-detail-check.png` — sprites at their native resolution.
- `tracks/track-N-tile-check.png` — 3×3 repeats for inspecting tile joins.
- `tracks/track-N-aspect-check.png` — 19.5:9 phone and 4:3 tablet previews.
- `sources/*.png` — retained generated materials, scenery and car originals.
- `scripts/prompts.json` — the complete final image-generation prompt set.
- `scripts/build.py` — deterministic mask compositor and sprite exporter.
- `scripts/validate.py`, `scripts/validation.json` — PNG, geometry, tile, alpha,
  finish/ramp and car-size audit, plus its measured results.

## Making and rebuilding

The built-in **image_gen** tool generated three road materials, four scenery
clusters and five individual cars. No API/CLI generation was used. All prompts
are retained in `scripts/prompts.json`.

The compositor clips each material, red/white kerb, chequered finish and striped
ramp to its exact region in the supplied masks. It adds geometry-following tyre
marks, faded dashes, cracks, repairs and ramp shadows. Scenery stays off road,
with at least 12 px of clear space around the course. The terrain combines
generated grain with periodic shading and wrapped ink flecks; opposite tile
edges have identical pixels. Each main image is RGBA: off-road ground fades
over the outer 64 px, while the road remains opaque to preserve the fixed
geometry where it approaches the frame.

When drawing the centered main image over its tile, align the tile origin with
the main image's top-left corner (modulo 512) for continuous grain in the fade.
The aspect previews demonstrate this alignment.

Rebuild from the repository root with Python, Pillow, NumPy and SciPy installed:

```sh
python art/scripts/build.py
python art/scripts/validate.py
```

The original references and game code are untouched. Visual inspection covers
all road-contour checks, the small-car and detail sheets, all four tile repeats,
and all four screen-format previews. Machine measurements are in
`scripts/validation.json`; rerun the audit after changing any assets.

Final audit: passed. Maximum recovered kerb disagreement is **2.24 px** on
track 1 (the other tracks measure 0 px), within the 3 px allowance. All tile
edge and fade-margin color differences are **0**. All 14 check images were
opened and inspected, including the final revisions.
