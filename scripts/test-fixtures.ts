/**
 * Figma → IR snapshot harness.
 *
 * Reads every *.json in tests/fixtures/figma/ (excluding *.normalized.json),
 * runs it through normalizeFigmaExport, and diffs the result against the
 * committed *.normalized.json snapshot.
 *
 * Modes:
 *   npm run test:fixtures            # diff mode — exits non-zero on mismatch
 *   npm run test:fixtures:update     # writes snapshots (use after intentional changes)
 *   npm run test:fixtures -- --list  # lists discovered fixtures
 *   npm run test:fixtures -- --only=elegant  # restrict to one fixture
 *
 * On mismatch, the actual output is written next to the snapshot as
 * <name>.actual.json so it can be diffed externally.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { normalizeFigmaExport } from "@/lib/figma";

const FIXTURE_DIR = path.resolve(process.cwd(), "tests/fixtures/figma");
const SNAPSHOT_SUFFIX = ".normalized.json";
const ACTUAL_SUFFIX = ".actual.json";

type Args = {
  update: boolean;
  list: boolean;
  only: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { update: false, list: false, only: null };
  for (const a of argv) {
    if (a === "--update" || a === "-u") args.update = true;
    else if (a === "--list" || a === "-l") args.list = true;
    else if (a.startsWith("--only=")) args.only = a.slice("--only=".length);
  }
  return args;
}

/**
 * Stable JSON stringify with sorted object keys and 2-space indent.
 * Object key order in Figma exports varies between plugin builds; sorting
 * makes the snapshot diffable across re-imports of the same design.
 */
function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  function walk(v: unknown): unknown {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return "[Circular]";
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(walk);
    const sortedKeys = Object.keys(v as Record<string, unknown>).sort();
    const out: Record<string, unknown> = {};
    for (const k of sortedKeys) {
      out[k] = walk((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return JSON.stringify(walk(value), null, 2) + "\n";
}

async function listFixtures(): Promise<string[]> {
  const entries = await fs.readdir(FIXTURE_DIR);
  return entries
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !f.endsWith(SNAPSHOT_SUFFIX) && !f.endsWith(ACTUAL_SUFFIX))
    .sort();
}

type FixtureResult = {
  name: string;
  status: "ok" | "updated" | "created" | "diff" | "missing-snapshot" | "error";
  message?: string;
  actualPath?: string;
};

async function runFixture(file: string, args: Args): Promise<FixtureResult> {
  const name = file.replace(/\.json$/, "");
  const inputPath = path.join(FIXTURE_DIR, file);
  const snapshotPath = path.join(FIXTURE_DIR, `${name}${SNAPSHOT_SUFFIX}`);
  const actualPath = path.join(FIXTURE_DIR, `${name}${ACTUAL_SUFFIX}`);

  let raw: unknown;
  try {
    const text = await fs.readFile(inputPath, "utf8");
    raw = JSON.parse(text);
  } catch (err) {
    return { name, status: "error", message: `failed to read/parse: ${(err as Error).message}` };
  }

  let normalized;
  try {
    normalized = normalizeFigmaExport(raw);
  } catch (err) {
    return { name, status: "error", message: `normalizer threw: ${(err as Error).message}` };
  }

  const actualSerialized = stableStringify(normalized);

  let snapshotExists = true;
  let expectedSerialized = "";
  try {
    expectedSerialized = await fs.readFile(snapshotPath, "utf8");
  } catch {
    snapshotExists = false;
  }

  if (args.update) {
    await fs.writeFile(snapshotPath, actualSerialized, "utf8");
    // Clean up any stale .actual.json from a prior failing run.
    await fs.rm(actualPath, { force: true });
    return { name, status: snapshotExists ? "updated" : "created" };
  }

  if (!snapshotExists) {
    await fs.writeFile(actualPath, actualSerialized, "utf8");
    return {
      name,
      status: "missing-snapshot",
      actualPath,
      message: "no snapshot committed yet — re-run with --update to lock baseline",
    };
  }

  if (actualSerialized !== expectedSerialized) {
    await fs.writeFile(actualPath, actualSerialized, "utf8");
    return {
      name,
      status: "diff",
      actualPath,
      message: `IR drift — wrote ${actualPath}; diff externally to inspect`,
    };
  }

  // Match — clear any leftover .actual.json from a prior run.
  await fs.rm(actualPath, { force: true });
  return { name, status: "ok" };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let fixtures: string[];
  try {
    fixtures = await listFixtures();
  } catch (err) {
    console.error(`[test-fixtures] cannot read ${FIXTURE_DIR}: ${(err as Error).message}`);
    process.exit(2);
  }

  if (args.only) {
    fixtures = fixtures.filter((f) => f.replace(/\.json$/, "") === args.only);
    if (fixtures.length === 0) {
      console.error(`[test-fixtures] no fixture matches --only=${args.only}`);
      process.exit(2);
    }
  }

  if (args.list) {
    for (const f of fixtures) console.log(f);
    return;
  }

  if (fixtures.length === 0) {
    console.warn("[test-fixtures] no fixtures found in tests/fixtures/figma/");
    return;
  }

  const results: FixtureResult[] = [];
  for (const file of fixtures) {
    results.push(await runFixture(file, args));
  }

  let failures = 0;
  for (const r of results) {
    const tag =
      r.status === "ok"
        ? "  ok"
        : r.status === "updated"
          ? " upd"
          : r.status === "created"
            ? " new"
            : r.status === "diff"
              ? "DIFF"
              : r.status === "missing-snapshot"
                ? "MISS"
                : "ERR ";
    const line = `[${tag}] ${r.name}${r.message ? ` — ${r.message}` : ""}`;
    if (r.status === "diff" || r.status === "missing-snapshot" || r.status === "error") {
      console.error(line);
      failures++;
    } else {
      console.log(line);
    }
  }

  console.log(
    `\n${results.length} fixture(s); ${results.length - failures} ok, ${failures} failing`,
  );

  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[test-fixtures] unhandled error:", err);
  process.exit(2);
});
