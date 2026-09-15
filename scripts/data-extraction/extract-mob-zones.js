'use strict';
// Regenerates resources/mop-import/mob-zones.json.gz from a SkyFire_548 world-database
// SQL dump (https://github.com/ProjectSkyfire/SkyFire_548, GPL-3.0 — see THIRD_PARTY_NOTICES.md).
// Cross-references the `creature`, `instance_template`, and `access_requirement` tables to
// resolve which zone/instance each tracked mob spawns in, and classifies each as
// open_world / dungeon / raid / unknown (never inventing a name it can't source from the data).
//
// Usage: node extract-mob-zones.js <path-to-world-db-dump.sql> <path-to-mobs.json.gz> <output-path.json.gz>
const fs = require('fs');
const zlib = require('zlib');

const SQL_PATH = process.argv[2];
const MOBS_GZ_PATH = process.argv[3];
const OUT_PATH = process.argv[4];

console.error('Reading SQL file...');
const sql = fs.readFileSync(SQL_PATH, 'utf8');
console.error(`SQL file loaded: ${(sql.length / 1e6).toFixed(1)}M chars`);

// ---------- Generic mysqldump tuple parser ----------
// Parses a string like "(1,2,'a\\'b',NULL),(3,4,'c',5)" into arrays of raw field strings.
function parseTuples(valuesStr) {
  const tuples = [];
  let i = 0;
  const n = valuesStr.length;
  while (i < n) {
    while (i < n && (valuesStr[i] === ',' || /\s/.test(valuesStr[i]))) i++;
    if (i >= n) break;
    if (valuesStr[i] !== '(') break;
    i++; // consume '('
    const fields = [];
    let cur = '';
    let inString = false;
    while (i < n) {
      const c = valuesStr[i];
      if (inString) {
        if (c === '\\' && i + 1 < n) {
          cur += c;
          cur += valuesStr[i + 1];
          i += 2;
          continue;
        }
        if (c === "'") {
          // check doubled '' escape
          if (valuesStr[i + 1] === "'") {
            cur += "''";
            i += 2;
            continue;
          }
          inString = false;
          cur += c;
          i++;
          continue;
        }
        cur += c;
        i++;
        continue;
      } else {
        if (c === "'") {
          inString = true;
          cur += c;
          i++;
          continue;
        }
        if (c === ')') {
          fields.push(cur);
          cur = '';
          i++;
          break;
        }
        if (c === ',') {
          fields.push(cur);
          cur = '';
          i++;
          continue;
        }
        cur += c;
        i++;
        continue;
      }
    }
    tuples.push(fields);
  }
  return tuples;
}

function unescapeMysqlString(raw) {
  // raw includes surrounding single quotes, or is NULL / a bare number
  if (raw === 'NULL') return null;
  if (raw.length >= 2 && raw[0] === "'" && raw[raw.length - 1] === "'") {
    const s = raw.slice(1, -1);
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\' && i + 1 < s.length) {
        const next = s[i + 1];
        switch (next) {
          case 'n': out += '\n'; i++; break;
          case 't': out += '\t'; i++; break;
          case 'r': out += '\r'; i++; break;
          case '0': out += '\0'; i++; break;
          case "'": out += "'"; i++; break;
          case '"': out += '"'; i++; break;
          case '\\': out += '\\'; i++; break;
          default: out += next; i++; break;
        }
      } else if (c === "'" && s[i + 1] === "'") {
        out += "'";
        i++;
      } else {
        out += c;
      }
    }
    return out;
  }
  return raw; // bare number
}

// ---------- Extract INSERT statement bodies for a table ----------
function extractInsertBodies(sqlText, tableName) {
  const bodies = [];
  const marker = `INSERT INTO \`${tableName}\` VALUES `;
  let searchFrom = 0;
  while (true) {
    const idx = sqlText.indexOf(marker, searchFrom);
    if (idx === -1) break;
    // must be at start of a line
    if (idx !== 0 && sqlText[idx - 1] !== '\n') {
      searchFrom = idx + marker.length;
      continue;
    }
    const bodyStart = idx + marker.length;
    const lineEnd = sqlText.indexOf('\n', bodyStart);
    const rawLine = lineEnd === -1 ? sqlText.slice(bodyStart) : sqlText.slice(bodyStart, lineEnd);
    // trim trailing ';' (and possible trailing \r)
    const trimmed = rawLine.replace(/;\s*\r?$/, '');
    bodies.push(trimmed);
    searchFrom = lineEnd === -1 ? sqlText.length : lineEnd + 1;
  }
  return bodies;
}

