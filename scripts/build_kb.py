#!/usr/bin/env python3
"""Build the app's knowledge base from LG's HTML owner's manual (MFL72046002) for the MJEN286UGWF.

Reads   source-docs/lg-official/online-manual/en-gb/   (the manual, in reading order from main.html)
        source-docs/lg-official/MFL72046002_Owners_Manual_MJEN286UGWF.pdf   (page numbers only)
        source-docs/lg-official/User_Guide_MJEN286UGWF.pdf   (leaflet: cleaning + LG contacts)
        kb/extra.md   (hand-written facts from LG's product page, door label and catalogue)
        kb/recipe_names_hi.json   (hand-written Hindi names and everyday words for each menu)
Writes  kb/manual.md     the whole manual as clean Markdown (~137K tokens; reference and tests)
        kb/core.md       everything except the 331 recipe write-ups; sent with every question
        kb/catalog.md    one line per auto-cook menu; sent with every question
        kb/recipes.json  the 331 menus with Hindi names and full text; the server adds the
                         matching ones to a question

Run from the project root:  python -X utf8 scripts/build_kb.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF
from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parent.parent
HTML_DIR = ROOT / "source-docs/lg-official/online-manual/en-gb"
PDF_MANUAL = ROOT / "source-docs/lg-official/MFL72046002_Owners_Manual_MJEN286UGWF.pdf"
PDF_LEAFLET = ROOT / "source-docs/lg-official/User_Guide_MJEN286UGWF.pdf"
EXTRA_MD = ROOT / "kb/extra.md"
NAMES_HI = ROOT / "kb/recipe_names_hi.json"
OUT_MD = ROOT / "kb/manual.md"
OUT_CORE = ROOT / "kb/core.md"
OUT_CATALOG = ROOT / "kb/catalog.md"
OUT_RECIPES = ROOT / "kb/recipes.json"
OUT_BUNDLE = ROOT / "kb/bundle.json"  # what the server imports: core + catalog + recipes

# The manual sets menu codes in an LCD display font whose glyphs are letters.
LCD_MAP = {"z": "2", "s": "5", "O": "0", "G": "9", "Q": "9", "b": "6"}

# Auto-cook categories: which panel button, and the category number shown on the display.
AUTO_COOK = {
    "Charcoal": ("Charcoal/Indian Cuisine", "1"),
    "Indian Cuisine": ("Charcoal/Indian Cuisine", "2"),
    "Rice Delight": ("Charcoal/Indian Cuisine", "3"),
    "Chatpat Corner": ("Charcoal/Indian Cuisine", "4"),
    "Cooking Aid": ("Charcoal/Indian Cuisine", "5"),
    "Healthy Heart": ("Healthy Heart", None),
    "Indian Roti Basket": ("Indian Roti Basket/Ghee", "1"),
    "Ghee": ("Indian Roti Basket/Ghee", "2"),
    "Air Fry": ("Air Fry/Low Calorie", "1"),
    "Low Calorie": ("Air Fry/Low Calorie", "2"),
    "Child's Favourite": ("Kids'/Dairy Delight", "1"),
    "Bakery": ("Kids'/Dairy Delight", "2"),
    "Dairy Delight": ("Kids'/Dairy Delight", "3"),
    "Pasteurized Milk": ("Kids'/Dairy Delight", "4"),
}
# Ranges printed on the label inside the door frame — the build fails if the manual disagrees.
LABEL_COUNTS = {
    "Charcoal": 35, "Indian Cuisine": 41, "Rice Delight": 25, "Chatpat Corner": 15, "Cooking Aid": 16,
    "Healthy Heart": 30, "Indian Roti Basket": 28, "Ghee": 4, "Air Fry": 60, "Low Calorie": 19,
    "Child's Favourite": 24, "Bakery": 28, "Dairy Delight": 4, "Pasteurized Milk": 2,
}


def clean_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace(" ", " ")).strip()


def norm_title(s: str) -> str:
    s = s.replace("’", "'").replace("�", "'").lower()
    return re.sub(r"[^a-z0-9]+", "", s)


def decode_lcd(s: str) -> str:
    return "".join(LCD_MAP.get(ch, ch) for ch in s)


# ---------------------------------------------------------------- page numbers from the PDF bookmarks

def pdf_toc() -> list[tuple[str, int]]:
    out = []
    for _lvl, title, page in fitz.open(PDF_MANUAL).get_toc():
        m = re.match(r"^\s*([0-9A-Za-z]{1,2})\s*-\s*([0-9A-Za-z]{1,3})\s*:\s*(.+)$", title)
        if m:  # recipe bookmark: decode the LCD code
            title = f"{decode_lcd(m.group(1))}-{decode_lcd(m.group(2))}: {m.group(3)}"
        else:
            m = re.match(r"^\s*([0-9zsOGQb]{1,2})\s*:\s*(.+)$", title)  # Healthy Heart "z: Chana Dal Pancake"
            if m:
                title = f"{decode_lcd(m.group(1))}: {m.group(2)}"
        out.append((norm_title(title), page))
    return out


class PageFinder:
    """Matches headings to bookmarks in reading order, so repeated titles resolve to the right page."""

    def __init__(self) -> None:
        self.toc = pdf_toc()
        self.pos = 0

    def find(self, title: str) -> int | None:
        key = norm_title(title)
        for i in range(self.pos, len(self.toc)):
            if self.toc[i][0] == key:
                self.pos = i + 1
                return self.toc[i][1]
        return None


# ---------------------------------------------------------------- HTML → Markdown

def inline(node) -> str:
    """Inline content of a node as Markdown text."""
    if isinstance(node, NavigableString):
        return re.sub(r"\s+", " ", str(node))
    if not isinstance(node, Tag):
        return ""
    classes = node.get("class", [])
    if node.name == "span" and "lcd" in classes:
        return decode_lcd(node.get_text())
    if node.name in ("img", "script", "style"):
        return ""
    if "graphic" in classes or "footnoteref" in classes:
        return ""
    inner = "".join(inline(c) for c in node.children)
    if node.name == "span" and ("key" in classes or ("emphasis" in classes and "bold" in classes)):
        text = inner.strip()
        return f" **{text}** " if text else ""
    if node.name == "br":
        return " "
    if node.name in BLOCK_TAGS:  # keep words in separate paragraphs/cells apart
        return f" {inner} "
    return inner


BLOCK_TAGS = {"p", "div", "li", "dt", "dd", "td", "th", "tr", "ul", "ol", "dl", "h1", "h2", "h3", "h4", "h5"}


def tidy(s: str) -> str:
    s = s.replace("�", "'").replace("’", "'")
    s = s.replace("****", "")                    # empty bold
    s = re.sub(r"\*\*\s+\*\*", " ", s)           # neighbouring bold runs → one run
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s+([,.;:)])", r"\1", s)
    s = re.sub(r"\(\s+", "(", s)
    return s


def cell_text(cell: Tag) -> str:
    parts = []
    for child in cell.children:
        if isinstance(child, Tag) and child.name in ("ul", "ol"):
            parts.extend("• " + tidy(inline(li)) for li in child.find_all("li", recursive=False))
        else:
            parts.append(tidy(inline(child)))
    return tidy(" ".join(p for p in parts if p))


def table_grid(table: Tag) -> list[tuple[bool, list[str]]]:
    """Expand rowspan/colspan into a full grid. Returns (is_header_row, cells) per row."""
    rows = [tr for tr in table.find_all("tr") if tr.find_parent("table") is table]
    carried: dict[tuple[int, int], str] = {}
    grid = []
    for r, tr in enumerate(rows):
        cells = tr.find_all(["td", "th"], recursive=False)
        row: list[str] = []
        col = 0
        it = iter(cells)
        cell = next(it, None)
        while cell is not None or (r, col) in carried:
            if (r, col) in carried:
                row.append(carried.pop((r, col)))
                col += 1
                continue
            text = cell_text(cell)
            cs, rs = int(cell.get("colspan", 1)), int(cell.get("rowspan", 1))
            for k in range(cs):
                row.append(text)
                for rr in range(1, rs):
                    carried[(r + rr, col + k)] = text
            col += cs
            cell = next(it, None)
        is_header = bool(cells) and all(c.name == "th" for c in cells)
        grid.append((is_header, row))
    return grid


def markdown_table(grid: list[tuple[bool, list[str]]]) -> list[str]:
    width = max(len(r) for _, r in grid)
    rows = [r + [""] * (width - len(r)) for _, r in grid]
    header_rows = [i for i, (h, _) in enumerate(grid) if h]
    head = rows[header_rows[0]] if header_rows else rows[0]
    body = [r for i, r in enumerate(rows) if i not in (header_rows[:1] if header_rows else [0])]
    esc = lambda c: c.replace("|", "/")
    lines = ["| " + " | ".join(esc(c) for c in head) + " |", "|" + "---|" * width]
    lines += ["| " + " | ".join(esc(c) for c in r) + " |" for r in body]
    return lines


def ingredient_lines(grid: list[tuple[bool, list[str]]]) -> list[str] | None:
    """Compact form for recipe ingredient tables ('List' columns + one value column per weight)."""
    if not grid or not grid[0][0]:
        return None
    head = grid[0][1]
    list_cols = sum(1 for c in head if c == "List")
    if list_cols == 0:
        return None
    lines: list[str] = []
    weights: list[str] | None = None
    group_seen = None
    for _hdr, row in grid[1:]:
        if len(row) <= list_cols:
            continue
        group = row[0] if list_cols == 2 else ""
        name = row[list_cols - 1]
        values = row[list_cols:]
        uniq = list(dict.fromkeys(v for v in values if v))
        if norm_title(name) in ("weightlimit", "for", "weight"):
            weights = values
            continue
        value = "" if not uniq else uniq[0] if len(uniq) == 1 else " / ".join(values)
        if group and group != group_seen:
            lines.append(f"- {group}:")
            group_seen = group
        bullet = "  -" if group else "-"
        lines.append(f"{bullet} {name}: {value}" if value and value != name else f"{bullet} {name}")
    if weights and len(set(weights)) > 1:
        lines.insert(0, f"(amounts for {' / '.join(weights)})")
    elif weights:
        lines.insert(0, f"(amounts for {weights[0]})")
    return lines


def convert_blocks(node: Tag, level: int, out: list[str], ctx: dict) -> None:
    for child in node.children:
        if isinstance(child, NavigableString):
            text = tidy(str(child))
            if text:
                out.append(text)
            continue
        if not isinstance(child, Tag):
            continue
        name, classes = child.name, child.get("class", [])
        if ("graphic" in classes or name in ("img", "script", "style") or "bread-clumb" in classes
                or "containd-topics" in classes):  # "Contains Topics" navigation lists
            continue
        if name in ("h1", "h2", "h3", "h4", "h5"):
            heading(child, level, out, ctx)
        elif name == "p":
            text = tidy(inline(child))
            if text:
                out.append(text)
        elif name in ("ul", "ol"):
            list_block(child, out, ctx, indent="")
        elif name == "dl":
            for part in child.children:
                if isinstance(part, Tag) and part.name == "dt":
                    out.append(f"**{tidy(part.get_text(' '))}**")
                elif isinstance(part, Tag) and part.name in ("table", "TABLE"):
                    table_block(part, out, ingredients=True)
                elif isinstance(part, Tag):
                    convert_blocks_one(part, level, out, ctx)
        elif name == "table":
            table_block(child, out, ingredients=False)
        elif any(c in classes for c in ("note", "caution", "warning")) and not any(c.endswith(("-title", "-body", "-icon")) for c in classes):
            admonition(child, out, ctx)
        elif "footnotegroup" in classes or "footnote" in classes:
            text = tidy(inline(child))
            if text:
                out.append(f"_Note: {text}_")
        else:
            convert_blocks(child, level, out, ctx)


def convert_blocks_one(node: Tag, level: int, out: list[str], ctx: dict) -> None:
    wrapper = BeautifulSoup("<div></div>", "lxml").div
    wrapper.append(node.__copy__())
    convert_blocks(wrapper, level, out, ctx)


def li_parts(node: Tag, texts: list[str], nested: list[Tag]) -> None:
    """Split a list item into its own text and nested blocks, looking inside wrapper divs."""
    for c in node.children:
        if isinstance(c, Tag):
            cls = c.get("class", [])
            if c.name in ("ul", "ol", "table") or any(k in cls for k in ("note", "caution", "warning")):
                nested.append(c)
                continue
            if c.name == "div" and "graphic" not in cls:  # step-contents, step-result, ...
                li_parts(c, texts, nested)
                continue
        t = tidy(inline(c))
        if t:
            texts.append(t)


def list_block(lst: Tag, out: list[str], ctx: dict, indent: str) -> None:
    # Numbered steps are <ul class="procedure"> in LG's HTML.
    ordered = lst.name == "ol" or "procedure" in lst.get("class", [])
    for i, li in enumerate(lst.find_all("li", recursive=False), 1):
        marker = f"{i}." if ordered else "-"
        texts: list[str] = []
        nested: list[Tag] = []
        li_parts(li, texts, nested)
        out.append(f"{indent}{marker} {' '.join(texts)}".rstrip())
        for n in nested:
            if n.name in ("ul", "ol"):
                list_block(n, out, ctx, indent + "   ")
            elif n.name == "table":
                sub: list[str] = []
                table_block(n, sub, ingredients=False)
                out.extend(indent + "   " + s for s in sub)
            else:
                sub = []
                admonition(n, sub, ctx)
                out.extend(indent + "   " + s for s in sub)


def table_block(table: Tag, out: list[str], ingredients: bool) -> None:
    grid = table_grid(table)
    if not grid:
        return
    lines = ingredient_lines(grid) if ingredients else None
    out.extend(lines if lines is not None else markdown_table(grid))


def admonition(div: Tag, out: list[str], ctx: dict) -> None:
    kind = next(c for c in ("warning", "caution", "note") if c in div.get("class", []))
    body = div.find(class_=f"{kind}-body") or div
    sub: list[str] = []
    convert_blocks(body, 6, sub, ctx)
    out.append(f"> **{kind.upper()}**")
    out.extend(f"> {s}" for s in sub if s)


def heading(h: Tag, level: int, out: list[str], ctx: dict) -> None:
    lcd = h.find_all("span", class_="lcd")
    rel = {"h1": 0, "h2": 0, "h3": 1, "h4": 2, "h5": 3}[h.name]
    depth = min(level + rel, 6)
    if lcd:  # an auto-cook recipe heading like "1-G: Paneer Tikka"
        code = decode_lcd("".join(s.get_text() for s in lcd).replace(" ", ""))
        name = tidy(h.get_text(" ").split(":", 1)[-1])
        category = ctx.get("category")
        button, cat_no = AUTO_COOK[category]
        page = ctx["pages"].find(f"{code}: {name}")
        ctx["recipes"].append({"code": code, "name": name, "category": category, "button": button,
                               "categoryNo": cat_no, "page": page})
        ctx["current_recipe"] = ctx["recipes"][-1]
        out.append("")
        out.append(f"{'#' * depth} {code} {name}" + (f" (p. {page})" if page else ""))
        how = f"press **{button}**" + (f" until the display shows **{cat_no}**, then turn the dial to **{code}**" if cat_no
                                       else f", then turn the dial to **{code}**")
        out.append(f"Select: {how}.")
        return
    title = tidy(h.get_text(" "))
    if not title:
        return
    if title.replace("’", "'") in AUTO_COOK and ctx.get("in_recipes"):
        ctx["category"] = title.replace("’", "'")
        button, cat_no = AUTO_COOK[ctx["category"]]
        page = ctx["pages"].find(title)
        out.append("")
        sel = f"button **{button}**" + (f", category **{cat_no}**" if cat_no else "")
        out.append(f"{'#' * depth} Auto-cook menu: {title} ({sel})" + (f" (p. {page})" if page else ""))
        return
    page = ctx["pages"].find(title)
    out.append("")
    out.append(f"{'#' * depth} {title}" + (f" (p. {page})" if page else ""))


def recipe_meta(md_lines: list[str], recipes: list[dict]) -> None:
    """Pull 'Weight Limit' and 'Utensil' lines back into recipes.json."""
    by_heading = {}
    current = None
    for line in md_lines:
        m = re.match(r"^#+ (\d+(?:-\d+)?) (.+?)(?: \(p\. \d+\))?$", line)
        if m:
            current = m.group(1) + "|" + m.group(2)
            by_heading[current] = {}
            continue
        if current:
            m = re.match(r"^- \*\*(Weight Limit|Utensil)\*\*:\s*(.*)$", line)
            if m:
                by_heading[current]["weight" if m.group(1) == "Weight Limit" else "utensil"] = m.group(2).strip()
    for r in recipes:
        r.update(by_heading.get(f"{r['code']}|{r['name']}", {}))


# ---------------------------------------------------------------- assemble

def reading_order() -> list[str]:
    soup = BeautifulSoup((HTML_DIR / "main.html").read_text(encoding="utf-8"), "lxml")
    ids = [a["href"][1:] for a in soup.find_all("a", href=True) if re.match(r"^#(preface|chapter|section|topic|appendix)_\d+$", a["href"])]
    seen, order = set(), []
    # main.html lists the chapter/section index first, then the full order; keep the last full pass
    full_start = max(i for i, x in enumerate(ids) if x == "preface_1")
    for x in ids[full_start:]:
        if x not in seen:
            seen.add(x)
            order.append(x)
    return order


def leaflet_cleaning() -> list[str]:
    text = fitz.open(PDF_LEAFLET)[1].get_text()
    start, end = text.find("Maintenance"), text.find("Open Source Software Notice")
    if start < 0 or end < 0:
        raise SystemExit("leaflet layout changed: cleaning section not found")
    lines = []
    for raw in text[start:end].splitlines():
        line = raw.replace("\t", " ").strip()
        if not line:
            continue
        if line in ("Maintenance", "Cleaning", "Cleaning the Interior", "Cleaning the Exterior",
                    "Cleaning the Control Panel", "Cleaning the Accessories"):
            lines += ["", f"### {line}"]
        elif line.startswith("•"):
            lines.append("- " + line.lstrip("• ").strip())
        elif lines and lines[-1].startswith("- ") and not line[0].isupper():
            lines[-1] += " " + line
        elif lines and lines[-1] and not lines[-1].startswith("#") and not lines[-1].endswith("."):
            lines[-1] += " " + line
        else:
            lines.append(line)
    return lines


def attach_hindi_names(recipes: list[dict]) -> None:
    names = json.loads(NAMES_HI.read_text(encoding="utf-8"))
    missing = []
    for r in recipes:
        entry = names.get(f"{r['category']}|{r['code']}")
        if not entry:
            missing.append(f"{r['category']}|{r['code']}")
            continue
        parts = [p.strip() for p in entry.split(";") if p.strip()]
        r["hi"], r["aka"] = parts[0], parts[1:]
    if missing:
        raise SystemExit(f"no Hindi name for {len(missing)} menus: {missing[:10]}")


def split_core(md: str, recipes: list[dict]) -> str:
    """Move each recipe write-up into recipes[i]['md']; return the rest (minus warranty fine print)."""
    lines = md.splitlines()
    core: list[str] = []
    i = ri = 0
    skipping_warranty = False
    while i < len(lines):
        line = lines[i]
        if skipping_warranty:
            if line.startswith("# "):
                skipping_warranty = False
            else:
                i += 1
                continue
        if line.startswith("## Warranty"):  # legal terms; the useful parts are in kb/extra.md
            skipping_warranty = True
            i += 1
            continue
        if line.startswith("### Auto-cook menu:"):  # category headings live in the catalog instead
            i += 1
            continue
        if ri < len(recipes):
            r = recipes[ri]
            if re.match(rf"^#### {re.escape(r['code'])} {re.escape(r['name'])}( \(p\. \d+\))?$", line):
                j = i + 1
                while j < len(lines) and not re.match(r"^#{1,4} ", lines[j]):
                    j += 1
                r["md"] = "\n".join(lines[i:j]).strip()
                ri += 1
                i = j
                continue
        core.append(line)
        i += 1
    if ri != len(recipes):
        raise SystemExit(f"split failed: matched {ri} of {len(recipes)} recipe write-ups")
    return re.sub(r"\n{3,}", "\n\n", "\n".join(core)).strip() + "\n"


def catalog(recipes: list[dict]) -> str:
    out = [
        "# AUTO-COOK MENU CATALOG (all 331 menus)",
        "",
        "Every auto-cook menu, grouped by panel button. Line format: code, English name (Hindi name), weight limit, "
        "utensil. To run any menu: press **STOP/Cancel**, press the menu's button until its group number shows on the "
        "display, turn the dial to the menu code and press **START/Select**, turn the dial to the weight and press "
        "**START/Select**. The full recipe (ingredients, steps, what to do at the beep) is given separately when needed.",
    ]
    current = None
    for r in recipes:
        if r["category"] != current:
            current = r["category"]
            button, no = AUTO_COOK[current]
            group = f"group {no}: {current}" if no else f"{current} (no group number; codes 1-30)"
            out += ["", f"## {button} → {group}"]
        out.append(f"- {r['code']} {r['name']} ({r['hi']}) | {r.get('weight') or '-'} | {r.get('utensil') or '-'}")
    return "\n".join(out) + "\n"


def main() -> None:
    ctx = {"pages": PageFinder(), "recipes": [], "category": None, "in_recipes": False}
    out: list[str] = [
        "# LG MJEN286UGWF microwave — owner's manual (knowledge base)",
        "",
        "Source: LG owner's manual MFL72046002 (covers MJEN286UFWF/UHWF/UGWF/UBWF), the leaflet in the box, "
        "LG's product page and the menu label inside the door. Page numbers refer to the PDF manual.",
    ]
    level_of = {"preface": 1, "chapter": 1, "appendix": 1, "section": 2, "topic": 3}
    for doc_id in reading_order():
        kind = doc_id.split("_")[0]
        soup = BeautifulSoup((HTML_DIR / "topics" / f"{doc_id}.html").read_text(encoding="utf-8"), "lxml")
        meta = {m.get("name"): m.get("content") for m in soup.find_all("meta") if m.get("name")}
        # Only topic pages carry metadata; section/chapter pages hold just their title.
        ctx["in_recipes"] = kind == "topic" and clean_ws(meta.get("Section_Title", "")) == "Recipe"
        main_div = soup.select_one("div.topic-contents")
        if main_div is None:
            title = meta.get("Topic_Title") or meta.get("Section_Title") or meta.get("Chapter_Title")
            if title:
                page = ctx["pages"].find(title)
                out += ["", f"{'#' * level_of[kind]} {clean_ws(title)}" + (f" (p. {page})" if page else "")]
            continue
        convert_blocks(main_div, level_of[kind], out, ctx)

    out += ["", "# CLEANING AND MAINTENANCE (leaflet in the box)", ""] + leaflet_cleaning()
    if EXTRA_MD.exists():
        out += ["", EXTRA_MD.read_text(encoding="utf-8").strip()]

    md = re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip() + "\n"
    recipes = ctx["recipes"]
    recipe_meta(md.splitlines(), recipes)

    # Validate against the door label before writing anything.
    counts: dict[str, int] = {}
    for r in recipes:
        counts[r["category"]] = counts.get(r["category"], 0) + 1
    bad = {c: (counts.get(c), n) for c, n in LABEL_COUNTS.items() if counts.get(c) != n}
    missing_pages = [r["code"] + " " + r["name"] for r in recipes if not r["page"]]
    if bad or len(recipes) != 331:
        raise SystemExit(f"recipe check failed: {len(recipes)} recipes, mismatches {bad}")

    attach_hindi_names(recipes)
    core = split_core(md, recipes)
    cat = catalog(recipes)

    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUT_MD.write_text(md, encoding="utf-8")
    OUT_CORE.write_text(core, encoding="utf-8")
    OUT_CATALOG.write_text(cat, encoding="utf-8")
    OUT_RECIPES.write_text(json.dumps(recipes, ensure_ascii=False, indent=1), encoding="utf-8")
    OUT_BUNDLE.write_text(json.dumps({"core": core, "catalog": cat, "recipes": recipes}, ensure_ascii=False),
                          encoding="utf-8")
    for path, text in ((OUT_MD, md), (OUT_CORE, core), (OUT_CATALOG, cat)):
        print(f"wrote {path.relative_to(ROOT)}: {len(text):,} chars")
    print(f"wrote {OUT_RECIPES.relative_to(ROOT)}: {len(recipes)} recipes (matches door label)")
    if missing_pages:
        print(f"warning: no page number for {len(missing_pages)} recipes: {missing_pages[:8]}", file=sys.stderr)


if __name__ == "__main__":
    main()
