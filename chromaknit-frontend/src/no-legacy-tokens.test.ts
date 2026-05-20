import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guardrail: the legacy pastel palette must not appear in shipped source.
 *
 * The romantic portrait-book redesign retired --rose, --blush, --lavender,
 * --sage, --sky, --peach, --mustard, --cream and --dark, along with their
 * hex values. This test scans every .css / .ts / .tsx file under src/ and
 * fails if any legacy token name or hex value is reintroduced. The test
 * file itself is excluded so it can list the forbidden values.
 *
 * If you add an intentional new use of a forbidden value, the test is
 * wrong, not the code. Update the test rather than weakening the check.
 */

const THIS_FILE = fileURLToPath(import.meta.url);
const SRC_DIR = dirname(THIS_FILE);

const LEGACY_TOKEN_NAMES = [
  "--rose",
  "--blush",
  "--lavender",
  "--sage",
  "--sky",
  "--peach",
  "--mustard",
  "--cream",
  "--dark",
];

const LEGACY_TOKEN_HEX = [
  "#E87B8B",
  "#F2AEBC",
  "#C9B8D8",
  "#9BB89A",
  "#A8C8DC",
  "#F0A882",
  "#D4A843",
  "#FAF6F0",
  "#2A1F28",
  "#C4707A",
  "#8a6870",
];

const SCAN_EXTS = new Set([".css", ".ts", ".tsx"]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (SCAN_EXTS.has(extname(full))) {
      out.push(full);
    }
  }
  return out;
}

describe("legacy-palette guardrail", () => {
  it("no source file references a legacy pastel token name or hex", () => {
    const files = walk(SRC_DIR).filter((f) => f !== THIS_FILE);
    const hits: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const tok of LEGACY_TOKEN_NAMES) {
        if (content.includes(tok)) hits.push(`${file}: ${tok}`);
      }
      const upper = content.toUpperCase();
      for (const hex of LEGACY_TOKEN_HEX) {
        if (upper.includes(hex.toUpperCase())) hits.push(`${file}: ${hex}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
