// App icons from the mascot component: public/icons/*.png
// Usage: npx tsx scripts/make_icons.mts
import { mkdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { Mascot } from "../src/components/Mascot";

const PISTA = "#eaf4dc";
const svg = renderToStaticMarkup(createElement(Mascot, { mood: "idle", size: 1000 }));
mkdirSync("public/icons", { recursive: true });

/** Mascot centred on a pista square, taking `share` of the width. */
async function icon(file: string, size: number, share: number) {
  const width = Math.round(size * share);
  const mascot = await sharp(Buffer.from(svg)).resize({ width }).png().toBuffer();
  const { height = width } = await sharp(mascot).metadata();
  await sharp({ create: { width: size, height: size, channels: 4, background: PISTA } })
    .composite([{ input: mascot, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2 + size * 0.02) }])
    .png()
    .toFile(`public/icons/${file}`);
  console.log("wrote", file);
}

await icon("icon-192.png", 192, 0.8);
await icon("icon-512.png", 512, 0.8);
await icon("icon-maskable-512.png", 512, 0.62); // stays inside the maskable safe zone
await icon("apple-icon.png", 180, 0.78);
await icon("favicon-48.png", 48, 0.92);
