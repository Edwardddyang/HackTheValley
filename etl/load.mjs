// Usage: npm run etl -- <dataset key> | all
// Downloads Toronto Open Data into etl/.cache/, stages it into raw.<key>, runs etl/sql/<key>.sql,
// then drops the staging table (the free Supabase tier has 500 MB).
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import AdmZip from "adm-zip";
import { parse } from "csv-parse";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";
import { DATASETS } from "./datasets.mjs";

const CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca";
const ETL_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
const CACHE = path.join(ETL_DIR, ".cache");

async function ckan(action, params) {
  const url = `${CKAN}/api/3/action/${action}?${new URLSearchParams(params)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${action} ${res.status}`);
  return (await res.json()).result;
}

async function download(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${url}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file + ".part"));
  fs.renameSync(file + ".part", file);
  return file;
}

// Returns local CSV paths for a dataset, downloading on first use.
async function fetchCsvs(ds) {
  const dir = path.join(CACHE, ds.key);
  const pkg = await ckan("package_show", { id: ds.pkg });
  if (ds.kind === "datastore") {
    const r = pkg.resources.find((x) => x.datastore_active && x.name === ds.resource);
    if (!r) throw new Error(`${ds.key}: no datastore resource named "${ds.resource}"`);
    return [await download(`${CKAN}/datastore/dump/${r.id}`, path.join(dir, `${ds.key}.csv`))];
  }
  const csvs = [];
  for (const name of ds.resources) {
    const r = pkg.resources.find((x) => x.name === name);
    if (!r) throw new Error(`${ds.key}: no resource named "${name}"`);
    const sub = path.join(dir, name.replace(/\W+/g, "_"));
    const zip = await download(r.url, path.join(sub, "data.zip"));
    if (!fs.readdirSync(sub).some((f) => f.toLowerCase().endsWith(".csv"))) {
      new AdmZip(zip).extractAllTo(sub, true);
    }
    for (const f of fs.readdirSync(sub)) if (f.toLowerCase().endsWith(".csv")) csvs.push(path.join(sub, f));
  }
  return csvs;
}

function readHeader(file) {
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(64 * 1024);
  const n = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const line = buf.toString("utf8", 0, n).replace(/^﻿/, "").split(/\r?\n/)[0];
  const cols = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted && c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) { cols.push(cur); cur = ""; }
    else cur += c;
  }
  cols.push(cur);
  return cols;
}

// "INT. HALLWAY - WALLS / CEILING" -> int_hallway_walls_ceiling; duplicates get a numeric suffix.
function columnNames(header) {
  const seen = new Map();
  return header.map((h) => {
    let name = h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "col";
    if (/^\d/.test(name)) name = "c_" + name;
    const k = seen.get(name) ?? 0;
    seen.set(name, k + 1);
    return k ? `${name}_${k + 1}` : name;
  });
}

async function stage(client, ds, csvs) {
  const cols = columnNames(readHeader(csvs[0]));
  await client.query(`drop table if exists raw.${ds.key}`);
  await client.query(`create table raw.${ds.key} (${cols.map((c) => `"${c}" text`).join(", ")})`);
  for (const file of csvs) {
    for (const encoding of ["UTF8", "WIN1252"]) {
      try {
        await client.query("begin");
        const sql = `copy raw.${ds.key} (${cols.map((c) => `"${c}"`).join(", ")}) from stdin with (format csv, header true, encoding '${encoding}')`;
        await pipeline(fs.createReadStream(file), client.query(copyFrom(sql)));
        await client.query("commit");
        break;
      } catch (err) {
        await client.query("rollback");
        if (encoding === "WIN1252" || !/encoding|byte sequence/i.test(err.message)) throw err;
      }
    }
  }
  const { rows } = await client.query(`select count(*)::int as n from raw.${ds.key}`);
  return rows[0].n;
}

// 311 rows are only located to a postal area (FSA) or an intersection, so the app needs counts, not rows.
// Collapse ~1M requests into monthly counts per FSA, ward and request type before uploading.
async function aggregate311(ds, csvs) {
  const out = path.join(CACHE, ds.key, "aggregated.csv");
  const counts = new Map();
  for (const file of csvs) {
    const rows = fs.createReadStream(file).pipe(parse({ columns: true, bom: true, relax_column_count: true }));
    for await (const r of rows) {
      const month = (r["Creation Date"] || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) continue;
      const postal = (r["First 3 Chars of Postal Code"] || "").trim().toUpperCase();
      const fsa = /^[A-Z]\d[A-Z]$/.test(postal) ? postal : "";
      const ward = (/\((\d+)\)\s*$/.exec(r["Ward"] || "") || [])[1] || "";
      const type = (r["Service Request Type"] || "").trim();
      const key = [month, fsa, ward, type, (r["Division"] || "").trim()].join("\u0001");
      const c = counts.get(key) || { n: 0, open: 0 };
      c.n++;
      if (!/^(completed|closed|cancelled)$/i.test((r["Status"] || "").trim())) c.open++;
      counts.set(key, c);
    }
  }
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = ["month,fsa,ward,service_request_type,division,requests,open_requests"];
  for (const [key, c] of counts) lines.push([...key.split("\u0001"), c.n, c.open].map(q).join(","));
  fs.writeFileSync(out, lines.join("\n") + "\n");
  return [out];
}

async function run(client, ds) {
  const t0 = Date.now();
  let csvs = await fetchCsvs(ds);
  if (ds.aggregate === "sr311") csvs = await aggregate311(ds, csvs);
  const staged = await stage(client, ds, csvs);
  const sql = fs.readFileSync(path.join(ETL_DIR, "sql", `${ds.key}.sql`), "utf8");
  await client.query(sql);
  await client.query(`drop table if exists raw.${ds.key}`);
  console.log(`${ds.key}: staged ${staged} rows, transformed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

const arg = process.argv[2];
const downloadOnly = process.argv.includes("--download-only");
if (!arg) {
  console.error(`usage: npm run etl -- <${DATASETS.map((d) => d.key).join("|")}|all> [--download-only]`);
  process.exit(1);
}
const targets = arg === "all" ? DATASETS : DATASETS.filter((d) => d.key === arg);
if (!targets.length) {
  console.error(`unknown dataset "${arg}"`);
  process.exit(1);
}
if (downloadOnly) {
  for (const ds of targets) {
    let csvs = await fetchCsvs(ds);
    if (ds.aggregate === "sr311") csvs = await aggregate311(ds, csvs);
    console.log(`${ds.key}: ${csvs.map((f) => `${path.basename(f)} ${(fs.statSync(f).size / 1e6).toFixed(1)} MB`).join(", ")}`);
  }
  process.exit(0);
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("SUPABASE_DB_URL is not set; add the Session pooler URI to .env.local");
  process.exit(1);
}

// Verify the server against Supabase's public root CA (Supabase Root 2021 CA, valid to 2031).
const ca = fs.readFileSync(path.join(ETL_DIR, "supabase-ca.crt"), "utf8");
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { ca } });
await client.connect();
try {
  await client.query("set statement_timeout = 0");
  await client.query(fs.readFileSync(path.join(ETL_DIR, "sql", "_init.sql"), "utf8"));
  for (const ds of targets) await run(client, ds);
} finally {
  await client.end();
}