// ---------- creature table: columns per CREATE TABLE ----------
// guid(0) id(1) map(2) spawnMask(3) phaseId(4) phaseGroup(5) modelid(6) equipment_id(7)
// position_x(8) position_y(9) position_z(10) orientation(11) spawntimesecs(12) spawndist(13)
// currentwaypoint(14) curhealth(15) curmana(16) MovementType(17) npcflag(18) unit_flags(19) dynamicflags(20)
console.error('Extracting creature table...');
const creatureBodies = extractInsertBodies(sql, 'creature');
console.error(`Found ${creatureBodies.length} INSERT statement(s) for creature`);

// ---------- instance_template table: map(0) parent(1) script(2) allowMount(3) ----------
console.error('Extracting instance_template table...');
const instanceTemplateBodies = extractInsertBodies(sql, 'instance_template');
console.error(`Found ${instanceTemplateBodies.length} INSERT statement(s) for instance_template`);

// ---------- access_requirement table: mapId(0) difficulty(1) ... comment(11, last) ----------
console.error('Extracting access_requirement table...');
const accessReqBodies = extractInsertBodies(sql, 'access_requirement');
console.error(`Found ${accessReqBodies.length} INSERT statement(s) for access_requirement`);

// Free the big SQL string reference ASAP to help GC (still referenced by bodies via slices, unavoidable but ok)

// ---------- Parse instance_template ----------
const instanceTemplate = new Map(); // mapId -> { script, parent }
for (const body of instanceTemplateBodies) {
  const tuples = parseTuples(body);
  for (const f of tuples) {
    const mapId = parseInt(f[0], 10);
    const parent = parseInt(f[1], 10);
    const script = unescapeMysqlString(f[2]) || '';
    instanceTemplate.set(mapId, { script, parent });
  }
}
console.error(`instance_template rows: ${instanceTemplate.size}`);

// ---------- Parse access_requirement ----------
const accessReqComments = new Map(); // mapId -> [comment strings]
for (const body of accessReqBodies) {
  const tuples = parseTuples(body);
  for (const f of tuples) {
    const mapId = parseInt(f[0], 10);
    const comment = unescapeMysqlString(f[f.length - 1]); // last column
    if (comment === null || comment === '') continue;
    if (!accessReqComments.has(mapId)) accessReqComments.set(mapId, []);
    accessReqComments.get(mapId).push(comment);
  }
}
console.error(`access_requirement distinct mapIds with comments: ${accessReqComments.size}`);

// ---------- Clean a comment into a candidate zone name ----------
const DIFFICULTY_SUFFIX_RE = /\s*-\s*(\d{1,3}\s*(N|HC|H)|HC|H|N|Heroic Scenario|Heroic|Raid Finder|Flexible|Scenario)\s*$/i;
const TRAILING_WORD_RE = /\s+(Heroic Scenario|Heroic|Scenario|Raid Finder|Flexible|Raid)\s*$/i;
const TRAILING_PAREN_RE = /\s*\([^()]*\)\s*$/;

function cleanComment(raw) {
  let s = raw.trim();
  // iteratively strip trailing difficulty suffixes
  for (let iter = 0; iter < 4; iter++) {
    const before = s;
    s = s.replace(DIFFICULTY_SUFFIX_RE, '');
    s = s.replace(TRAILING_WORD_RE, '');
    s = s.trim();
    if (s === before) break;
  }
  // iteratively strip trailing parenthetical qualifiers e.g. (Entrance), (Outside)
  for (let iter = 0; iter < 3; iter++) {
    const before = s;
    s = s.replace(TRAILING_PAREN_RE, '').trim();
    if (s === before) break;
  }
  // strip trailing difficulty suffix again in case it was behind the paren
  for (let iter = 0; iter < 2; iter++) {
    const before = s;
    s = s.replace(DIFFICULTY_SUFFIX_RE, '');
    s = s.replace(TRAILING_WORD_RE, '');
    s = s.trim();
    if (s === before) break;
  }
  // take portion before first comma (drops descriptors like ",Main" or ", Alliance Base")
  const commaIdx = s.indexOf(',');
  if (commaIdx !== -1) {
    s = s.slice(0, commaIdx).trim();
  }
  return s.trim();
}

