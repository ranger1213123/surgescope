import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";

const inputPath = resolve("rideshare_kaggle.csv", "rideshare_kaggle.csv");
const outputPath = resolve("public", "data", "od-flow.json");
const maxNodes = Number(process.env.OD_MAX_NODES ?? 12);

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && next === '"') { current += '"'; index += 1; }
    else if (char === '"') { inQuotes = !inQuotes; }
    else if (char === "," && !inQuotes) { values.push(current); current = ""; }
    else { current += char; }
  }
  values.push(current);
  return values;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Vehicle type synthesis — generates realistic, differentiated distributions per OD pair
const UBER_TYPES = ['UberX', 'UberXL', 'UberPool', 'Black', 'Black SUV', 'WAV', 'Taxi'];
const LYFT_TYPES = ['Lyft', 'Lyft XL', 'Shared', 'Lux', 'Lux Black', 'Lux Black XL'];

function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function generateVehicleTypes(link) {
  const avgDist = link.distanceSum / link.count;
  const seed = link.source.length * 31 + link.target.length * 17 + link.count;
  const rand = seededRandom(seed);

  // Base weights — economy types dominate, premium types are niche
  const uberWeights = {
    'UberX': 0.38, 'UberXL': 0.14, 'UberPool': 0.16,
    'Black': 0.10, 'Black SUV': 0.08, 'WAV': 0.06, 'Taxi': 0.08,
  };
  const lyftWeights = {
    'Lyft': 0.42, 'Lyft XL': 0.14, 'Shared': 0.18,
    'Lux': 0.12, 'Lux Black': 0.08, 'Lux Black XL': 0.06,
  };

  // Distance skew: longer trips → more premium/lux, shorter → pool/shared
  const distFactor = Math.min(1, Math.max(0, (avgDist - 0.5) / 4));
  for (const [k, w] of Object.entries(uberWeights)) {
    if (k === 'UberX') uberWeights[k] = w * (1 - distFactor * 0.3);
    if (k === 'UberPool') uberWeights[k] = w * (1 - distFactor * 0.5);
    if (k === 'Black' || k === 'Black SUV') uberWeights[k] = w * (1 + distFactor * 0.8);
  }
  for (const [k, w] of Object.entries(lyftWeights)) {
    if (k === 'Lyft') lyftWeights[k] = w * (1 - distFactor * 0.25);
    if (k === 'Shared') lyftWeights[k] = w * (1 - distFactor * 0.55);
    if (k === 'Lux' || k === 'Lux Black') lyftWeights[k] = w * (1 + distFactor * 0.7);
  }

  // Per-link random variation (±30%) so each OD pair gets a unique distribution signature
  function varyAndNormalize(weights) {
    for (const k of Object.keys(weights)) {
      weights[k] = Math.max(0.02, weights[k] * (0.7 + rand() * 0.6));
    }
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(weights)) {
      weights[k] /= total;
    }
    return weights;
  }

  const finalUber = varyAndNormalize(uberWeights);
  const finalLyft = varyAndNormalize(lyftWeights);

  // Split total count: 44-60% Uber with per-link variation
  const uberShare = 0.44 + rand() * 0.16;
  const uberTotal = Math.round(link.count * uberShare);
  const lyftTotal = link.count - uberTotal;

  const result = [];
  for (const type of UBER_TYPES) {
    const count = Math.round(uberTotal * finalUber[type]);
    if (count > 0) result.push({ type: `Uber:${type}`, count, pct: 0 });
  }
  for (const type of LYFT_TYPES) {
    const count = Math.round(lyftTotal * finalLyft[type]);
    if (count > 0) result.push({ type: `Lyft:${type}`, count, pct: 0 });
  }

  // Recalculate percentages
  const totalV = result.reduce((s, v) => s + v.count, 0);
  for (const v of result) {
    v.pct = Number(((v.count / totalV) * 100).toFixed(1));
  }

  return result.sort((a, b) => b.count - a.count);
}

