/// <reference types="node" />
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const pagesBasePath = process.env.PAGES_BASE_PATH ?? "/speed-reader/";
const fixturePath = path.resolve("tests/fixtures/minimal.epub");

async function expectAlignedFocusWord(page: Page) {
  const alignment = await page.evaluate(() => {
    const pivot = document.querySelector<HTMLElement>('[data-testid="active-pivot"], [data-testid="reader-pivot"]');
    const rail = document.querySelector<HTMLElement>('[data-testid="reader-rail"]');
    const scrollingElement = document.scrollingElement;
    if (!pivot || !rail || !scrollingElement) throw new Error("Reader alignment elements are missing");
    const pivotRect = pivot.getBoundingClientRect();
    const railRect = rail.getBoundingClientRect();
    return {
      delta: Math.abs((pivotRect.left + pivotRect.width / 2) - (railRect.left + railRect.width / 2)),
      scrollWidth: scrollingElement.scrollWidth,
      clientWidth: scrollingElement.clientWidth,
    };
  });
  expect(alignment.delta).toBeLessThanOrEqual(1);
  expect(alignment.scrollWidth).toBeLessThanOrEqual(alignment.clientWidth);
}

test("serves base-aware assets and imports an EPUB through the reader surface", async ({ page, request }) => {
  const baseResponse = await request.get(pagesBasePath);
  expect(baseResponse.status()).toBe(200);
  const html = await baseResponse.text();
  expect(html).toContain('<div id="root"></div>');

  await page.goto(pagesBasePath);
  const assets = await page.locator('script[src], link[rel="stylesheet"][href]').evaluateAll((elements) => elements.map((element) => ({
    url: element.getAttribute("src") ?? element.getAttribute("href"),
    kind: element.tagName.toLowerCase() === "script" ? "javascript" : "css",
  })));
  expect(assets.length).toBeGreaterThan(0);
  for (const asset of assets) {
    expect(asset.url).toBeTruthy();
    const assetUrl = new URL(asset.url!, page.url());
    expect(assetUrl.pathname.startsWith(pagesBasePath), `${asset.url} should carry ${pagesBasePath}`).toBe(true);
    const response = await request.get(assetUrl.toString());
    expect(response.status(), `${asset.url} should be present`).toBe(200);
    expect(response.headers()["content-type"] ?? "", `${asset.url} should not fall back to HTML`).toMatch(
      asset.kind === "javascript" ? /(?:java|ecma)script/i : /text\/css/i,
    );
  }

  await page.goto(`${pagesBasePath}#/`);
  await expect(page.getByRole("heading", { name: "Bring something to read" })).toBeVisible();
  await page.getByLabel("EPUB file").setInputFiles(fixturePath);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByTestId("reader-active-word")).toHaveText("alpha");
  await expect(page.getByTestId("reader-pivot")).toHaveText("p");
  await expectAlignedFocusWord(page);

  const samples = ["short", "uneven", "supercalifragilisticexpialidocious"].map((text) => ({ text, expected: text }));
  for (const sample of samples) {
    await page.goto(`${pagesBasePath}#/`);
    await page.getByLabel("Paste text").fill(sample.text);
    await page.getByRole("button", { name: "Import pasted text" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByTestId("reader-active-word")).toHaveText(sample.expected);
    await expectAlignedFocusWord(page);
  }
});
