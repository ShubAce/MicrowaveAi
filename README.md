# रसोई सखी (Rasoi Sakhi)

A Hindi voice helper for one microwave: the **LG MJEN286UGWF** (28 L convertible, Air Fry, Charcoal, 331 auto-cook menus). Mom taps the big pink button, asks in Hindi, and सखी answers aloud with numbered steps. Every answer comes from LG's owner's manual.

- **Spoken like a person explaining:** each piece is trimmed, faded and evened out in loudness, then played on the audio clock with a calm pause after it (about 0.9 s after each step, longer at the slow speed). The voice links the steps with "सबसे पहले… फिर… आख़िर में…".
- **A picture for every step:** close-ups of her panel with each button to press ringed and numbered in order (pressed once, again and again, held for 3 seconds, or the dial turning), what the display will show, the oven with the right accessory inside, or सखी saying "बीप!" with what to do next. Only the step being spoken moves. `src/lib/steps.ts` reads each step clause by clause ("…दबाइए, फिर…"), so every button gets its own words; after changing it, run `npm test`.
- **Flowers:** a marigold toran (bandhanwar) hangs across the top of the home screen, as on her front door. The step numbers are marigolds: a green bud while waiting, in full orange bloom while spoken. Small marigold sprigs sit beside the home heading and on the recipe-book card, and a doorstep rangoli closes the page. Gold line work like the art on the microwave's door finishes each answer's title and the footer's edge. The toran is hung once when the app opens; nothing moves while she follows steps.
- **Recipe book:** all 331 built-in dishes in Hindi, grouped like the panel buttons; tapping one asks सखी how to make it. Every recipe was checked against LG's printed manual for this exact model (see `source-docs/README.md`, "Model check").

```
Phone: record → stops by itself after she stops talking
  │  audio (webm / m4a)
  ▼
/api/ask (Vercel, Mumbai)
  1. Sarvam saaras:v4 → Hindi text (with microwave keyterms); Gemini if Sarvam can't
  2. Find matching recipes (Hindi names, spelling-tolerant)
  3. Gemini, streamed as JSON: manual core + 331-menu catalog + matched recipes
  4. Each step, as soon as it is complete → Sarvam bulbul:v4-flash → MP3 (or Gemini's voice → WAV)
  │  NDJSON stream: transcript, steps, audio
  ▼
Phone: shows steps as they arrive, plays them in order, lights up the step being spoken
```

## Run it locally

```bash
npm install
cp .env.example .env      # add the Gemini and Sarvam keys
npm run dev               # http://localhost:3000
```

The microphone works on `localhost` and on HTTPS only. To try it on a phone, use the deployed URL.

A second local server next to `npm run dev` needs its own build folder: `NEXT_DIST_DIR=.next-preview npx next dev -p 3211`.

## Deploy to Vercel

1. `npx vercel login` (one time, opens the browser).
2. `npx vercel link`, then add the environment variables for Production, one command each (it asks for the value):
   `npx vercel env add GEMINI_API_KEY1 production`, the same for `GEMINI_API_KEY2`, `GEMINI_API_KEY3`, `GEMINI_API_KEY4`, `SARVAMAI_1`, `SARVAMAI_2` and `FAMILY_KEY`.
   For `FAMILY_KEY`, pick any long secret word. The Vercel dashboard works too (Project → Settings → Environment Variables). The older single names `GEMINI_API_KEY` and `SARVAMAI` still work, and a key set under two names is used once.
