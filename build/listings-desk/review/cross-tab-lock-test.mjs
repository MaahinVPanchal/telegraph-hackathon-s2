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
        await new Promise((resolve) => setTimeout(resolve, 300));
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
    await page.fill("#deployer-name", "Same mock entity");
    await page.fill("#treasury-name", "Same mock entity");
  }
  await Promise.all(pages.map((page) => page.evaluate(() => document.querySelector("#run-live").click())));
  await Promise.all(pages.map((page) => page.waitForFunction(() => document.querySelector("#out").getAttribute("aria-busy") === "false")));
  assert.equal(await pages[0].evaluate(() => localStorage.getItem("mock-cross-tab-sign-count")), "1");
  assert.equal(paidResponses, 1);

  await pages[0].click("#new-assessment");
  await pages[0].waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem("leaderlight.live-assessment-intents.v1") || "{}")).length >= 1);
  await pages[0].click("#run-live");
  await pages[0].waitForFunction(() => document.querySelector("#out").getAttribute("aria-busy") === "false");
  assert.equal(await pages[0].evaluate(() => localStorage.getItem("mock-cross-tab-sign-count")), "2");
  assert.equal(paidResponses, 2);
  console.log("PASS (mocked browser): two tabs shared localStorage and navigator.locks; overlapping Run clicks caused 1 personal_sign; New assessment allowed exactly one deliberate repeat (2 total). Provider was injected mock, not MetaMask; Engine responses were local fixtures, not Sepolia.");
  await context.close();
} finally {
  await browser?.close();
  server.kill();
}
