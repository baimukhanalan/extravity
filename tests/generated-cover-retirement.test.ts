import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("legacy generated cover scripts", () => {
  it("cannot apply a generated cover over source media", () => {
    const directory = join(process.cwd(), "scripts");
    const filenames = readdirSync(directory).filter((filename) => /^promote-.*\.ts$/.test(filename));
    const legacy = filenames.filter((filename) => readFileSync(join(directory, filename), "utf8").includes('rightsState: "LICENSED_FALLBACK"'));
    expect(legacy.length).toBeGreaterThan(0);
    for (const filename of legacy) {
      const source = readFileSync(join(directory, filename), "utf8");
      expect(source).toContain('if (process.argv.includes("--apply")) throw new Error("Generated covers are retired; publish only original source media")');
    }
  });
});
