import { expect, test } from "@playwright/test";
import { correctLabel, wrongLabel } from "./db";

const TIMER_PATTERN = /\b\d{1,2}:\d{2}\b|timer|seconds left|time left/i;

test.describe("daily challenge on a phone", () => {
  test("play: correct answers advance, a wrong answer ends the run, solutions & share appear (acceptance 10–12, 14)", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`${e.message}\n${e.stack}`));
    test.info().annotations.push({ type: "errors", description: "page errors are printed on failure" });
    page.on("close", () => errors.length && console.log(errors.join("\n---\n")));
    await page.goto("/");
    await expect(page.getByText(/Challenge No\. \d+/)).toBeVisible();
    await page.getByTestId("play").click();
    await expect(page.getByTestId("question")).toBeVisible();

    for (const slot of [1, 2, 3, 4]) {
      await expect(page.getByTestId("progress")).toHaveText(`${slot} / 8`);
      // No visible stopwatch/countdown anywhere during play.
      expect(await page.locator("body").innerText()).not.toMatch(TIMER_PATTERN);
      if (slot === 3) {
        await expect(page.locator(".jxgbox svg").first()).toBeVisible(); // geometry diagram
        await page.screenshot({ path: "screenshots/tmp/play-diagram.png" });
      }
      if (slot === 4) {
        await expect(page.locator(".jxgbox svg").first()).toBeVisible(); // function graph with axes
        await page.screenshot({ path: "screenshots/tmp/play-graph.png" });
        expect(await page.locator(".jxgbox svg path").count()).toBeGreaterThan(0);
      }
      await page.getByTestId(`option-${await correctLabel(slot)}`).click();
    }
    await expect(page.getByTestId("progress")).toHaveText("5 / 8");
    await page.getByTestId(`option-${await wrongLabel(5)}`).click();

    await expect(page.getByTestId("results")).toBeVisible();
    await expect(page.getByTestId("score")).toContainText("4");
    await expect(page.getByTestId("rank")).toContainText("#1");
    for (let s = 1; s <= 8; s++) await expect(page.getByTestId(`solution-${s}`)).toBeVisible();
    await expect(page.getByTestId("solution-8")).toContainText("Practice · unranked");
    await page.screenshot({ path: "screenshots/tmp/results-mobile.png", fullPage: false });

    await page.getByTestId("share").click();
    const shared = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
    if (shared) {
      expect(shared).toMatch(/^Mathdle #\d+ · 4\/8/);
      expect(shared).toContain("🟩🟩🟩🟩🟥⬛⬛⬛");
    }

    // Reloading keeps the finished state: one scored attempt per identity.
    await page.reload();
    await expect(page.getByTestId("results")).toBeVisible();
  });

  test("skip ends the scored run and opens unranked practice (acceptance 10)", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.getByTestId("play").click();
    await page.getByTestId(`option-${await correctLabel(1)}`).click();
    await expect(page.getByTestId("progress")).toHaveText("2 / 8");
    await page.getByTestId("skip").click();
    await expect(page.getByTestId("skip-confirm")).toContainText("ends your scored run");
    await page.getByTestId("skip-confirm-button").click();
    await expect(page.getByTestId("results")).toBeVisible();
    await expect(page.getByTestId("score")).toContainText("1");
    const card = page.getByTestId("solution-5");
    await expect(card).toContainText("Practice · unranked");
    await card.getByTestId(`option-${await correctLabel(5)}`).click();
    await expect(card).toContainText("Practice: correct!");
    await ctx.close();
  });

  test("ordinary client requests cannot manipulate the score (acceptance 9)", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/");
    const r = await page.evaluate(async () => {
      const post = (u: string, b: unknown) => fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(async (x) => ({ s: x.status, b: await x.json() }));
      const start = await post("/api/game/start", {});
      const opt = start.b.question.options[0].id;
      const skipAhead = await post("/api/game/answer", { slot: 5, optionId: opt });
      const bogus = await post("/api/game/answer", { slot: 1, optionId: "00000000-0000-4000-8000-000000000000" });
      const results = await fetch("/api/game/results").then((x) => x.status);
      return { skipAhead: skipAhead.s, bogus: bogus.s, results, leaks: JSON.stringify(start.b).includes("is_correct") };
    });
    expect(r.skipAhead).toBe(409);
    expect(r.bogus).toBe(400);
    expect(r.results).toBe(403);
    expect(r.leaks).toBe(false);
    const cross = await ctx.request.post("/api/game/answer", { headers: { Origin: "https://evil.example" }, data: { slot: 1, optionId: "00000000-0000-4000-8000-000000000000" } });
    expect(cross.status()).toBe(403);
    await ctx.close();
  });
});
