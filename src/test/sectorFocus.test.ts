import { describe, it, expect } from "vitest";
import { pickWeightedThemes } from "../../supabase/functions/_shared/sectors";

describe("pickWeightedThemes", () => {
  it("never picks a theme with weight 0", () => {
    for (let i = 0; i < 50; i++) {
      const out = pickWeightedThemes(["a", "b", "c"], { a: 0, b: 5, c: 5 }, 2);
      expect(out).not.toContain("a");
    }
  });
  it("returns distinct themes up to the requested count", () => {
    const out = pickWeightedThemes(["a", "b", "c"], {}, 3);
    expect(new Set(out).size).toBe(3);
  });
  it("favours higher weights", () => {
    let hits = 0;
    for (let i = 0; i < 500; i++) if (pickWeightedThemes(["hi", "lo"], { hi: 10, lo: 1 }, 1)[0] === "hi") hits++;
    expect(hits).toBeGreaterThan(400);
  });
});