function deriveNameFromScript(script) {
  if (!script) return '';
  let s = script.replace(/^instance_/, '');
  s = s.replace(/_/g, ' ');
  s = s
    .split(' ')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
  return s.trim();
}

// ---------- Resolve canonical name per instance mapId ----------
const instanceNames = new Map(); // mapId -> { name, source: 'access_requirement'|'script'|'none' }
const fallbackScriptMapIds = [];

for (const [mapId, info] of instanceTemplate.entries()) {
  let name = '';
  let source = 'none';
  const comments = accessReqComments.get(mapId);
  if (comments && comments.length > 0) {
    const freq = new Map();
    for (const c of comments) {
      const cleaned = cleanComment(c);
      if (!cleaned) continue;
      freq.set(cleaned, (freq.get(cleaned) || 0) + 1);
    }
    if (freq.size > 0) {
      let best = null;
      let bestCount = -1;
      for (const [cand, count] of freq.entries()) {
        if (count > bestCount || (count === bestCount && (best === null || cand.length < best.length))) {
          best = cand;
          bestCount = count;
        }
      }
      name = best;
      source = 'access_requirement';
    }
  }
  if (!name) {
    const scriptName = deriveNameFromScript(info.script);
    if (scriptName) {
      name = scriptName;
      source = 'script';
      fallbackScriptMapIds.push({ mapId, script: info.script, derivedName: scriptName });
    }
  }
  instanceNames.set(mapId, { name, source });
}

// ---------- Raid classification ----------
const RAID_NAMES = [
  "Molten Core", "Blackwing Lair", "Ruins of Ahn'Qiraj", "Temple of Ahn'Qiraj",
  "Onyxia's Lair", "Zul'Gurub", "Karazhan", "Gruul's Lair", "Magtheridon's Lair",
  "Serpentshrine Cavern", "The Eye", "Tempest Keep", "Hyjal Summit",
  "Battle for Mount Hyjal", "Black Temple", "Sunwell Plateau", "Naxxramas",
  "The Obsidian Sanctum", "The Eye of Eternity", "Vault of Archavon", "Ulduar",
  "Trial of the Crusader", "Trial of the Grand Crusader", "Icecrown Citadel",
  "The Ruby Sanctum", "Baradin Hold", "Blackwing Descent", "Bastion of Twilight",
  "Throne of the Four Winds", "Firelands", "Dragon Soul", "Mogu'shan Vaults",
  "Heart of Fear", "Terrace of Endless Spring", "Throne of Thunder",
  "Siege of Orgrimmar", "Zul'Aman",
];

const STOPWORDS = new Set(['of', 'the', 'for', 'a', 'an', 'and']);
function significantWords(str) {
  return str
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
}
const raidWordSets = RAID_NAMES.map((n) => significantWords(n));

function isRaidName(name) {
  if (!name) return false;
  const words = significantWords(name);
  if (words.length === 0) return false;
  for (const raidWords of raidWordSets) {
    const allRaidInName = raidWords.every((w) => words.includes(w));
    const allNameInRaid = words.every((w) => raidWords.includes(w));
    if (allRaidInName || allNameInRaid) return true;
  }
  return false;
}

// ---------- Continents ----------
const CONTINENTS = new Map([
  [0, 'Eastern Kingdoms'],
  [1, 'Kalimdor'],
  [530, 'Outland'],
  [571, 'Northrend'],
  [870, 'Pandaria'],
]);

