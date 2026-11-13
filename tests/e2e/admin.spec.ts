import { expect, test, type Page } from "@playwright/test";
import { db } from "./db";

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.fill("input[name=email]", "e2e@mathdle.test");
  await page.fill("input[name=password]", "e2e-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin");
}

test("admin pages and APIs require sign-in (acceptance 15)", async ({ page, request }) => {
  await page.goto("/admin/review");
  await expect(page).toHaveURL(/\/admin\/login/);
  const r = await request.post("/api/admin/buckets/1/generate", { headers: { Origin: "http://localhost:3100" }, data: { count: 1, provider: "procedural" } });
  expect(r.status()).toBe(401);
  const bad = await request.post("/api/admin/login", { headers: { Origin: "http://localhost:3100" }, data: { email: "e2e@mathdle.test", password: "wrong" } });
  expect(bad.status()).toBe(401);
});

test("keyboard calibration: ↑ ↓ X Esc Enter ← U behave exactly as specified (acceptance 2, 3)", async ({ page }) => {
  await login(page);
  await page.goto("/admin/review?slot=1");
  const card = page.getByTestId("review-card");
  const pending = page.getByTestId("pending-judgment");
  const pos = page.getByTestId("review-position");
  await expect(card).toBeVisible();
  const total = Number((await pos.innerText()).split("/")[1]);
  const id = async () => (await card.getAttribute("data-question-id"))!;
  const feedbackRows = async () => (await db`select question_id, judgment from question_feedback order by created_at`) as unknown as { question_id: string; judgment: string }[];
  const before = (await feedbackRows()).length;

  // Up = too hard, Esc clears, Down = too easy — nothing saved yet.
  await page.keyboard.press("ArrowUp");
  await expect(pending).toContainText("Too hard");
  await page.keyboard.press("Escape");
  await expect(pending).toContainText("Just right (default)");
  await page.keyboard.press("ArrowDown");
  await expect(pending).toContainText("Too easy");
  expect((await feedbackRows()).length).toBe(before);
  await page.screenshot({ path: "screenshots/tmp/admin-review.png" });

  // Enter saves and advances.
  const q1 = await id();
  await page.keyboard.press("Enter");
  await expect(pos).toHaveText(`2 / ${total}`);
  // Right arrow with no judgment records "just right".
  const q2 = await id();
  await page.keyboard.press("ArrowRight");
  await expect(pos).toHaveText(`3 / ${total}`);
  // X = invalid.
  const q3 = await id();
  await page.keyboard.press("x");
  await expect(pending).toContainText("Invalid");
  await page.keyboard.press("Enter");
  await expect(pos).toHaveText(`4 / ${total}`);

  // Typing in the note box must not trigger shortcuts.
  await page.getByTestId("note").click();
  await page.keyboard.type("x");
  await page.keyboard.press("ArrowUp");
  await expect(pending).toContainText("Just right (default)");
  await page.keyboard.press("Escape"); // leaves the textarea
  await page.keyboard.press("ArrowUp");
  await expect(pending).toContainText("Too hard");
  const q4 = await id();
  await page.keyboard.press("Enter");
  await expect(pos).toHaveText(`5 / ${total}`);

  let rows = (await feedbackRows()).slice(before);
  expect(rows.map((r) => [r.question_id, r.judgment])).toEqual([
    [q1, "too_easy"],
    [q2, "just_right"],
    [q3, "invalid"],
    [q4, "too_hard"],
  ]);
  const [{ note }] = await db`select note from question_feedback where question_id = ${q4}`;
  expect(note).toBe("x");

  // Left goes back without recording; the saved judgment is shown.
  await page.keyboard.press("ArrowLeft");
  await expect(pos).toHaveText(`4 / ${total}`);
  await expect(pending).toContainText("Too hard");
  expect((await feedbackRows()).length).toBe(before + 4);

  // U undoes the last saved judgment (appends a retraction; originals are kept).
  await page.keyboard.press("u");
  await expect(pending).toContainText("Just right (default)");
  rows = (await feedbackRows()).slice(before);
  expect(rows.at(-1)).toMatchObject({ question_id: q4, judgment: "retracted" });
  expect(rows).toHaveLength(5);

  // Persisted across sessions: reload shows the saved judgment.
  await page.goto("/admin/review?slot=1&all=1");
  await expect(page.getByTestId("review-card")).toBeVisible();
  const [{ status }] = await db`select status from questions where id = ${q3}`;
  expect(status).toBe("rejected");
});

test("compose, preview and audit pages render (acceptance 17)", async ({ page }) => {
  await login(page);
  await page.goto("/admin");
  await expect(page.getByTestId("bucket-table")).toBeVisible();
  await page.screenshot({ path: "screenshots/tmp/admin-dashboard.png", fullPage: true });
  await page.goto("/admin/composer");
  await expect(page.getByTestId("composer-days")).toContainText("published");
  await page.goto("/admin/audit");
  await expect(page.getByTestId("audit")).toContainText("approve_challenge");
});
