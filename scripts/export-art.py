# Copy the art masters in art/ to the files the game loads from public/art/.
# The 2560x1440 track images become WebP, which is about a tenth of the size of the PNG.
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
out = root / 'public/art'
out.mkdir(parents=True, exist_ok=True)
for src in sorted((root / 'art/tracks').glob('track-[0-9].png')):
    n = src.stem.split('-')[1]
    Image.open(src).convert('RGB').save(out / f'track-{n}.webp', quality=86, method=6)
    Image.open(src.with_name(f'track-{n}-texture.png')).convert('RGB').save(out / f'texture-{n}.webp', quality=90, method=6)
for src in sorted((root / 'art/cars').glob('car-*.png')):
    Image.open(src).save(out / src.name, optimize=True)
for f in sorted(out.iterdir()):
    print(f'{f.name}: {f.stat().st_size // 1024} KB')
