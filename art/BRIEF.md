# Art brief: Trace Racer tracks and cars

Trace Racer is a top-down racing game for phones held in landscape. The player draws a racing line with a finger,
and a car drives it against four rivals. Today the game draws everything with flat canvas shapes
(see `reference/track-N-current.png` and `reference/cars-current.png`). This brief asks for bitmap art to replace them.

## Style

Gritty comic and graphic-novel art, in the spirit of 2000 AD and Jamie Hewlett:
heavy black ink lines, cross-hatching, halftone dots, worn and dirty surfaces, a limited and punchy palette.
The art must still read clearly on a phone screen, where the whole track is about 15 cm wide
and a car is about 20 screen pixels long. Big shapes and strong contrast first, detail second.

## Track geometry is fixed

The game's physics uses the track geometry in `reference/track-N-geometry.json`.
The art must put each surface exactly where the geometry says, or the cars will drive on grass that looks like road.

- `reference/track-N-mask.png` (2560x1440) shows the geometry in flat colours:
  - grey `#808080`: asphalt
  - tan `#c8a060`: gravel
  - light blue `#a0e0ff`: ice
  - red `#ff0000`: the kerb band along both road edges (12 px wide in game units, 16 px in the image)
  - white `#ffffff`: the start and finish line
  - yellow `#ffff00`: a jump ramp across the road (track 3 only)
  - black: off the road (grass, scenery). Cars that leave the road slow down here.
- `reference/track-N-geometry.json`: the centre line samples in driving order, each with its width, surface,
  and left and right edge points, in pixels of the 2560x1440 image.

Each road edge in the art must be within 3 px of the mask edge. Do not put scenery, shadows or decorations on the road
that make it look narrower or wider than it is. Scenery can go anywhere that is black in the mask.

## Deliverables

All files are PNG. Put them in `art/tracks/` and `art/cars/`.

### Tracks (4 tracks, numbered 0 to 3 as in the reference files)

1. `tracks/track-N.png`, 2560x1440 (16:9): the main graphic. It fills the whole screen on a 16:9 phone.
   The track already fills the frame edge to edge, so the frame is used fully. Include:
   - the road, with each surface clearly what it is:
     - asphalt: dark grey tarmac, cracks, patched repairs, rubber skid marks, faded centre dashes;
     - gravel: loose tan stones and ruts, dust, tyre grooves;
     - ice: pale blue-white sheet ice with scratches, cracks, frost and snow drifts at the edges;
   - red and white kerbs along both edges of the road (in the red mask band);
   - a chequered start and finish line across the road at the white bar;
   - jump ramps at the yellow bars (track 3): a yellow and black striped ramp lip with a shadow behind it;
   - scenery off the road that fits the track:
     - 0 Asphalt Circuit: grass, gravel traps, pit buildings, tyre walls, a grandstand;
     - 1 Gravel Rally: dry scrubland or forest edge, rocks, hay bales, marshal posts;
     - 2 Ice Lake: snow banks, frozen reeds, pine trees, a fishing hut;
     - 3 Stadium Rallycross: packed dirt infield, concrete walls, tyre stacks, floodlights, crowd stands at the edges.
2. `tracks/track-N-texture.png`, 512x512: a seamless tile of the ground off the track (grass, scrub, snow, dirt).
   The game fills the screen with this tile and draws the main graphic on top of it, centred.
   On a phone that is wider than 16:9 (an iPhone is about 19.5:9) the tile shows at the left and right,
   and on a taller screen (an iPad is 4:3) it shows at the top and bottom.
   The outer 64 px of the main graphic must fade into this texture, so that no seam shows where they meet.
   The tile must repeat with no visible seams in both directions.

### Cars (5 cars)

`cars/car-player.png`, `cars/car-steady.png`, `cars/car-balanced.png`, `cars/car-hotshot.png`, `cars/car-reckless.png`.

- Top-down view, nose pointing right (+x), transparent background.
- Image size 128x80 px. The game draws it at 32x20 game units, the size of the current cars:
  the body is about 104x56 px and the wheels may stick out to about 120x72 px.
- Keep each car's main colour, so players still know who is who:
  player yellow `#ffd23d`, Steady green `#36c27a`, Balanced blue `#3d8cf0`, Hotshot purple `#b05de0`, Reckless red `#e8463c`.
- Give each car its own character, with a silhouette that differs at a glance:
  - player: a scrappy yellow hatchback hot rod with a racing number, the hero of the comic;
  - Steady: a boxy, sensible green estate car or van, roof rack, nothing fancy;
  - Balanced: a clean blue saloon touring car, sponsor stripes;
  - Hotshot: a low purple sports car with a big rear wing and flames;
  - Reckless: a battered red rally car, dents, a missing panel, mud, a bull bar.
- Thick black outline, so each car reads against asphalt, gravel, ice and grass at 20 screen pixels.

## Method

Image generation alone will not hit the geometry to 3 px. A method that works: generate the style material
(surface textures, scenery, ink and halftone treatment) and composite it onto the mask with a script, so the
geometry stays exact, then ink and shade over it. Your choice, as long as the result meets the 3 px rule.

## Check

For each track, write `tracks/track-N-check.png`: the main graphic with the mask road edges drawn on top
as thin 1 px cyan lines. Look at it and fix any place where the art and the edges disagree.
Also write `cars/cars-check.png`: the five cars drawn at 1/4 size (32x20) on asphalt, gravel, ice and grass,
and look at it to confirm that each car is readable and different at that size.

Do not change anything outside `art/`. Write a short `art/README.md` that lists the files and how you made them,
and keep any scripts you used in `art/scripts/`.