3. `npx vercel deploy --prod`. Changed variables only take effect with the next deploy.
4. On her phone, open `https://<app>.vercel.app/?key=<FAMILY_KEY>` once. A cookie remembers it for a year. Then use Chrome menu ⋮ → **Add to Home screen** (or the button in सखी's settings) to install it like an app.

`vercel.json` runs the server in Mumbai (`bom1`), close to her and to Sarvam.

### Keep-awake ping (every 20 minutes)

Vercel's free Hobby plan only allows cron jobs once a day, so the ping comes from GitHub Actions: `.github/workflows/keep-warm.yml` calls `GET /api/ask`. That request answers `ok` without calling any paid API.

- Push this repository to GitHub (private is fine), then add a repository **variable** `SAKHI_URL` = `https://<app>.vercel.app` (Settings → Secrets and variables → Actions → Variables).
- The default schedule pings every 20 minutes from 5:30 AM to 11:10 PM India time, which stays inside the 2,000 free Actions minutes of a private repository. For 24 hours, change the cron line to `*/20 * * * *`.
- Without GitHub: create a free job at [cron-job.org](https://cron-job.org) for `https://<app>.vercel.app/api/ask`, every 20 minutes.

Vercel functions don't "sleep" the way Render or Heroku free servers do. A cold start costs about a second, and the ping keeps an instance warm more of the time.

## Several keys, and when Sarvam runs out

Keys are used in order (`GEMINI_API_KEY1`, `GEMINI_API_KEY2`, …; `SARVAMAI_1`, `SARVAMAI_2`). A key that stops working is set aside, so the next request goes straight to one that works:

| What happened | Sarvam key set aside for | Gemini key set aside for |
|---|---|---|
| Credit or the day's free quota used up | 6 hours | that model only, until the quota resets at midnight in California (12:30 PM India time; 1:30 PM from November to mid-March) |
| Rate limited | 30 seconds | that model only, as long as Google asks (usually under a minute) |
| Key not accepted | 1 hour | 1 hour, all models |

- **Voice:** Sarvam listens and speaks while any Sarvam key works. When none does, Gemini does both: `gemini-3.1-flash-lite` writes down what she said, and Gemini's speech models (`gemini-3.8-flash-lite-tts` first, voice "Sulafat") read the answer aloud. They get the words only, since they sometimes read an instruction like "speak slowly" out loud, so Gemini's voice keeps its own calm pace and the speed setting only changes the pauses between steps. Its audio is WAV, about five times the size of Sarvam's MP3 (2–4 MB for a long answer): fine on Wi-Fi and 4G.
- **Gemini's free quota belongs to a Google Cloud project, not to a key.** Keys from the same project share one quota, so create each key in its own project (AI Studio offers a new project when you create a key).
- Each Gemini request goes through the models in order, each with every key: when a key has used up a model's quota, the next key; when the model itself fails (overloaded, down), the next model. When a request has had no answer for a few seconds (6 for speech-to-text, 8 for the answer, 10 for speech), a backup request starts on the next model and whichever answers first is used.
- **Logs** (Vercel → Logs): a line whenever a key is set aside, naming keys by number only (`Gemini key 2/4 set aside for 9 h 41 min for gemini-3.6-flash: daily quota used up`), and one line per answer whose `voice` says who spoke (`sarvam`, or the Gemini model).

## Limits and costs

- **Gemini free tier: about 20 questions a day per model, for each Google Cloud project.** Answers try `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3-flash-preview` and `gemini-3.1-flash-lite` in turn: roughly 60–80 questions a day per project, so four keys from four projects go four times as far. The speech models allow far fewer requests (around ten a day each per project, as seen in October 2026), and one spoken answer needs about nine, so Gemini's voice is a stopgap for roughly 10–20 answers a day. When it runs out too, the answer still comes up on screen, and a ready-made clip tells her that सखी's voice isn't working and the answer is there to read. Turning on billing in Google AI Studio removes the caps, at about ₹0.5–2 per question. Free-tier questions may be used by Google to improve its products.
- **Sarvam:** speech-to-text costs about ₹0.08 per question and speech about ₹0.4 per answer (₹10 per 10,000 characters). New accounts get ₹100 of credit, enough for about 150–200 questions, so two accounts' keys go twice as far.
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

The manual prints menu codes in an LCD font, so the text has letters where digits should be (`1-G` is 1-9), and a few symbols in an icon font (℃ is a "7"). The build decodes both and fails if any category doesn't match the door label. A short `ERRATA` list in the script fixes slips in LG's own tables, each with a note in the recipe. Sources and links are listed in `source-docs/README.md`.

## Scripts

| Command | Does |
|---|---|
| `npm run kb` | Rebuild the knowledge base (needs Python with `beautifulsoup4`, `lxml`, `pymupdf`) |
| `npm run audio` | Record the filler and problem clips for every voice, and the quick answers in the default voice (Sarvam). Only clips whose words changed are recorded again (`scripts/audio-words.json` remembers what each file says); `-- --force` re-records all |
| `npm run icons` | App icons from the mascot |
| `npm test` | `tests/scenes.mts` checks which picture each step gets (116 tricky step wordings; `npx tsx tests/scenes.mts --tiles` also lists the picture of every quick-answer step). `tests/fallback.mts` checks key rotation and the Sarvam → Gemini fallback against fake services, so it needs no keys and spends no quota |
| `npm run eval` | Ask the questions in `tests/questions.json` and check the answers. Each one is a Gemini request, so pick a few with `npm run eval -- "पनीर|लॉक"` |

## Where things are

- `src/components/SakhiApp.tsx`: the screens and the voice loop. `Mascot.tsx` is सखी. `PanelBits.tsx` has the button chips and LED badges. `StepPicture.tsx` draws each step's picture, chosen by `src/lib/steps.ts`. `Floral.tsx` (with `floral.css`) has the flowers: toran, marigold step numbers, sprigs, rangoli and the gold trims. `MasalaDabba.tsx` has the quick questions; `RecipeBook.tsx` the recipe book (data: `public/recipe-book.json`, made by `npm run kb`).
- `src/lib/client/`: recorder (with silence detection), player (trimming, loudness, pauses between pieces) and the streaming client.
- `src/lib/markup.ts` (`spokenPiece`): what the voice says for each piece, with the linking words.
- `src/lib/server/`: `answer.ts` (the pipeline), `voice.ts` (speech in and out: Sarvam, else Gemini), `gemini.ts` (every request over models × keys, with backups), `sarvam.ts`, `keys.ts` (several keys per service, and setting them aside), `retrieve.ts` (recipe matching), `prompt.ts` (सखी's instructions and answer format).
- `src/lib/markup.ts`: answers write buttons as `[STOP]` and display text as `{5-3}`. The screen draws them like the real panel and the voice says them in Hindi.
- `src/proxy.ts`: the family-only lock.
- `src/lib/voices.ts`: voices offered in settings. Sarvam sometimes renames voices; if speech stops working, check these ids against Sarvam's list.
