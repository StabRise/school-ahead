"""Slices a flashcard-sheet image (a grid of bordered cells, e.g. a 2x3 sheet
of syllable cards) into individual square images with the black border
removed.

The sheet is expected to look like docs/preschool/games/reading — a grid of
cells separated by solid black lines, e.g.:

    +--------+--------+
    |  БА 🐑 |  БО 🦫 |
    +--------+--------+
    |  БУ 🐿 |  БЕ 🦛 |
    +--------+--------+
    |  БИ 🐂 |  БІ 🐿 |
    +--------+--------+

Grid lines are located automatically (by finding full-width/full-height dark
bands), so this works for any source image that uses the same bordered-grid
layout, not just one fixed sheet. Every output card is cropped to the same
square size, taken from inside its border (the border itself is discarded).

Usage:
    uv run manage.py slice_flashcard_grid <source> [--out DIR] [--cols N] [--rows N] [--names n1,n2,...]

<source> can be a single sheet image, or a directory of sheet images. When
<source> is a directory, each sheet's cards are written into their own
subfolder named after that sheet's filename (without extension), e.g.
slicing folder/1.png and folder/2.png writes to <out>/1/ and <out>/2/.

--names takes one name per cell, in row-major order (left-to-right,
top-to-bottom), and is only valid when <source> is a single file — it sets
the output filenames directly, e.g.:

    uv run manage.py slice_flashcard_grid sheet.png --names ба,бо,бу,бе,би,бі

Without --names, cells are written as row{r}_col{c}.png.

If a sheet doesn't match the expected grid (its border lines can't be found),
it is skipped with a warning rather than aborting the whole run.
"""

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from PIL import Image

DEFAULT_COLS = 2
DEFAULT_ROWS = 3
# Fraction of a row/column that must be dark for it to count as a border line.
DARK_ROW_THRESHOLD = 0.5
# A pixel is "dark" (part of a border) below this brightness (0-255).
DARK_PIXEL_THRESHOLD = 100
# Extra pixels to trim off each side of a detected border, since anti-aliasing
# leaves a faint gray fringe just inside the border that isn't dark enough to
# be detected as part of it.
BORDER_INSET = 2
IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp'}


def _dark_fraction_per_line(image: Image.Image):
    """Returns (row_dark_fraction, col_dark_fraction) arrays for the image."""
    gray = image.convert('L')
    width, height = gray.size
    pixels = gray.load()

    row_dark = []
    for y in range(height):
        dark = sum(1 for x in range(width) if pixels[x, y] < DARK_PIXEL_THRESHOLD)
        row_dark.append(dark / width)

    col_dark = []
    for x in range(width):
        dark = sum(1 for y in range(height) if pixels[x, y] < DARK_PIXEL_THRESHOLD)
        col_dark.append(dark / height)

    return row_dark, col_dark


def _find_border_bands(fractions, threshold=DARK_ROW_THRESHOLD):
    """Groups consecutive dark lines into (start, end) bands."""
    bands = []
    band_start = None
    for i, value in enumerate(fractions):
        if value >= threshold:
            if band_start is None:
                band_start = i
        elif band_start is not None:
            bands.append((band_start, i - 1))
            band_start = None
    if band_start is not None:
        bands.append((band_start, len(fractions) - 1))
    return bands


def _cell_inner_boxes(image: Image.Image, rows: int, cols: int):
    """Returns the (left, top, right, bottom) interior box of every grid
    cell, in row-major order, with the black border lines excluded."""
    row_dark, col_dark = _dark_fraction_per_line(image)
    horizontal_bands = _find_border_bands(row_dark)
    vertical_bands = _find_border_bands(col_dark)

    if len(horizontal_bands) != 2 * rows:
        raise CommandError(
            f'Expected {2 * rows} horizontal border lines for {rows} row(s), '
            f'found {len(horizontal_bands)}. Is this really a {rows}x{cols} bordered grid?'
        )
    if len(vertical_bands) != 2 * cols:
        raise CommandError(
            f'Expected {2 * cols} vertical border lines for {cols} column(s), '
            f'found {len(vertical_bands)}. Is this really a {rows}x{cols} bordered grid?'
        )

    boxes = []
    for r in range(rows):
        top = horizontal_bands[2 * r][1] + 1 + BORDER_INSET
        bottom = horizontal_bands[2 * r + 1][0] - 1 - BORDER_INSET
        for c in range(cols):
            left = vertical_bands[2 * c][1] + 1 + BORDER_INSET
            right = vertical_bands[2 * c + 1][0] - 1 - BORDER_INSET
            boxes.append((left, top, right, bottom))
    return boxes


