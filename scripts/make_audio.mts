// Records the short spoken lines with Sarvam, once, into public/:
//   audio/<voice>/<clip>.mp3        fillers and problem messages, for every voice in settings
//   tiles/<voice>/<tile>-<n>.mp3    the quick answers, for the default voice
// Existing files are kept unless their words changed (scripts/audio-words.json remembers what each
// file says); pass --force to record everything again.
// Usage: npx tsx --env-file=.env scripts/make_audio.mts [--force]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { CLIPS, type ClipName } from "../src/lib/clips";
import { segmentsOf, speechFor } from "../src/lib/segments";
import { speak } from "../src/lib/server/sarvam";
import { TILES } from "../src/lib/tiles";
import { DEFAULT_PACE, DEFAULT_VOICE, VOICES } from "../src/lib/voices";

const force = process.argv.includes("--force");
const WORDS = "scripts/audio-words.json";
const words: Record<string, string> = existsSync(WORDS) ? JSON.parse(readFileSync(WORDS, "utf8")) : {};
const jobs: { file: string; text: string; voice: string }[] = [];

for (const { id: voice } of VOICES) {
  for (const name of Object.keys(CLIPS) as ClipName[]) {
    jobs.push({ file: `public/audio/${voice}/${name}.mp3`, text: CLIPS[name], voice });
  }
}
for (const tile of TILES) {
  for (const s of segmentsOf(tile.answer)) {
    jobs.push({ file: `public/tiles/${DEFAULT_VOICE}/${tile.id}-${s.index}.mp3`, text: speechFor(tile.answer, s), voice: DEFAULT_VOICE });
  }
}

const todo = jobs.filter((j) => force || !existsSync(j.file) || (words[j.file] ?? j.text) !== j.text);
console.log(`${todo.length} of ${jobs.length} files to record`);
let done = 0;
let failed = 0;
async function worker() {
  for (let job = todo.shift(); job; job = todo.shift()) {
    try {
      const b64 = await speak(job.text, job.voice, DEFAULT_PACE);
      mkdirSync(dirname(job.file), { recursive: true });
      writeFileSync(job.file, Buffer.from(b64, "base64"));
      words[job.file] = job.text;
      done++;
    } catch (e) {
      failed++;
      console.error(`failed ${job.file}: ${(e as Error).message}`);
    }
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
for (const j of jobs) if (existsSync(j.file)) words[j.file] ??= j.text;
writeFileSync(WORDS, JSON.stringify(Object.fromEntries(Object.entries(words).sort()), null, 1) + "\n");
console.log(`recorded ${done}, failed ${failed}`);
