import { expect, test } from "@playwright/test";

test("landing shows chat and requires login to send", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Binance Agent OS" })).toBeVisible();
  const input = page.locator("#chat-input");
  await expect(input).toBeVisible();
  await input.fill("研究一下 BTCUSDT");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByRole("heading", { name: /注册|登录/ })).toBeVisible();
  await expect(page.getByLabel("用户名")).toBeVisible();
  await expect(page.getByLabel("密码")).toBeVisible();
  await expect(page.getByText(/不提供忘记密码/)).toBeVisible();
});

test("mobile uses conversation and research tabs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "对话" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "研究" })).toBeVisible();
  await page.getByRole("tab", { name: "研究" }).click();
  await expect(page.getByRole("heading", { name: "研究画布" })).toBeVisible();
  await page.getByRole("tab", { name: "对话" }).click();
  await expect(page.locator("#chat-input")).toBeVisible();
});
