'use strict';
// Enriches resources/mop-import/mob-zones.json.gz's open_world entries with real
// sub-zone names (e.g. "Elwynn Forest" instead of the continent "Eastern Kingdoms"),
// using shagu/pfQuest's MIT-licensed creature-location database
// (https://github.com/shagu/pfQuest — see THIRD_PARTY_NOTICES.md). pfQuest only
// covers Vanilla + TBC content, so Wrath/Cataclysm/MoP-only creatures (and any
// creature pfQuest doesn't track) keep their continent-level name as a fallback —
// this is additive/best-effort, never invents a zone name it can't source from data.
//
// Usage: node enrich-open-world-zones.js <path-to-existing-mob-zones.json.gz> <output-path.json.gz>
// Expects units.lua, units-tbc.lua, zones.lua, zones-tbc.lua (pfQuest's db/ and
// db/enUS/ files) alongside this script — download them from the pfQuest repo above.
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const PFQUEST_DIR = __dirname;
const MOB_ZONES_GZ = process.argv[2]; // path to existing resources/mop-import/mob-zones.json.gz
const OUT_PATH = process.argv[3];

function readFile(name) {
  return fs.readFileSync(path.join(PFQUEST_DIR, name), 'utf8');
}

// ---------- Parse a flat "[id] = "Name"," zone-name locale table ----------
function parseZoneNames(text) {
  const map = new Map();
  const re = /\[(\d+)\]\s*=\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(text))) {
    const id = parseInt(m[1], 10);
    const raw = m[2];
    const name = raw.replace(/\\(.)/g, '$1'); // unescape \' \" \\ etc.
    map.set(id, name);
  }
  return map;
}

// ---------- Find the span of a balanced-brace block starting at the '{' at startIdx ----------
function findBlockEnd(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    } else if (c === '"') {
      // skip over string literals so braces inside strings don't confuse depth tracking
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\') i++;
        i++;
      }
    }
  }
  throw new Error('Unbalanced braces starting at ' + openIdx);
}

// ---------- Parse pfDB["units"]["data"] = { [id] = { ["coords"] = {...}, ... }, ... } ----------
// Returns Map<creatureId, number[]> of every zoneId seen in that creature's coords.
function parseUnitZones(text, dataKey) {
  const result = new Map();
  const rootMarker = `pfDB["units"]["${dataKey}"] = {`;
  const rootStart = text.indexOf(rootMarker);
  if (rootStart === -1) throw new Error(`units root marker not found for key "${dataKey}"`);
  const rootOpen = rootStart + rootMarker.length - 1; // index of the '{'
  const rootClose = findBlockEnd(text, rootOpen);

  const entryRe = /\[(\d+)\]\s*=\s*\{/g;
  entryRe.lastIndex = rootOpen + 1;
  let m;
  while ((m = entryRe.exec(text)) && m.index < rootClose) {
    const creatureId = parseInt(m[1], 10);
    const entryOpen = m.index + m[0].length - 1;
    const entryClose = findBlockEnd(text, entryOpen);
    const entryBody = text.slice(entryOpen, entryClose + 1);

    const coordsMarker = '["coords"] = {';
    const coordsStart = entryBody.indexOf(coordsMarker);
    if (coordsStart !== -1) {
      const coordsOpen = coordsStart + coordsMarker.length - 1;
      const coordsClose = findBlockEnd(entryBody, coordsOpen);
      const coordsBody = entryBody.slice(coordsOpen, coordsClose + 1);

      const tupleRe = /\{\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\}/g;
      let t;
      const zones = [];
      while ((t = tupleRe.exec(coordsBody))) {
        const zoneId = parseInt(t[3], 10);
        if (zoneId > 0) zones.push(zoneId);
      }
      if (zones.length > 0) {
        const existing = result.get(creatureId) || [];
        result.set(creatureId, existing.concat(zones));
      }
    }

    entryRe.lastIndex = entryClose + 1;
  }

  return result;
}

function mode(arr) {
  const freq = new Map();
  for (const v of arr) freq.set(v, (freq.get(v) || 0) + 1);
  let best = null;
  let bestCount = -1;
  for (const [v, c] of freq.entries()) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

console.error('Parsing zone name tables...');
const zoneNames = new Map([...parseZoneNames(readFile('zones.lua')), ...parseZoneNames(readFile('zones-tbc.lua'))]);
console.error(`Zone names: ${zoneNames.size}`);

console.error('Parsing unit (creature) zone tags — this takes a bit for the ~8MB of data...');
const unitZonesVanilla = parseUnitZones(readFile('units.lua'), 'data');
console.error(`Vanilla units with zone data: ${unitZonesVanilla.size}`);
const unitZonesTbc = parseUnitZones(readFile('units-tbc.lua'), 'data-tbc');
console.error(`TBC units with zone data: ${unitZonesTbc.size}`);

const combinedZoneIdsByCreature = new Map();
for (const [id, zones] of unitZonesVanilla) combinedZoneIdsByCreature.set(id, zones.slice());
for (const [id, zones] of unitZonesTbc) {
  const existing = combinedZoneIdsByCreature.get(id) || [];
  combinedZoneIdsByCreature.set(id, existing.concat(zones));
}

// creatureId -> resolved sub-zone name (mode zoneId, resolved via zoneNames)
const creatureSubZoneName = new Map();
for (const [creatureId, zoneIds] of combinedZoneIdsByCreature) {
  const zoneId = mode(zoneIds);
  const name = zoneNames.get(zoneId);
  if (name) creatureSubZoneName.set(creatureId, name);
}
console.error(`Creatures resolved to a named sub-zone: ${creatureSubZoneName.size}`);

console.error('Loading existing mob-zones.json.gz...');
const existing = JSON.parse(zlib.gunzipSync(fs.readFileSync(MOB_ZONES_GZ)).toString('utf8'));
console.error(`Existing entries: ${existing.length}`);

let enriched = 0;
const output = existing.map((entry) => {
  if (entry.zoneType !== 'open_world') return entry;
  const subZoneName = creatureSubZoneName.get(entry.creatureId);
  if (!subZoneName || subZoneName === entry.zoneName) return entry;
  enriched++;
  return { ...entry, zoneName: subZoneName };
});
console.error(`Open-world entries enriched with a sub-zone name: ${enriched}`);

const outJson = JSON.stringify(output);
const gz = zlib.gzipSync(Buffer.from(outJson, 'utf8'));
fs.writeFileSync(OUT_PATH, gz);
console.error(`Wrote ${OUT_PATH} (${gz.length} bytes)`);

// ---------- Report: distinct sub-zone names now present, top 20 by pair count ----------
const subZoneCounts = new Map();
for (const e of output) {
  if (e.zoneType === 'open_world') {
    subZoneCounts.set(e.zoneName, (subZoneCounts.get(e.zoneName) || 0) + 1);
  }
}
console.error(`\nDistinct open_world zone names now: ${subZoneCounts.size}`);
const top = [...subZoneCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
for (const [name, count] of top) console.error(`  ${name}: ${count}`);
