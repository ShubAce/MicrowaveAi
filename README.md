# रसोई सखी (Rasoi Sakhi)

A Hindi voice helper for one microwave: the **LG MJEN286UGWF** (28 L convertible, Air Fry, Charcoal, 331 auto-cook menus). Mom taps the big pink button, asks in Hindi, and सखी answers aloud with numbered steps. Each step shows the real panel buttons, what the display will show, and which accessory goes inside. Every answer comes from LG's owner's manual.

```
Phone: record → stops by itself after she stops talking
  │  audio (webm / m4a)
  ▼
/api/ask (Vercel, Mumbai)
  1. Sarvam saaras:v4 → Hindi text (with microwave keyterms)
  2. Find matching recipes (Hindi names, spelling-tolerant)
  3. Gemini, streamed as JSON: manual core + 331-menu catalog + matched recipes
  4. Each step, as soon as it is complete → Sarvam bulbul:v4-flash → MP3
  │  NDJSON stream: transcript, steps, audio
  ▼
Phone: shows steps as they arrive, plays them in order, lights up the step being spoken
```

## Run it locally

```bash
npm install
cp .env.example .env      # add GEMINI_API_KEY and SARVAMAI
npm run dev               # http://localhost:3000
```

The microphone works on `localhost` and on HTTPS only. To try it on a phone, use the deployed URL.

## Deploy to Vercel

1. `npx vercel login` (one time, opens the browser).
2. `npx vercel link`, then add the environment variables for Production:
   `npx vercel env add GEMINI_API_KEY`, `npx vercel env add SARVAMAI`, `npx vercel env add FAMILY_KEY`.
   For `FAMILY_KEY`, pick any long secret word.
3. `npx vercel deploy --prod`.
4. On her phone, open `https://<app>.vercel.app/?key=<FAMILY_KEY>` once. A cookie remembers it for a year. Then use Chrome menu ⋮ → **Add to Home screen** (or the button in सखी's settings) to install it like an app.

`vercel.json` runs the server in Mumbai (`bom1`), close to her and to Sarvam.

### Keep-awake ping (every 20 minutes)

Vercel's free Hobby plan only allows cron jobs once a day, so the ping comes from GitHub Actions: `.github/workflows/keep-warm.yml` calls `GET /api/ask`. That request answers `ok` without calling any paid API.

- Push this repository to GitHub (private is fine), then add a repository **variable** `SAKHI_URL` = `https://<app>.vercel.app` (Settings → Secrets and variables → Actions → Variables).
- The default schedule pings every 20 minutes from 5:30 AM to 11:10 PM India time, which stays inside the 2,000 free Actions minutes of a private repository. For 24 hours, change the cron line to `*/20 * * * *`.
- Without GitHub: create a free job at [cron-job.org](https://cron-job.org) for `https://<app>.vercel.app/api/ask`, every 20 minutes.

Vercel functions don't "sleep" the way Render or Heroku free servers do. A cold start costs about a second, and the ping keeps an instance warm more of the time.

## Limits and costs

- **Gemini free tier: about 20 questions a day per model.** The app tries `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3-flash-preview` and `gemini-3.1-flash-lite` in turn, and skips a model whose quota is used up until it resets. That adds up to roughly 60–80 questions a day. Turning on billing in Google AI Studio removes the cap, at about ₹0.5–2 per question. Free-tier questions may be used by Google to improve its products.
- **Sarvam:** speech-to-text costs about ₹0.08 per question and speech about ₹0.4 per answer (₹10 per 10,000 characters). New accounts get ₹100 of credit.
- **The seven quick questions** (the masala dabba) are answered from `src/lib/tiles.ts`, written from the manual, with ready-made audio. They cost nothing.

## Knowledge base

`scripts/build_kb.py` turns LG's HTML manual (`source-docs/lg-official/online-manual/`) into:

| File | What it is |
|---|---|
| `kb/core.md` | Everything except recipe write-ups: controls, modes, safety, utensils, cleaning, troubleshooting, and `kb/extra.md` (facts from LG's product page, the door label and the leaflet) |
| `kb/catalog.md` | One line per auto-cook menu (331, checked against the label inside the door) |
| `kb/recipes.json` | Each menu with its Hindi name (`kb/recipe_names_hi.json`) and full recipe |
| `kb/bundle.json` | The three above, imported by the server |
| `kb/manual.md` | The whole manual in Markdown, for reference |

The manual prints menu codes in an LCD font, so the text has letters where digits should be (`1-G` is 1-9). The build decodes them and fails if any category doesn't match the door label. Sources and links are listed in `source-docs/README.md`.

## Scripts

| Command | Does |
|---|---|
| `npm run kb` | Rebuild the knowledge base (needs Python with `beautifulsoup4`, `lxml`, `pymupdf`) |
| `npm run audio` | Record the filler and problem clips for every voice, and the quick answers in the default voice (Sarvam; existing files are kept, `-- --force` re-records) |
| `npm run icons` | App icons from the mascot |
| `npm run eval` | Ask the questions in `tests/questions.json` and check the answers. Each one is a Gemini request, so pick a few with `npm run eval -- "पनीर|लॉक"` |

## Where things are

- `src/components/SakhiApp.tsx`: the screens and the voice loop. `Mascot.tsx` is सखी. `PanelBits.tsx` has the button chips, LED badges and panel diagram. `MasalaDabba.tsx` has the quick questions.
- `src/lib/client/`: recorder (with silence detection), player and the streaming client.
- `src/lib/server/`: `answer.ts` (the pipeline), `gemini.ts` (streaming with model fallback), `sarvam.ts`, `retrieve.ts` (recipe matching), `prompt.ts` (सखी's instructions and answer format).
- `src/lib/markup.ts`: answers write buttons as `[STOP]` and display text as `{5-3}`. The screen draws them like the real panel and the voice says them in Hindi.
- `src/proxy.ts`: the family-only lock.
- `src/lib/voices.ts`: voices offered in settings. Sarvam sometimes renames voices; if speech stops working, check these ids against Sarvam's list.
