import { describe, expect, it } from "vitest";
import { addDays, challengeNumber, nextReset, torontoDate, torontoMidnight } from "@/lib/time";

describe("Toronto challenge calendar (acceptance 8: DST)", () => {
  it("rolls over at local midnight in winter (EST, UTC-5)", () => {
    expect(torontoDate(new Date("2026-01-15T04:59:59Z"))).toBe("2026-01-14");
    expect(torontoDate(new Date("2026-01-15T05:00:00Z"))).toBe("2026-01-15");
    expect(torontoMidnight("2026-01-15").toISOString()).toBe("2026-01-15T05:00:00.000Z");
  });

  it("rolls over at local midnight in summer (EDT, UTC-4)", () => {
    expect(torontoDate(new Date("2026-07-01T03:59:59Z"))).toBe("2026-06-30");
    expect(torontoDate(new Date("2026-07-01T04:00:00Z"))).toBe("2026-07-01");
    expect(torontoMidnight("2026-07-01").toISOString()).toBe("2026-07-01T04:00:00.000Z");
  });

  it("handles the spring-forward day (2026-03-08, 23-hour day)", () => {
    // Midnight Mar 8 is still EST; midnight Mar 9 is EDT.
    expect(torontoMidnight("2026-03-08").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(torontoMidnight("2026-03-09").toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(torontoDate(new Date("2026-03-08T07:30:00Z"))).toBe("2026-03-08"); // 03:30 EDT, after the jump
    expect(torontoDate(new Date("2026-03-09T03:59:59Z"))).toBe("2026-03-08");
    expect(nextReset(new Date("2026-03-08T12:00:00Z")).toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("handles the fall-back day (2026-11-01, 25-hour day)", () => {
    expect(torontoMidnight("2026-11-01").toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(torontoMidnight("2026-11-02").toISOString()).toBe("2026-11-02T05:00:00.000Z");
    // 01:30 occurs twice on Nov 1; both are still Nov 1.
    expect(torontoDate(new Date("2026-11-01T05:30:00Z"))).toBe("2026-11-01");
    expect(torontoDate(new Date("2026-11-01T06:30:00Z"))).toBe("2026-11-01");
    expect(torontoDate(new Date("2026-11-02T04:59:59Z"))).toBe("2026-11-01");
    expect(torontoDate(new Date("2026-11-02T05:00:00Z"))).toBe("2026-11-02");
  });

  it("numbers challenges from the epoch across DST and year boundaries", () => {
    expect(challengeNumber("2026-11-01")).toBe(1);
    expect(challengeNumber("2026-11-13")).toBe(13);
    expect(challengeNumber("2027-03-15")).toBe(135);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
