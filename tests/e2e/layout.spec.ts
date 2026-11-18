import { expect, test } from "@playwright/test";
import { correctLabel, wrongLabel } from "./db";

test("small phone (360×640): no horizontal overflow on landing, question and results (acceptance 13)", async ({ page }) => {
  const noOverflow = async () => {
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw).toBeLessThanOrEqual(cw + 1);
  };
  await page.goto("/");
  await noOverflow();
  await page.screenshot({ path: "screenshots/tmp/landing-360.png" });
  await page.getByTestId("play").click();
  await expect(page.getByTestId("question")).toBeVisible();
  await noOverflow();
  // Answer buttons are large touch targets.
  const box = await page.getByTestId("option-A").boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.getByTestId(`option-${await correctLabel(1)}`).click();
  await page.getByTestId(`option-${await correctLabel(2)}`).click();
  await expect(page.locator(".jxgbox svg").first()).toBeVisible();
  await noOverflow();
  // Secondary controls are real tap targets too.
  expect((await page.getByTestId("skip").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByTestId(`option-${await wrongLabel(3)}`).click();
  await expect(page.getByTestId("results")).toBeVisible();
  await noOverflow();
  const tall = async (loc: import("@playwright/test").Locator, what: string) => {
    const b = await loc.boundingBox();
    expect(b, what).not.toBeNull();
    expect(b!.height, what).toBeGreaterThanOrEqual(44);
  };
  await tall(page.getByTestId("share"), "share");
  await tall(page.getByRole("tab", { name: /solutions/i }), "solutions tab");
  await tall(page.getByRole("tab", { name: /leaderboard/i }), "leaderboard tab");
  await tall(page.getByTestId("edit-nickname"), "nickname edit");
  const practice = page.getByTestId("solution-8");
  await tall(practice.getByTestId("reveal"), "show answer");
  await tall(page.getByTestId("solution-1").locator("summary"), "solution disclosure");
  // KaTeX never pokes past the viewport.
  const widest = await page.evaluate(() => Math.max(...[...document.querySelectorAll(".katex")].map((k) => k.getBoundingClientRect().right)));
  expect(widest).toBeLessThanOrEqual(360 + 1);
});

test.describe("dark mode, reduced motion (360×640)", () => {
  test.use({ colorScheme: "dark", reducedMotion: "reduce" });
  test("no overflow in dark mode and no animation on answer feedback", async ({ page }) => {
    await page.goto("/");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe("rgb(244, 239, 228)"); // dark palette applied
    await page.getByTestId("play").click();
    await expect(page.getByTestId("question")).toBeVisible();
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw).toBeLessThanOrEqual(cw + 1);
    const opt = page.getByTestId(`option-${await correctLabel(1)}`);
    await opt.click();
    await expect(opt).toHaveAttribute("data-state", "correct");
    expect(await opt.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  });
});
