import { expect, test } from "@playwright/test";

test("evidence review gates capture and allows share after capture", async ({ page, request }) => {
  const discoveries = await request.get("/api/v1/discoveries?status=suggested");
  const discoveryList = await discoveries.json();
  const target = discoveryList.find((item: { summary: { reviewed_evidence_count: number } }) => item.summary.reviewed_evidence_count === 0);

  await page.goto("/app");
  await expect(page.locator("#evidence-list .card").first()).toBeVisible();

  await page.locator(`[data-discovery-id="${target.id}"]`).click();
  await page.locator("#capture-form button[type='submit']").click();
  await expect(page.locator("#capture-status")).toContainText("Capture blocked");

  await page.locator(`[data-evidence-id="${target.evidence[0].id}"]`).click();
  await page.locator("#mark-reviewed").click();
  await expect(page.locator("#evidence-detail")).toContainText("Yes");

  await page.locator(`[data-discovery-id="${target.id}"]`).click();
  await page.locator("#capture-form textarea").fill("E2E validated capture.");
  await page.locator("#capture-form button[type='submit']").click();
  await expect(page.locator("#capture-status")).toContainText("Captured at");

  await page.locator("#share-capture").click();
  await expect(page.locator("#capture-status")).toContainText("Share token:");
});

test("extraction review updates evidence and discovery framing", async ({ page }) => {
  await page.goto("/app");
  await page.locator("#evidence-list .card").first().click();
  await expect(page.locator("#evidence-detail .extraction-card").first()).toBeVisible();

  const firstExtraction = page.locator("#evidence-detail .extraction-card").first();
  await firstExtraction.locator("textarea").fill("Playwright review.");
  await firstExtraction.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(firstExtraction).toContainText("reviewed thesis");

  await page.locator("#discovery-list .card").first().click();
  await expect(page.locator("#capture-workspace")).toContainText(/reviewed thesis|detector hit/);
  await expect(page.locator("#capture-workspace")).toContainText("review ratio");
  await page.locator("#thesis-form textarea[name='thesis_statement']").fill("Playwright reviewed thesis about downside transfer.");
  await page.locator("#thesis-form button[type='submit']").click();
  await expect(page.locator("#capture-workspace")).toContainText("Playwright reviewed thesis about downside transfer.");
  await expect(page.locator("#entity-profile")).toContainText("Analyst ledger");
});

test("evidence ingest updates the inbox", async ({ page }) => {
  await page.goto("/app");
  await expect(page.locator("#evidence-list .card").first()).toBeVisible();

  await page.locator("#ingest-form input[name='title']").fill("Playwright evidence");
  await page.locator("#ingest-form input[name='publisher']").fill("QA Harness");
  await page.locator("#ingest-form input[name='url']").fill("https://example.org/playwright-evidence");
  await page.locator("#ingest-form button[type='submit']").click();

  await expect(page.locator("#ingest-status")).toContainText(/Evidence created|Duplicate detected/);
  await expect(page.locator("#evidence-list")).toContainText("Playwright evidence");
});
