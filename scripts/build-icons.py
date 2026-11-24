"""
Convierte los SVG de src/app/shared/icons en casos del componente <app-icon>.

    python -I scripts/build-icons.py

Cada archivo "nombre-svgrepo-com.svg" queda disponible como <app-icon name="nombre" />. El color
fijo de los SVG (#1C274C) se cambia por currentColor para que tomen el color del tema (claro y
oscuro). Los casos generados van entre dos marcas en icon.html; al volver a correr el script se
reemplazan, sin tocar los íconos escritos a mano de arriba.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
ICONS = ROOT / "src/app/shared/icons"
TARGET = ROOT / "src/app/shared/components/icon/icon.html"
BEGIN = "  <!-- BEGIN íconos generados desde shared/icons (scripts/build-icons.py) -->"
END = "  <!-- END íconos generados -->"

cases = []
for svg in sorted(ICONS.glob("*.svg")):
    if "(" in svg.name:  # copias duplicadas ("archivo (1).svg")
        continue
    name = svg.stem.replace("-svgrepo-com", "")
    text = svg.read_text(encoding="utf-8")
    inner = re.search(r"<svg[^>]*>(.*)</svg>", text, re.S).group(1).strip()
    inner = re.sub(r"#1C274[CD]|#464455", "currentColor", inner, flags=re.I)
    inner = re.sub(r"\s+", " ", inner)
    cases.append(
        f"  @case ('{name}') {{\n"
        f'    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" [class]="\'shrink-0 \' + size()">{inner}</svg>\n'
        f"  }}"
    )

html = TARGET.read_text(encoding="utf-8")
generated = BEGIN + "\n" + "\n".join(cases) + "\n" + END
if BEGIN in html:
    html = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END), lambda _: generated, html, flags=re.S)
else:
    # antes del @default del @switch (o al final, si no hay @default)
    marker = html.rfind("@default")
    if marker == -1:
        marker = html.rstrip().rfind("}")
    html = html[:marker] + generated.lstrip() + "\n  " + html[marker:]
TARGET.write_text(html, encoding="utf-8")
print(f"{len(cases)} íconos generados en {TARGET.relative_to(ROOT)}")
