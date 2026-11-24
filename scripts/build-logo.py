"""
Genera todas las versiones del logo a partir de branding/back-to-school-original.png
(logo negro sobre fondo transparente).

    python -I scripts/build-logo.py

- public/img/back-to-school-negro.png   logo en azul de marca, para el modo claro
- public/img/back-to-school-blanco.png  logo en blanco, para el modo oscuro y el login
- public/img/back-to-school-icono-*.png  miniatura cuadrada (menú contraído, iPhone)
- public/icons/icon-*.png               íconos de la PWA (fondo azul, logo blanco)
"""
import pathlib

import pymupdf

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "branding/back-to-school-original.png"
IMG = ROOT / "public/img"
ICONS = ROOT / "public/icons"

NAVY = (0x1D, 0x34, 0x56)
WHITE = (0xFF, 0xFF, 0xFF)


def content_box(pix, margin=24):
    """Caja donde está el dibujo (para quitar el margen transparente que trae el archivo)."""
    if not pix.alpha:
        raise SystemExit("El logo debe tener fondo transparente.")
    w, h, n, s = pix.width, pix.height, pix.n, pix.samples
    xs, ys = [], []
    for y in range(0, h, 2):
        row = y * w * n
        for x in range(0, w, 2):
            if s[row + x * n + 3] > 10:
                xs.append(x)
                ys.append(y)
    return (max(0, min(xs) - margin), max(0, min(ys) - margin), min(w, max(xs) + margin), min(h, max(ys) + margin))


def recolor(pix, rgb):
    """Mismo logo (misma transparencia) pintado de un solo color."""
    # pymupdf guarda el color "premultiplicado" por la transparencia: color × alfa / 255.
    data = bytearray(pix.samples)
    alpha = bytes(data[3::4])
    for i, value in enumerate(rgb):
        data[i::4] = alpha.translate(bytes(value * a // 255 for a in range(256)))
    return pymupdf.Pixmap(pymupdf.csRGB, pix.width, pix.height, bytes(data), True)


def crop(pix, box):
    """Recorte copiando fila por fila (Pixmap.copy no traslada el origen en todas las versiones)."""
    x0, y0, x1, y1 = box
    w, n = pix.width, pix.n
    src = pix.samples
    rows = bytearray()
    for y in range(y0, y1):
        start = (y * w + x0) * n
        rows += src[start:start + (x1 - x0) * n]
    return pymupdf.Pixmap(pymupdf.csRGB, x1 - x0, y1 - y0, bytes(rows), True)


def square(logo_png, size, out, background=None, padding=0.12):
    """Logo centrado en un cuadrado (con fondo de color o transparente)."""
    doc = pymupdf.open()
    page = doc.new_page(width=size, height=size)
    if background:
        page.draw_rect(page.rect, color=None, fill=tuple(c / 255 for c in background))
    m = size * padding
    page.insert_image(pymupdf.Rect(m, m, size - m, size - m), filename=str(logo_png), keep_proportion=True)
    page.get_pixmap(dpi=72, alpha=background is None).save(str(out))


source = pymupdf.Pixmap(str(SOURCE))
base = crop(source, content_box(source))

dark_logo = IMG / "back-to-school-negro.png"
light_logo = IMG / "back-to-school-blanco.png"
recolor(base, NAVY).save(str(dark_logo))
recolor(base, WHITE).save(str(light_logo))

square(dark_logo, 256, IMG / "back-to-school-icono-negro.png", padding=0.04)
square(light_logo, 256, IMG / "back-to-school-icono-blanco.png", padding=0.04)
square(light_logo, 180, IMG / "back-to-school-icono-180.png", background=NAVY)
for size in (72, 96, 128, 144, 152, 192, 384, 512):
    square(light_logo, size, ICONS / f"icon-{size}x{size}.png", background=NAVY)

print(f"Logo recortado a {base.width}x{base.height}; versiones generadas en public/img y public/icons.")