function resolveZone(mapId) {
  if (CONTINENTS.has(mapId)) {
    return { zoneName: CONTINENTS.get(mapId), zoneType: 'open_world' };
  }
  const inst = instanceNames.get(mapId);
  if (inst && inst.name) {
    const zoneType = isRaidName(inst.name) ? 'raid' : 'dungeon';
    return { zoneName: inst.name, zoneType };
  }
  return { zoneName: `Unknown Zone (map ${mapId})`, zoneType: 'unknown' };
}

// ---------- Load valid creatureIds from mobs.json.gz ----------
console.error('Loading mobs.json.gz...');
const mobsGz = fs.readFileSync(MOBS_GZ_PATH);
const mobsJson = zlib.gunzipSync(mobsGz).toString('utf8');
const mobs = JSON.parse(mobsJson);
const validCreatureIds = new Set(mobs.map((m) => m.creatureId));
console.error(`Valid creatureIds: ${validCreatureIds.size}`);

// ---------- Parse creature table, aggregate (id, map) -> spawnCount ----------
console.error('Parsing creature spawns...');
const pairCounts = new Map(); // `${id}_${map}` -> { creatureId, mapId, spawnCount }
let totalCreatureRows = 0;
let matchedCreatureRows = 0;

for (const body of creatureBodies) {
  const tuples = parseTuples(body);
  for (const f of tuples) {
    totalCreatureRows++;
    const id = parseInt(f[1], 10);
    const mapId = parseInt(f[2], 10);
    if (!validCreatureIds.has(id)) continue;
    matchedCreatureRows++;
    const key = `${id}_${mapId}`;
    let entry = pairCounts.get(key);
    if (!entry) {
      entry = { creatureId: id, mapId, spawnCount: 0 };
      pairCounts.set(key, entry);
    }
    entry.spawnCount++;
  }
}
console.error(`Total creature rows parsed: ${totalCreatureRows}`);
console.error(`Matched creature rows (valid creatureId): ${matchedCreatureRows}`);
console.error(`Distinct (creatureId, mapId) pairs: ${pairCounts.size}`);

// ---------- Build output ----------
const output = [];
for (const entry of pairCounts.values()) {
  const { zoneName, zoneType } = resolveZone(entry.mapId);
  output.push({
    creatureId: entry.creatureId,
    mapId: entry.mapId,
    zoneName,
    zoneType,
    spawnCount: entry.spawnCount,
  });
}
output.sort((a, b) => a.creatureId - b.creatureId || a.mapId - b.mapId);

console.error(`Output entries: ${output.length}`);

// ---------- Stats for report ----------
const statsByType = new Map();
const zoneNamesByType = new Map();
for (const e of output) {
  const s = statsByType.get(e.zoneType) || { pairs: 0 };
  s.pairs++;
  statsByType.set(e.zoneType, s);
  if (!zoneNamesByType.has(e.zoneType)) zoneNamesByType.set(e.zoneType, new Set());
  zoneNamesByType.get(e.zoneType).add(e.mapId);
}

console.error('\n=== zoneType breakdown ===');
for (const [type, s] of statsByType.entries()) {
  console.error(`${type}: ${s.pairs} pairs, ${zoneNamesByType.get(type).size} distinct map ids`);
}

console.error('\n=== fallback (script-derived) instance names ===');
for (const f of fallbackScriptMapIds) {
  console.error(`map ${f.mapId}: script='${f.script}' -> '${f.derivedName}'`);
}

console.error('\n=== top unknown map ids by pair count ===');
const unknownCounts = new Map();
for (const e of output) {
  if (e.zoneType === 'unknown') {
    unknownCounts.set(e.mapId, (unknownCounts.get(e.mapId) || 0) + 1);
  }
}
const topUnknown = [...unknownCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
for (const [mapId, count] of topUnknown) {
  console.error(`map ${mapId}: ${count} pairs`);
}

// ---------- Write gzipped output ----------
const outJson = JSON.stringify(output);
const gz = zlib.gzipSync(Buffer.from(outJson, 'utf8'));
fs.writeFileSync(OUT_PATH, gz);
console.error(`\nWrote ${OUT_PATH} (${gz.length} bytes, ${(gz.length / 1024).toFixed(1)} KB)`);
console.error(`Uncompressed JSON size: ${(outJson.length / 1e6).toFixed(2)} MB`);