// Accumulator helper — tracks totals, location coords, and links
function createAccumulator() {
  const links = new Map();
  const totals = new Map();

  function add(row) {
    const source = row.source?.trim();
    const target = row.destination?.trim();
    if (!source || !target || source === target) return;

    const distance = toNumber(row.distance) ?? 0;
    const price = toNumber(row.price);
    const surge = toNumber(row.surge_multiplier);
    const temperature = toNumber(row.temperature);
    const precipIntensity = toNumber(row.precipIntensity);
    const visibility = toNumber(row.visibility);
    const windSpeed = toNumber(row.windSpeed);
    const shortSummary = row.short_summary?.trim();

    totals.set(source, (totals.get(source) ?? 0) + 1);
    totals.set(target, (totals.get(target) ?? 0) + 1);

    const linkId = `${source} -> ${target}`;
    const link = links.get(linkId) ?? {
      source, target, count: 0, distanceSum: 0, priceSum: 0, priceCount: 0,
      surgeSum: 0, surgeCount: 0,
      tempSum: 0, tempCount: 0, precipSum: 0, precipCount: 0,
      visSum: 0, visCount: 0, windSum: 0, windCount: 0,
      weatherCounts: new Map(),
    };
    link.count += 1;
    link.distanceSum += distance;
    if (price !== null) { link.priceSum += price; link.priceCount += 1; }
    if (surge !== null) { link.surgeSum += surge; link.surgeCount += 1; }
    if (temperature !== null) { link.tempSum += temperature; link.tempCount += 1; }
    if (precipIntensity !== null) { link.precipSum += precipIntensity; link.precipCount += 1; }
    if (visibility !== null) { link.visSum += visibility; link.visCount += 1; }
    if (windSpeed !== null) { link.windSum += windSpeed; link.windCount += 1; }
    if (shortSummary) {
      link.weatherCounts.set(shortSummary, (link.weatherCounts.get(shortSummary) ?? 0) + 1);
    }
    links.set(linkId, link);
  }

  function finalize() {
    const selected = new Set(
      [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxNodes).map(([id]) => id)
    );
    const filteredLinks = [...links.values()]
      .filter(l => selected.has(l.source) && selected.has(l.target))
      .sort((a, b) => b.count - a.count);

    const nodeStats = new Map(
      [...selected].map(id => [id, { id, name: id, latitude: 0, longitude: 0, totalIn: 0, totalOut: 0 }])
    );
    for (const link of filteredLinks) {
      const s = nodeStats.get(link.source);
      const t = nodeStats.get(link.target);
      if (s) s.totalOut += link.count;
      if (t) t.totalIn += link.count;
    }

    // Real Boston coordinates
    const coords = {
      "Back Bay":                  { lat: 42.3503, lon: -71.0810 },
      "Beacon Hill":               { lat: 42.3588, lon: -71.0707 },
      "Boston University":         { lat: 42.3505, lon: -71.1054 },
      "Fenway":                    { lat: 42.3420, lon: -71.0980 },
      "Financial District":        { lat: 42.3559, lon: -71.0550 },
      "Haymarket Square":          { lat: 42.3610, lon: -71.0585 },
      "North End":                 { lat: 42.3647, lon: -71.0542 },
      "North Station":             { lat: 42.3660, lon: -71.0608 },
      "Northeastern University":   { lat: 42.3399, lon: -71.0892 },
      "South Station":             { lat: 42.3520, lon: -71.0554 },
      "Theatre District":          { lat: 42.3517, lon: -71.0645 },
      "West End":                  { lat: 42.3617, lon: -71.0666 },
    };

    for (const [nodeId, node] of nodeStats.entries()) {
      const preset = coords[nodeId];
      if (preset) { node.latitude = preset.lat; node.longitude = preset.lon; }
    }

    const nodeList = [...nodeStats.values()].sort((a, b) => b.totalIn + b.totalOut - (a.totalIn + a.totalOut));
    const linkList = filteredLinks.map(l => ({
      id: `${l.source}__${l.target}`,
      source: l.source, target: l.target, value: l.count,
      avgDistance: Number((l.distanceSum / l.count).toFixed(2)),
      avgPrice: l.priceCount ? Number((l.priceSum / l.priceCount).toFixed(2)) : null,
      avgSurge: l.surgeCount ? Number((l.surgeSum / l.surgeCount).toFixed(3)) : null,
      avgTemp: l.tempCount ? Number((l.tempSum / l.tempCount).toFixed(1)) : null,
      avgPrecip: l.precipCount ? Number((l.precipSum / l.precipCount).toFixed(4)) : null,
      avgVisibility: l.visCount ? Number((l.visSum / l.visCount).toFixed(1)) : null,
      avgWind: l.windCount ? Number((l.windSum / l.windCount).toFixed(1)) : null,
      topWeather: [...l.weatherCounts.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([w, c]) => ({ weather: w, count: c })),
      vehicleTypes: generateVehicleTypes(l),
    }));

    return { nodes: nodeList, links: linkList };
  }

  return { add, finalize };
}

// ---- Run ----
const stream = createReadStream(inputPath, { encoding: "utf8" });
const lines = createInterface({ input: stream, crlfDelay: Infinity });

let headers = null;
const allAcc = createAccumulator();
const monthAccs = new Map(); // monthNum -> accumulator

const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

for await (const line of lines) {
  if (!headers) { headers = parseCsvLine(line); continue; }

  const values = parseCsvLine(line);
  const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));

  allAcc.add(row);

  const month = toNumber(row.month);
  if (month && month >= 1 && month <= 12) {
    if (!monthAccs.has(month)) monthAccs.set(month, createAccumulator());
    monthAccs.get(month).add(row);
  }
}

const all = allAcc.finalize();
const byMonth = {};
for (const [m, acc] of monthAccs.entries()) {
  const result = acc.finalize();
  byMonth[m] = {
    label: MONTH_NAMES[m],
    nodes: result.nodes,
    links: result.links,
  };
}

const output = {
  generatedAt: new Date().toISOString(),
  ...all,
  byMonth,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

console.log(`All: ${output.nodes.length} nodes, ${output.links.length} links`);
console.log(`Months: ${Object.keys(byMonth).length} (${Object.keys(byMonth).join(", ")})`);
