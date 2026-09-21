#!/usr/bin/env node
/**
 * Split the parking dataset into two files the web app fetches at runtime.
 *
 * Why: `parkingData.ts` used to `require('../data/parking.json')`, which makes
 * Metro inline all 78,346 streets into the JavaScript bundle as object
 * literals. That form barely compresses — the served bundle measured 25.85 MB
 * brotli, while the same data as raw JSON is 3.5 MB gzipped. Every visitor,
 * and every home-screen launch of the PWA, paid the difference.
 *
 * Splitting matters more than compressing. The streets with actual rules are
 * only 15,483 features (0.7 MB gzipped); the other 62,863 are the grey "no
 * published data" base network (2.8 MB). Loading the rules first means the map
 * is useful after ~0.7 MB, and the grey network arrives behind it.
 *
 * Output (generated, gitignored — src/data/parking.json stays the source of
 * truth that the pipelines write):
 *   public/data/parking-classified.json   rules
 *   public/data/parking-unknown.json      base network
 *   public/data/parking-meta.json         metadata + counts
 *
 * Run:  node scripts/split-parking-data.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src', 'data', 'parking.json');
const OUT = join(HERE, '..', 'public', 'data');

const data = JSON.parse(readFileSync(SRC, 'utf8'));
const feats = data.features;
const classified = feats.filter((f) => f.properties.cat !== 'unknown');
const unknown = feats.filter((f) => f.properties.cat === 'unknown');

await mkdir(OUT, { recursive: true });

const write = async (name, obj) => {
  const body = JSON.stringify(obj);
  await writeFile(join(OUT, name), body);
  const raw = Buffer.byteLength(body) / 1048576;
  const gz = gzipSync(body, { level: 6 }).length / 1048576;
  console.log(`  ${name.padEnd(28)} ${raw.toFixed(1).padStart(5)} MB raw  ${gz.toFixed(1).padStart(4)} MB gzipped`);
};

await write('parking-classified.json', { type: 'FeatureCollection', features: classified });
await write('parking-unknown.json', { type: 'FeatureCollection', features: unknown });
await write('parking-meta.json', {
  metadata: data.metadata,
  counts: { total: feats.length, classified: classified.length, unknown: unknown.length },
});

console.log(`✓ split ${feats.length.toLocaleString()} streets → ${classified.length.toLocaleString()} classified + ${unknown.length.toLocaleString()} unknown`);
