# Source documents — LG MJEN286UGWF

Official LG material for the family's microwave (Amazon ASIN B0GWHFMFMM = LG MJEN286UGWF, 28 L Convertible with Air Fry). Collected 2026-10-24.

## Files

| File | What it is | Use in the app |
|---|---|---|
| `lg-official/online-manual/en-gb/` | Owner's manual **MFL72046002** as HTML: 82 topic pages + SVG figures (`control_panel.svg`, `accessories_286.svg`, `install_rotisserie_bar.svg`, ...) | **Main knowledge source** — clean headings, numbered steps, real ingredient tables, all 331 recipes |
| `lg-official/MFL72046002_Online_Manual_HTML.zip` | Original download of the folder above | Pristine copy |
| `lg-official/MFL72046002_Owners_Manual_MJEN286UGWF.pdf` | Same manual as PDF, 300 pages, covers MJEN286UFWF/UHWF/UGWF/UBWF | Page numbers for citations, visual checks |
| `lg-official/User_Guide_MJEN286UGWF.pdf` | "Simple Owner's Manual" leaflet from the box (MBM67544502) | Safety, cleaning, warranty, LG contacts, QR links |
| `lg-official/LG_Convertible_Oven_Catalogue.pdf` | Marketing catalogue for LG's convertible range | Feature explanations (Air Fry tray, Scan to Cook) |
| `lg-cookbooks/Healthy_Heart_Cook_Book_MAX62509101.pdf` | The 30 Healthy Heart recipes with photos, prep and cooking times — scanned images, no text layer | Cross-check only (it filled two gaps in the manual's tables); see Model check |
| `lg-images/MJEN286UGWF-DZ-11.jpg` | Photo of the real control panel | UI reference |
| `lg-images/MJEN286UGWF-DZ-12.jpg` | Menu-code label printed inside the door frame | Ground truth for menu-code ranges |
| `lg-images/MJEN286UGWF-DZ-01/02/13.jpg` | Front, door open, rear | Reference |
| `lg-images/60-AirFryMenu.jpg`, `331-Auto-Cook-Menu.jpg` | LG feature banners | Reference |

Not used: `../MFL70580216 (01) MJEN286UFW OWNER MANUAL_14 DEC 2022 (1).pdf` — the older MJEN286UFW (Diet Fry instead of Air Fry, 301 menus).

## Verified facts

- **Panel buttons:** Cook Mode (hold 3 s = Wi-Fi) · Charcoal/Indian Cuisine · Healthy Heart · Indian Roti Basket/Ghee · Air Fry/Low Calorie · Kids'/Dairy Delight · dial (More/Less, − / +) · STOP/Cancel (hold 3 s = Child Lock) · START/Select/+30 seconds.
- **331 auto-cook menus** — the HTML manual's recipe codes match the door label exactly, every category numbered without gaps:

  | Button | Category (display code) | Codes |
  |---|---|---|
  | Charcoal/Indian Cuisine | 1 Charcoal · 2 Indian Cuisine · 3 Rice Delight · 4 Chatpat Corner · 5 Cooking Aid | 1-1~1-35 · 2-1~2-41 · 3-1~3-25 · 4-1~4-15 · 5-1~5-16 |
  | Healthy Heart | — | 1~30 |
  | Indian Roti Basket/Ghee | 1 Indian Roti Basket · 2 Ghee | 1-1~1-28 · 2-1~2-4 |
  | Air Fry/Low Calorie | 1 Air Fry · 2 Low Calorie | 1-1~1-60 · 2-1~2-19 |
  | Kids'/Dairy Delight | 1 Child's Favourite · 2 Bakery · 3 Dairy Delight · 4 Pasteurized Milk | 1-1~1-24 · 2-1~2-28 · 3-1~3-4 · 4-1~4-2 |

- **Everyday jobs hidden in Cooking Aid (Charcoal/Indian Cuisine → 5):** 5-1 Keep Warm, 5-2 Defrost Veg, 5-3 Defrost Non Veg, 5-16 Steam Clean, and more.
- **Display-font gotcha:** recipe codes are set in an LCD font (HTML: `<span class="lcd">`), so text shows letters for digits — `z`=2, `s`=5, `O`=0, `G`=9, `Q`=9, `b`=6 (e.g. `1-G` is 1-9, `z-b` is 2-6).
- **Accessories (manual p.16):** glass tray, rotating ring, high rack, low rack, rotisserie bar + handle, multicook tawa, air fry tray. In **Microwave** mode only the glass tray is allowed; the air fry tray works only in Grill and Convection.

## Model check (2026-10-25)

Checked again from scratch that every recipe in the app belongs to the oven bought from Amazon:

- **Amazon → model.** The family's link `amzn.in/d/0bFM7ugY` redirects to ASIN **B0GWHFMFMM**. Amazon's own page returns 503 to fetchers, so the ASIN was tied to the model through a price tracker. PriceBefore's MJEN286UGWF entry links to `amazon.in/LG-Convertible-Microwave-MJEN286UGWF-Rotisserie/dp/B0GWHFMFMM`, and its title matches the one the family pasted character for character. Look-alike listings have other ASINs: UFWF B0GTM2GWFG, UHWF B0HM3CFPGC, UJWF B0H6234PHQ, and the older UFW B0C8J7GMDY.
- **Model → manual.** The copies here are byte-identical (same MD5) to what LG India serves today on the MJEN286UGWF support page:
  - the PDF manual MFL72046002 Rev.01;
  - the HTML manual zip;
  - the in-box leaflet MBM67544502.

  The manual's cover and specification page name MJEN286UGWF.
- **Manual → app.** All 331 recipes in `kb/recipes.json` match the printed PDF in code, name, category, weight limit and utensil, and 1,403 of the 1,406 steps match word for word (the other 3 differ only in formatting). The counts per category agree in the app, on the door label and in the manual (331 in total; Air Fry 60, matching the listing's "60 Air Fry Recipe").
- **Fixed in the build** (`scripts/build_kb.py`):
  - LG's icon-font ℃ in Air Fry 1-55/1-56 had come out as "7";
  - Roti 1-19 had lost its ingredient table, and LG's printed table swaps its green-chilli and gobhi amounts (now corrected, with a note);
  - the "kit not included" note was missing from milk 4-1;
  - three of LG's own table slips in Healthy Heart 20, 25 and 26 are now corrected, each with a note.
- **Hand-written quick answers** were audited against the manual and corrected. The tandoori bowl is now the exact Paneer Tikka (1-9) recipe, because Charcoal menus differ: some start in a glass bowl, some use the rotisserie, some preheat first.
- **Not part of the 331:** the "40 Scan to Cook" recipes work only through the LG ThinQ app (manual p.292). Also, the Amazon "in the box" text mentions no rotisserie bar, although the title and the manual (p.16) do, so check that it came in the box.
- **LG's product page** wrongly says "301 Auto Cook Menu" in its FAQ. That figure belongs to the older MJEN286UFW; the title, features and manual all say 331.

Extra cook books linked by QR from this model's leaflet (neither names a model):
- **Healthy Heart** (MAX62509101, a 2019 design) has the same 30 dishes, in the same order, as Healthy Heart 1-30. Where its amounts differ, the app follows the manual. Its "cooking times" are approximate, not the program's time, so they are not used.
- **Tastes of India** (MAX62489101) has 35 recipes with manual settings: power %, convection, grill and micro+grill. Two of them need 210/220 °C, but this oven's convection goes only up to 200 °C. They are not in the app.

## LG support (leaflet p.2)

- Toll-free **1800-315-9999**, phone 08069379999, **WhatsApp 9711709999** — 24×7 except national holidays; "LG Service India" app on Google Play.
- **Free installation/demo:** once, within 3 months of purchase (warranty terms, point 15).
- Warranty: 1 year on the product; 9 more years on the Charcoal Lighting Heater (parts only).

## Links

- Product page: https://www.lg.com/in/microwave-ovens/convertible-oven/mjen286ugwf/
- Manuals & support: https://www.lg.com/in/support/product-support/cs-MJEN286UGWF.DBKQILN
- Online manual (same as the door-label QR): http://gscs-manual.lge.com/CVZ/MFL72046002/en-gb/main.html
- Official video, "Bake & Air Fry Explained" (LG India): https://www.youtube.com/watch?v=ivbsGNHlkMw
- Healthy Heart cook book: https://www.lg.com/in/healthy-heart-recipes/MAX62509101.pdf
- "Tastes of India" cook book (leaflet QR) — site unreachable on 2026-10-24: https://www.lgindianewsroom.com/assets/mwocontestrecipes/pdf/Cook-Book.pdf
- Free LG cookery classes (leaflet QR `https://qrco.de/bdaKvv`) — redirects to https://www.lgindianewsroom.com/microwave-oven-recipes/contact-us, also unreachable on 2026-10-24

## API docs used to build the app

- Sarvam: [models](https://docs.sarvam.ai/api-reference-docs/getting-started/models) · [speech-to-text REST](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/rest-api) · [text-to-speech REST](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/rest-api) · [voices](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices) · [pricing](https://docs.sarvam.ai/api/getting-started/pricing)
- Gemini: [models](https://ai.google.dev/gemini-api/docs/models) · [pricing](https://ai.google.dev/gemini-api/docs/pricing)
