import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const root = process.cwd();
const port = "7790";
const wallet = "0x1111111111111111111111111111111111111111";
const server = spawn(process.execPath, ["src/serve.mjs"], { cwd: root, env: { ...process.env, PORT: port }, stdio: ["ignore", "pipe", "pipe"] });
let browser;
try {
  await new Promise((resolve, reject) => { server.stdout.once("data", resolve); server.once("error", reject); setTimeout(() => reject(new Error("local app server did not start")), 10000); });
  browser = await chromium.launch({ ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}), headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext();
  await context.addInitScript(({ wallet }) => {
    let chainId = "0xaa36a7";
    let accounts = [wallet];
    const listeners = new Map();
    window.__mockCalls = [];
    window.__mockListenerCount = () => listeners.size;
    window.__mockSetChain = (value) => { chainId = value; listeners.get("chainChanged")?.(value); };
    window.__mockSetAccounts = (value) => { accounts = value; listeners.get("accountsChanged")?.(value); };
    window.ethereum = {
      isMetaMask: true,
      on: (event, fn) => listeners.set(event, fn),
      removeListener: (event, fn) => { if (listeners.get(event) === fn) listeners.delete(event); },
      request: async ({ method, params }) => {
        window.__mockCalls.push(method);
        if (method === "eth_requestAccounts" || method === "eth_accounts") return accounts;
        if (method === "eth_chainId") return chainId;
        if (method === "eth_getBalance") return "0x8ac7230489e80000";
        if (method === "eth_call") return params[0].data.startsWith("0x70a08231") ? "0xf4240" : "0x0";
        if (method === "wallet_switchEthereumChain") {
          if (window.__mockSwitchError) throw Object.assign(new Error("mock switch rejection"), { code: window.__mockSwitchError });
          chainId = params[0].chainId;
          listeners.get("chainChanged")?.(chainId);
          return null;
        }
        if (method === "personal_sign" || method === "eth_sendTransaction") throw new Error("unexpected authorization in wallet lifecycle test");
        throw new Error(`Unexpected mock provider method: ${method}`);
      },
    };
  }, { wallet });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.pathname.startsWith("/api/ledger/account/")) return route.fulfill({ status: 200, json: { deposited: "30000", withdrawn: "0", charged: "0", credited: "0", unbilled: "0", balance: "30000", available: "30000", charge_limit: "0", charged_this_block: "0" } });
    return route.continue();
  });

  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}`);
  await page.evaluate(() => window.__mockSetChain("0x1"));
  await page.click("#wallet-connect");
  await page.waitForFunction(() => document.querySelector("#wallet-switch") && !document.querySelector("#wallet-switch").hidden);
  assert.match(await page.locator("#live-state").innerText(), /Connected, but on the wrong network \(chain 1\)/);
  assert.equal(await page.locator("#bal-eth").innerText(), "—");
  assert.equal(await page.locator("#bal-usdc").innerText(), "—");
  assert.equal(await page.locator("#run-live").isDisabled(), true);
  const beforeSwitch = await page.evaluate(() => window.__mockCalls.slice());
  await page.click("#wallet-switch");
  await page.waitForFunction(() => document.querySelector("#bal-eth").innerText.includes("ETH"));
  const switchCalls = await page.evaluate((before) => window.__mockCalls.slice(before.length), beforeSwitch);
  assert.deepEqual(switchCalls.filter((method) => method.startsWith("wallet_") || method === "eth_sendTransaction"), ["wallet_switchEthereumChain"]);
  assert.equal(await page.locator("#run-live").isDisabled(), false);

  await page.evaluate(() => { window.__mockSwitchError = 4001; window.__mockSetChain("0x1"); });
  await page.click("#wallet-switch");
  assert.match(await page.locator("#wallet-status").innerText(), /switch was rejected/i);
  await page.evaluate(() => { window.__mockSwitchError = 4902; });
  await page.click("#wallet-switch");
  assert.match(await page.locator("#wallet-status").innerText(), /does not know Ethereum Sepolia/i);
  await page.evaluate(() => { delete window.__mockSwitchError; window.__mockSetChain("0xaa36a7"); });
  await page.waitForFunction(() => document.querySelector("#run-live").disabled === false);

  const keys = ["leaderlight.live-attempts.v1", "leaderlight.live-assessment-intents.v1"];
  await page.evaluate((keys) => { localStorage.setItem(keys[0], JSON.stringify({ version: 1, attempts: {} })); localStorage.setItem(keys[1], "{}"); }, keys);
  const beforeDisconnect = await page.evaluate((keys) => keys.map((key) => localStorage.getItem(key)), keys);
  const callsBeforeDisconnect = await page.evaluate(() => window.__mockCalls.length);
  await page.click("#wallet-connect");
  await page.waitForFunction(() => !document.querySelector("#wallet-disconnect").hidden);
  await page.click("#wallet-disconnect");
  assert.equal(await page.evaluate(() => window.__listingsWallet), null);
  assert.equal(await page.evaluate(() => window.__listingsProvider), null);
  assert.equal(await page.evaluate(() => window.__mockListenerCount()), 0);
  assert.equal(await page.locator("#wallet-connect").innerText(), "Connect MetaMask");
  for (const id of ["#run-live", "#mint-usdc", "#fund-002", "#refresh-balances", "#new-assessment"]) assert.equal(await page.locator(id).isDisabled(), true, id);
  for (const id of ["#bal-eth", "#bal-usdc", "#bal-raw", "#bal-reserved", "#bal-spendable", "#bal-allowance"]) assert.equal(await page.locator(id).innerText(), "—", id);
  assert.deepEqual(await page.evaluate((keys) => keys.map((key) => localStorage.getItem(key)), keys), beforeDisconnect);
  assert.deepEqual(await page.evaluate((n) => window.__mockCalls.slice(n), callsBeforeDisconnect), []);

  await page.close();
  const eventPage = await context.newPage();
  await eventPage.goto(`http://127.0.0.1:${port}`);
  await eventPage.click("#wallet-connect");
  await eventPage.waitForFunction(() => document.querySelector("#bal-eth").innerText.includes("ETH"));
  const readsBefore = await eventPage.evaluate(() => window.__mockCalls.filter((method) => method === "eth_getBalance").length);
  await eventPage.evaluate(() => window.__mockSetChain("0x1"));
  await eventPage.waitForFunction(() => document.querySelector("#live-state").innerText.includes("chain 1"));
  await eventPage.evaluate(() => window.__mockSetChain("0xaa36a7"));
  await eventPage.waitForFunction(() => document.querySelector("#bal-eth").innerText.includes("ETH"));
  const readsAfter = await eventPage.evaluate(() => window.__mockCalls.filter((method) => method === "eth_getBalance").length);
  assert.ok(readsAfter > readsBefore, "chainChanged back to Sepolia refreshes the displayed balance");
  const secondWallet = "0x2222222222222222222222222222222222222222";
  await eventPage.evaluate((address) => window.__mockSetAccounts([address]), secondWallet);
  await eventPage.waitForFunction((address) => document.querySelector("#wallet-status").innerText.includes(address), secondWallet);
  assert.equal(await eventPage.evaluate(() => window.__listingsWallet.address), secondWallet);
  console.log("PASS (mocked browser): wrong-chain state hides balances and disables live controls; the click sends wallet_switchEthereumChain only; rejection is shown; disconnect leaves payment storage byte-identical and controls disabled; chainChanged refreshes balances. Provider is injected mock, not MetaMask or Sepolia.");
  await context.close();
} finally {
  await browser?.close();
  server.kill();
}