def slice_sheet(image: Image.Image, rows: int, cols: int) -> list[Image.Image]:
    """Slices one flashcard sheet into `rows * cols` equally-sized square
    images, in row-major order, with the grid border removed."""
    boxes = _cell_inner_boxes(image, rows, cols)
    side = min(min(right - left + 1, bottom - top + 1) for left, top, right, bottom in boxes)

    cards = []
    for left, top, right, bottom in boxes:
        cx = (left + right) // 2
        cy = (top + bottom) // 2
        half = side // 2
        box = (cx - half, cy - half, cx - half + side, cy - half + side)
        cards.append(image.crop(box))
    return cards


class Command(BaseCommand):
    help = 'Slices a bordered flashcard-grid image into equal-size square images with the border removed.'

    def add_arguments(self, parser):
        parser.add_argument('source', help='Path to a sheet image, or a directory of sheet images to crop.')
        parser.add_argument(
            '--out',
            help=(
                'Output directory. Defaults to an "img" folder next to the source. '
                'When <source> is a directory, each sheet gets its own subfolder here, named after the sheet file.'
            ),
        )
        parser.add_argument('--rows', type=int, default=DEFAULT_ROWS, help=f'Grid rows (default {DEFAULT_ROWS}).')
        parser.add_argument('--cols', type=int, default=DEFAULT_COLS, help=f'Grid columns (default {DEFAULT_COLS}).')
        parser.add_argument(
            '--names',
            help=(
                'Comma-separated output names, one per cell, row-major (e.g. ба,бо,бу,бе,би,бі). '
                'Only valid when <source> is a single file.'
            ),
        )

    def handle(self, *args, **options):
        source = Path(options['source'])
        rows = options['rows']
        cols = options['cols']
        names = options['names']

        if not source.exists():
            raise CommandError(f'{source} does not exist.')

        if names and source.is_dir():
            raise CommandError('--names can only be used when <source> is a single file.')

        if names:
            name_list = [n.strip() for n in names.split(',')]
            if len(name_list) != rows * cols:
                raise CommandError(f'--names has {len(name_list)} name(s), expected {rows * cols} for a {rows}x{cols} grid.')
        else:
            name_list = None

        is_batch = source.is_dir()
        if is_batch:
            sheets = sorted(p for p in source.iterdir() if p.suffix.lower() in IMAGE_EXTENSIONS)
            if not sheets:
                raise CommandError(f'No images found in {source}.')
            out_dir = Path(options['out']) if options['out'] else source / 'img'
        else:
            sheets = [source]
            out_dir = Path(options['out']) if options['out'] else source.parent / 'img'

        total = 0
        skipped = 0
        for sheet_path in sheets:
            image = Image.open(sheet_path).convert('RGB')
            try:
                cards = slice_sheet(image, rows, cols)
            except CommandError as exc:
                self.stdout.write(self.style.WARNING(f'{sheet_path.name}: skipped ({exc})'))
                skipped += 1
                continue

            sheet_out_dir = out_dir / sheet_path.stem if is_batch else out_dir
            sheet_out_dir.mkdir(parents=True, exist_ok=True)

            for index, card in enumerate(cards):
                if name_list:
                    filename = f'{name_list[index]}.png'
                else:
                    r, c = divmod(index, cols)
                    filename = f'row{r}_col{c}.png'
                card.save(sheet_out_dir / filename)
                total += 1

            self.stdout.write(f'{sheet_path.name}: {len(cards)} card(s) -> {sheet_out_dir}')

        summary = f'Wrote {total} card image(s) to {out_dir}'
        if skipped:
            summary += f' ({skipped} sheet(s) skipped)'
        self.stdout.write(self.style.SUCCESS(summary))
