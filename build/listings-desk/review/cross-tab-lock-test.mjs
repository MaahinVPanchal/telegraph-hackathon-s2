import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const root = process.cwd();
const port = "7789";
const wallet = "0x1111111111111111111111111111111111111111";
const diamond = "0x3624eb012b5e998bb57b6be6c9cfc9c4bc5eb99b";
const intent = "SANCTIONS_SCREENING_MATCH_GENERAL";
const server = spawn(process.execPath, ["src/serve.mjs"], { cwd: root, env: { ...process.env, PORT: port }, stdio: ["ignore", "pipe", "pipe"] });
let browser;
try {
  await new Promise((resolve, reject) => { server.stdout.once("data", resolve); server.once("error", reject); setTimeout(() => reject(new Error("local app server did not start")), 10000); });
  browser = await chromium.launch({ ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}), headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext();
  let paidResponses = 0;
  await context.addInitScript(({ wallet }) => {
    const handlers = {};
    window.ethereum = { isMetaMask: true, on: (name, fn) => { handlers[name] = fn; }, request: async ({ method }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [wallet];
      if (method === "eth_chainId") return "0xaa36a7";
      if (method === "personal_sign") {
        const n = Number(localStorage.getItem("mock-cross-tab-sign-count") || 0) + 1;
        localStorage.setItem("mock-cross-tab-sign-count", String(n));
        window.__mockDidSign = true;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return "0xdead";
      }
      throw new Error(`Unexpected mock provider method: ${method}`);
    } };
  }, { wallet });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.pathname !== "/api/engine/v1/ask") return route.continue();
    const req = route.request().postDataJSON();
    if (!route.request().headers()["x-payment"]) {
      return route.fulfill({ status: 402, json: { accepts: [{ scheme: "escrow", network: "eip155:11155111", payTo: diamond, extra: {
        resource: "/v1/ask", signWith: "personal_sign (EIP-191)",
        message: ["Telegraph Escrow Payment", "Wallet: {from}", `Pay To: ${diamond}`, "Network: eip155:11155111", "Amount: 10000 uUSDC", "Resource: /v1/ask", "Nonce: {nonce}", "Valid After: {validAfter}", "Valid Before: {validBefore}"].join("\n"),
      } }] } });
    }
    paidResponses++;
    const receipt = { receipt_hash: `0x${"a".repeat(64)}`, rail: "escrow", payer: wallet, miner: "377", intent, amount_uusdc: "10000", epoch_id: 314, settlement: "epoch", chain: "telegraph", timestamp: 1789466181 };
    return route.fulfill({ status: 200, headers: { "x-payment-response": Buffer.from(JSON.stringify(receipt)).toString("base64") }, json: { intent: req.intent, input: req.params, miner_id: "377", result: { matched: false }, cost_usd: 0.01 } });
  });
  const pages = [await context.newPage(), await context.newPage()];
  for (const page of pages) {
    await page.goto(`http://127.0.0.1:${port}`);
    await page.click("#wallet-connect");
    await page.waitForFunction(() => !document.querySelector("#run-live").disabled);
    await page.fill("#deployer-name", "Mock Deployer Ltd");
    await page.fill("#treasury-name", "Mock Treasury Inc");
  }
  await Promise.all(pages.map((page) => page.evaluate(() => document.querySelector("#run-live").click())));
  await Promise.all(pages.map((page) => page.waitForFunction(() => document.querySelector("#out").getAttribute("aria-busy") === "false")));
  const firstRaceOutput = await Promise.all(pages.map((page) => page.locator("#out").innerText()));
  assert.equal(firstRaceOutput.filter((text) => text.includes("This tab did not request a signature")).length, 1);
  assert.equal(await pages[0].evaluate(() => localStorage.getItem("mock-cross-tab-sign-count")), "2");
  assert.equal(paidResponses, 2);

  const winner = pages[firstRaceOutput[0].includes("This tab did not request a signature") ? 1 : 0];
  const signsBeforePlainRetry = Number(await winner.evaluate(() => localStorage.getItem("mock-cross-tab-sign-count")));
  await winner.click("#run-live");
  await winner.waitForFunction(() => document.querySelector("#out").getAttribute("aria-busy") === "false");
  assert.match(await winner.locator("#out").innerText(), /This tab did not request a signature/);
  assert.equal(Number(await winner.evaluate(() => localStorage.getItem("mock-cross-tab-sign-count"))), signsBeforePlainRetry);

  await winner.click("#new-assessment");
  await winner.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem("leaderlight.live-assessment-intents.v1") || "{}")).length >= 2);
  await winner.click("#run-live");
  await winner.waitForFunction(() => document.querySelector("#out").getAttribute("aria-busy") === "false");
  assert.equal(await winner.evaluate(() => localStorage.getItem("mock-cross-tab-sign-count")), "4");
  assert.equal(paidResponses, 4);

  await winner.fill("#deployer-name", "Identical Mock Entity");
  await winner.fill("#treasury-name", "Identical Mock Entity");
  await winner.click("#run-live");
  await winner.waitForFunction(() => document.querySelector("#out").getAttribute("aria-busy") === "false");
  assert.equal(await winner.evaluate(() => localStorage.getItem("mock-cross-tab-sign-count")), "5");
  assert.match(await winner.locator("#out").innerText(), /checked once and charged once/);

  const quotaPage = await context.newPage();
  await quotaPage.goto(`http://127.0.0.1:${port}`);
  await quotaPage.click("#wallet-connect");
  await quotaPage.waitForFunction(() => !document.querySelector("#run-live").disabled);
  await quotaPage.fill("#deployer-name", "Quota Mock Deployer");
  await quotaPage.fill("#treasury-name", "Quota Mock Treasury");
  await quotaPage.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "leaderlight.live-attempts.v1" && window.__mockDidSign) {
        throw new DOMException("QuotaExceededError", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  });
  await quotaPage.click("#run-live");
  await quotaPage.waitForFunction(() => document.querySelector("#out").getAttribute("aria-busy") === "false");
  const quotaText = await quotaPage.locator("#out").innerText();
  assert.match(quotaText, /may have authorized this payment/i);
  assert.match(quotaText, /No payment history was cleared/i);
  assert.match(quotaText, /do not clear these records/i);
  console.log("PASS (mocked browser): two same-wallet tabs with two distinct names permit one assessment's two signatures; the losing tab reports that it did not sign; plain retry is blocked; New assessment allows one deliberate repeat; identical names charge once; simulated post-sign quota failure warns reconciliation is needed and history was not cleared. Provider is mock, not MetaMask; Engine responses are local, not Sepolia.");
  await context.close();
} finally {
  await browser?.close();
  server.kill();
}
