import { expect, test, type Page, type Response } from "@playwright/test";
import { correctLabel, practiceCorrectLabel } from "./db";

type Served = { question: { attemptId: string; slot: number } | null };

const served = (page: Page, path: "start" | "next") =>
  page.waitForResponse((r: Response) => r.url().endsWith(`/api/practice/${path}`) && r.request().method() === "POST");

async function noOverflow(page: Page) {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw + 1);
}

test.describe("practice mode on a phone", () => {
  test("pick a topic, answer, see the solution, no repeats, pool runs out (AC1–AC5)", async ({ page }) => {
    await page.goto("/practice");
    // No daily run yet → defaults to slot 1.
    await expect(page.getByTestId("topic")).toHaveValue("1");
    await noOverflow(page);
    await page.screenshot({ path: "screenshots/practice-mode/picker-iphone13.png" });

    let wait = served(page, "start");
    await page.getByTestId("practice-start").click();
    let res = await wait;
    let body = (await res.json()) as Served;
    expect(JSON.stringify(body)).not.toMatch(/is_correct|solution|rationale|misconception/);
    expect(body.question?.slot).toBe(1);

    const seen = new Set<string>();
    // Answer the first one correctly, the rest wrongly; slot 1's pool has three unscheduled questions.
    for (let i = 0; body.question; i++) {
      expect(seen.has(body.question.attemptId)).toBe(false);
      seen.add(body.question.attemptId);
      await expect(page.getByTestId("practice-question")).toBeVisible();
      const right = await practiceCorrectLabel(body.question.attemptId);
      const label = i === 0 ? right : ["A", "B", "C", "D"].find((l) => l !== right)!;
      await page.getByTestId(`option-${label}`).click();
      await expect(page.getByTestId("practice-verdict")).toHaveText(i === 0 ? "Correct!" : `Not quite — the answer is ${right}.`);
      await expect(page.getByTestId("practice-stats")).toHaveText(`1 / ${i + 1} correct`);
      if (i === 1) {
        await expect(page.getByTestId("practice-solution")).toBeVisible();
        await noOverflow(page);
        await page.getByTestId("practice-reveal").scrollIntoViewIfNeeded();
        await page.waitForTimeout(800); // let the rise animation finish
        await page.screenshot({ path: "screenshots/practice-mode/reveal-iphone13.png" });
      }
      wait = served(page, "next");
      await page.getByTestId("practice-next").click();
      body = (await (await wait).json()) as Served;
    }
    expect(seen.size).toBe(3);
    await expect(page.getByTestId("practice-exhausted")).toBeVisible();

    // Another topic starts a new session.
    await page.getByTestId("practice-change").click();
    await page.getByTestId("topic").selectOption("2");
    wait = served(page, "start");
    await page.getByTestId("practice-start").click();
    res = await wait;
    expect(((await res.json()) as Served).question?.slot).toBe(2);
  });

  test("the default topic follows where today's run ended (AC1)", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("play").click();
    await page.getByTestId(`option-${await correctLabel(1)}`).click();
    await expect(page.getByTestId("progress")).toHaveText("2 / 8");
    await page.getByTestId("skip").click();
    await page.getByTestId("skip-confirm-button").click();
    await expect(page.getByTestId("results")).toBeVisible();
    await page.goto("/practice");
    await expect(page.getByTestId("topic")).toHaveValue("2");
  });

  test("another player's real session is invisible: 404 on next and answer (AC6)", async ({ browser, baseURL }) => {
    const headers = { Origin: baseURL! };
    const a = await browser.newContext();
    const b = await browser.newContext();
    // Each context's request client carries that context's own player cookie.
    const started = await a.request.post("/api/practice/start", { headers, data: { slot: 2 } });
    expect(started.status()).toBe(200);
    const { session, question } = await started.json();
    expect((await b.request.post("/api/practice/start", { headers, data: { slot: 1 } })).status()).toBe(200);
    const body = { sessionId: session.id, attemptId: question.attemptId, optionId: question.options[0].id };
    const next = await b.request.post("/api/practice/next", { headers, data: { sessionId: session.id } });
    const answer = await b.request.post("/api/practice/answer", { headers, data: body });
    expect([next.status(), answer.status()]).toEqual([404, 404]);
    expect(await answer.text()).not.toContain("solution");
    // A's attempt was not consumed by B: A can still answer it.
    expect((await a.request.post("/api/practice/answer", { headers, data: body })).status()).toBe(200);
    await a.close();
    await b.close();
  });

  test("API rejects cross-origin posts and nonexistent sessions (AC6, AC7)", async ({ page, context }) => {
    await page.goto("/practice");
    const cross = await context.request.post("/api/practice/start", { headers: { Origin: "https://evil.example" }, data: { slot: 1 } });
    expect(cross.status()).toBe(403);
    const r = await page.evaluate(async () => {
      const post = (u: string, b: unknown) =>
        fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(async (x) => ({ s: x.status, b: await x.json() }));
      const start = await post("/api/practice/start", { slot: 2 });
      const q = start.b.question;
      const bogus = await post("/api/practice/answer", { sessionId: start.b.session.id, attemptId: q.attemptId, optionId: "00000000-0000-4000-8000-000000000000" });
      const missing = await post("/api/practice/next", { sessionId: "00000000-0000-4000-8000-000000000000" });
      const ok = await post("/api/practice/answer", { sessionId: start.b.session.id, attemptId: q.attemptId, optionId: q.options[0].id });
      const twice = await post("/api/practice/answer", { sessionId: start.b.session.id, attemptId: q.attemptId, optionId: q.options[1].id });
      return { bogus: bogus.s, missing: missing.s, ok: ok.s, revealed: typeof ok.b.solution === "string", twice: twice.s };
    });
    expect(r).toEqual({ bogus: 400, missing: 404, ok: 200, revealed: true, twice: 409 });
  });

  test("360px phone: no horizontal overflow (AC8)", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto("/practice");
    await noOverflow(page);
    await page.getByTestId("topic").selectOption("2");
    await page.getByTestId("practice-start").click();
    await expect(page.getByTestId("practice-question")).toBeVisible();
    await noOverflow(page);
    const box = await page.getByTestId("option-A").boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await page.getByTestId("option-A").click();
    await expect(page.getByTestId("practice-reveal")).toBeVisible();
    await noOverflow(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: "screenshots/practice-mode/reveal-360.png", fullPage: true });
    await ctx.close();
  });
});
