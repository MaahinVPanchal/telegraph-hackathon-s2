// Unit tests for the desk logic — mocked engine, no network.
//   npm test   (node --test test/)

import { test } from "node:test";
import assert from "node:assert/strict";
import { runDesk, verificationHash } from "../src/desk.mjs";
import { resolveCaps, INTENT_ASKS } from "../src/config.mjs";
import { makeMockAsk } from "../src/engine.mjs";

const fakeReceipt = (intent, cost = 0.01) => ({
  intent,
  mode: "mock",
  minerId: "1",
  minerName: "test-miner",
  costUsd: cost,
  durationMs: 5,
  signalHash: "0xabc",
  reasoning: null,
  result: {},
  timestamp: new Date().toISOString(),
});

test("caps: per-intent cap can never sum past the run cap", () => {
  const caps = resolveCaps({ maxUsdPerRun: 0.1, maxUsdPerIntent: 0.05 });
  assert.ok(caps.maxUsdPerIntent * INTENT_ASKS.length <= caps.maxUsdPerRun + 1e-9);
});

test("mock run produces a full memo with 5 receipts and a cost line", async () => {
  const { memo } = await runDesk("TESTTOKEN", { mode: "mock" });
  assert.equal(memo.receipts.length, 5);
  assert.equal(memo.failures.length, 0);
  assert.ok(memo.totalUsd <= 0.1);
  assert.match(memo.verificationHash, /^0x[0-9a-f]{64}$/);
  assert.ok(["GO", "REVIEW", "NO-GO"].includes(memo.verdict));
});

test("mock run is deterministic for the same token", async () => {
  const a = await runDesk("SAMETOKEN", { mode: "mock" });
  const b = await runDesk("SAMETOKEN", { mode: "mock" });
  assert.equal(a.memo.verificationHash, b.memo.verificationHash);
  assert.equal(a.memo.verdict, b.memo.verdict);
});

test("spending cap breach aborts the run", async () => {
  const askImpl = async (_base, { intent }) => {
    const r = fakeReceipt(intent, 0.5); // way over cap
    return r;
  };
  await assert.rejects(() => runDesk("TOKEN", { mode: "mock", askImpl }), /spending cap breach/);
});

test("partial failure still renders a memo with the failure recorded", async () => {
  const mock = makeMockAsk({ seed: "t" });
  const askImpl = async (base, args) => {
    if (args.intent === "CODE_REVIEW") throw new Error("upstream exploded");
    return mock(base, args);
  };
  const { memo, failures } = await runDesk("TOKEN", { mode: "mock", askImpl });
  assert.equal(memo.receipts.length, 4);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].intent, "CODE_REVIEW");
  assert.ok(memo.signals.some(([k]) => k === "warn"));
});

test("sanctions hit forces NO-GO even when everything else is clean", async () => {
  const mock = makeMockAsk({ seed: "t" });
  const askImpl = async (base, args) => {
    const r = await mock(base, args);
    if (args.intent === "SANCTIONS_SCREENING_MATCH") {
      r.result = { lists_checked: ["OFAC_SDN"], matches: ["0xdead"], clean: false };
    }
    return r;
  };
  const { memo } = await runDesk("TOKEN", { mode: "mock", askImpl });
  assert.equal(memo.verdict, "NO-GO");
  assert.equal(memo.hardBlock, true);
});

test("all-fail run throws with actionable guidance", async () => {
  const askImpl = async () => {
    const e = new Error("Engine HTTP 402: Payment Required");
    e.isPaymentRequired = true;
    throw e;
  };
  await assert.rejects(() => runDesk("TOKEN", { mode: "mock", askImpl }), /402|failed/);
});

test("verification hash is stable and order-independent", () => {
  const r1 = fakeReceipt("A"), r2 = fakeReceipt("B");
  const h1 = verificationHash("T", [r1, r2], []);
  const h2 = verificationHash("T", [r2, r1], []);
  assert.equal(h1, h2);
  const h3 = verificationHash("OTHER", [r1, r2], []);
  assert.notEqual(h1, h3);
});
