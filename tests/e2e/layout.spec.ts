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
  await page.getByTestId(`option-${await wrongLabel(3)}`).click();
  await expect(page.getByTestId("results")).toBeVisible();
  await noOverflow();
});
