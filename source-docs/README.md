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
| `lg-cookbooks/Healthy_Heart_Cook_Book_MAX62509101.pdf` | The 30 Healthy Heart recipes with photos, prep and cooking times — scanned images, no text layer | Optional extra: prep times, dish photos |
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
