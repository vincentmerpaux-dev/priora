import { describe, expect, it } from "vitest";
import { SECONDARY_FILTERS, secondaryActive } from "@/components/app/lead-filters";

describe("filtres repliés de la file", () => {
  it("compte seulement les filtres cachés (pas la recherche, le délai ni le verdict)", () => {
    const p = new URLSearchParams({ q: "x", late: "1", verdict: "call_now" });
    expect(secondaryActive((k) => p.get(k))).toBe(0);
  });
  it("s'active dès qu'un filtre replié est présent", () => {
    for (const k of SECONDARY_FILTERS) expect(secondaryActive((key) => (key === k ? "v" : null))).toBe(1);
    expect(secondaryActive((k) => (k === "status" || k === "sort" ? "x" : ""))).toBe(2);
  });
});
