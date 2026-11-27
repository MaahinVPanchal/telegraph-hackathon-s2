// Tests for the offline preview rework (Instinct's spec, Parts A–D):
// static fixture scenarios run through the real assess() path, honest
// labeling, zero network access, and /memo scenario validation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderHtml } from "../src/memo.mjs";
import memoHandler from "../api/memo.js";
import {
  DEFAULT_PREVIEW_SCENARIO,
  PREVIEW_SCENARIOS,
  PREVIEW_FIXTURES,
  parsePreviewScenario,
  runPreviewMemo,
} from "../src/preview-scenarios.mjs";

function httpResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    end(body = "") { this.body = String(body); return this; },
  };
}

const EXPECTED_VERDICTS = { 1: "UNKNOWN", 2: "REVIEW", 3: "REVIEW", 4: "REVIEW", 5: "NO-GO" };

test("preview scenarios produce the specified verdicts through the real assess path", async () => {
  for (const scenario of PREVIEW_SCENARIOS) {
    const { memo } = await runPreviewMemo(scenario.id, "PREVIEW");
    assert.equal(memo.verdict, EXPECTED_VERDICTS[scenario.id], `scenario ${scenario.id} verdict`);
    assert.equal(memo.preview, true, `scenario ${scenario.id} must be stamped as preview`);
    assert.equal(memo.mode, "mock", `scenario ${scenario.id} must use the simulated presentation`);
    assert.match(memo.modeLabel, /SIMULATED\/OFFLINE/);
    assert.notEqual(memo.verdict, "GO", `scenario ${scenario.id} must never produce GO`);
    assert.equal(memo.actualSpentUsd, "$0", `scenario ${scenario.id} must spend nothing`);
  }
});

test("preview evidenceCompleteness matches each scenario's fixture shape", async () => {
  const first = await runPreviewMemo(1, "PREVIEW");
  assert.deepEqual(first.memo.evidenceCompleteness.validChecks, []);
  assert.equal(first.memo.evidenceCompleteness.missingChecks.length, 5);
  assert.equal(first.memo.evidenceCompleteness.unsupportedChecks.length, 3);

  const second = await runPreviewMemo(2, "PREVIEW");
  assert.deepEqual(second.memo.evidenceCompleteness.validChecks,
    ["SANCTIONS_SCREENING_MATCH", "SOCIAL_BOT_DETECTION"]);
  assert.deepEqual(second.memo.evidenceCompleteness.unsupportedChecks,
    ["SMART_CONTRACT_AUDIT", "ONCHAIN_METRIC_VERIFY", "CODE_REVIEW"]);
  assert.equal(second.memo.failures.length, 0, "by-design skips must not leak into failures");

  const third = await runPreviewMemo(3, "PREVIEW");
  assert.deepEqual(third.memo.evidenceCompleteness.unavailableChecks, ["SANCTIONS_SCREENING_MATCH"]);
  assert.equal(third.memo.evidence.SANCTIONS_SCREENING_MATCH.status, "unavailable");

  const fourth = await runPreviewMemo(4, "PREVIEW");
  assert.ok(fourth.memo.signals.some(([kind, text]) =>
    kind === "bad" && /bot score .*0\.25.*above threshold/i.test(text)),
  "scenario 4 must flag the bot score above the app threshold");
  assert.ok(fourth.memo.evidence.SOCIAL_BOT_DETECTION.results?.some((result) =>
    result.bot_score === 0.4 && result.account === "@sample_bot"));

  const fifth = await runPreviewMemo(5, "PREVIEW");
  assert.deepEqual(fifth.memo.evidenceCompleteness.validChecks, ["SANCTIONS_SCREENING_MATCH"]);
});

test("the preview path never touches the network (fetch is blocked)", async () => {
  const originalFetch = globalThis.fetch;
  const blockedUrls = [];
  globalThis.fetch = (...args) => {
    blockedUrls.push(String(args[0]));
    throw new Error("NETWORK CALL BLOCKED IN PREVIEW");
  };
  try {
    for (const scenario of PREVIEW_SCENARIOS) {
      const { memo } = await runPreviewMemo(scenario.id, "PREVIEW");
      assert.equal(memo.verdict, EXPECTED_VERDICTS[scenario.id]);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(blockedUrls, []);
});

test("scenario 5 hard-blocks on a confirmed sanctions match", async () => {
  const { memo, receipts } = await runPreviewMemo(5, "PREVIEW");
  assert.equal(memo.verdict, "NO-GO");
  assert.equal(memo.hardBlock, true);
  assert.ok(memo.signals.some(([kind, text]) =>
    kind === "bad" && /confirmed sanctions match/i.test(text)));
  assert.ok(receipts.some((receipt) =>
    receipt.result?.matched === true && receipt.result?.name === "Sample Sanctioned Entity"));
  assert.equal(memo.evidence.SANCTIONS_SCREENING_MATCH.status, "valid");
});

test("rendered preview memo carries the fixture banner and zero-spend labels", async () => {
  const { memo } = await runPreviewMemo(2, "PREVIEW");
  const html = renderHtml(memo);
  assert.match(html, /Preview with fixture data\. Not real evidence\./);
  assert.match(html, /SIMULATED\/OFFLINE/);
  assert.match(html, /Actually spent: \$0 USD/);
  assert.match(html, /preview scenario 2: Clean explicit identities/);
  // Part C walkthrough: staged Input → Request → Answer → Validation → Verdict.
  for (const stage of ["Input", "Request", "Answer", "Validation", "Verdict"]) {
    assert.match(html, new RegExp(`<dt>${stage}</dt>`));
  }
  assert.match(html, /not sent: unsupported by current contracts/);
  assert.match(html, /sent \(fixture\)/);
});

test("workspace presets stay in sync with the server-side fixture identities", () => {
  const html = readFileSync(new URL("../public/leaderlight-live.html", import.meta.url), "utf8");
  for (const subject of [
    PREVIEW_FIXTURES.ordinary.deployerName,
    PREVIEW_FIXTURES.ordinary.treasuryName,
    PREVIEW_FIXTURES.ordinary.socialAccount,
    PREVIEW_FIXTURES.ordinary.repositoryUrl,
    PREVIEW_FIXTURES.sanctioned.deployerName,
    PREVIEW_FIXTURES.botSocialAccount,
  ]) {
    assert.ok(html.includes(subject), `preset fixture identity missing from workspace HTML: ${subject}`);
  }
  assert.match(html, /id="preview-scenario"/);
  assert.match(html, /Preview the memo format/);
  assert.match(html, /GO needs audit, on-chain and code-review evidence, which current Telegraph contracts do not support yet\./);
  assert.doesNotMatch(html, /Run offline demo/);
});

test("parsePreviewScenario: missing falls back to 1, non-1..5 input rejected", async () => {
  assert.equal(parsePreviewScenario(null), DEFAULT_PREVIEW_SCENARIO);
  assert.equal(parsePreviewScenario(undefined), DEFAULT_PREVIEW_SCENARIO);
  assert.equal(parsePreviewScenario(""), DEFAULT_PREVIEW_SCENARIO);
  assert.equal(parsePreviewScenario("  "), DEFAULT_PREVIEW_SCENARIO);
  assert.equal(parsePreviewScenario("3"), 3);
  for (const bad of ["0", "6", "-1", "1.5", "abc", "03", "1e2", "<script>"]) {
    assert.equal(parsePreviewScenario(bad), null, `expected rejection for ${JSON.stringify(bad)}`);
  }
  // runPreviewMemo rejects unknown ids so a route bug can never render one.
  await assert.rejects(runPreviewMemo(7, "PREVIEW"), /unknown preview scenario/);
});

test("/memo handler: bad scenario is a 400, token-only request still works unchanged", async () => {
  for (const bad of ["0", "6", "abc", "1.5"]) {
    const response = httpResponse();
    await memoHandler({ method: "GET", url: `/memo?token=DEMO&scenario=${encodeURIComponent(bad)}`, headers: { host: "localhost" } }, response);
    assert.equal(response.statusCode, 400, `scenario=${JSON.stringify(bad)} must be a 400`);
    assert.match(response.body, /scenario must be an integer from 1 to 5/);
  }
  // An empty scenario value counts as missing and falls back to the default.
  const emptyScenario = httpResponse();
  await memoHandler({ method: "GET", url: "/memo?token=DEMO&scenario=", headers: { host: "localhost" } }, emptyScenario);
  assert.equal(emptyScenario.statusCode, 200);
  assert.match(emptyScenario.body, /UNKNOWN/);

  // Old token-only /memo contract: 200, full styled document, honest labels.
  const memo = httpResponse();
  await memoHandler({ method: "GET", url: "/memo?token=DEMO", headers: { host: "localhost" } }, memo);
  assert.equal(memo.statusCode, 200);
  assert.match(memo.body, /^<!doctype html>/i);
  assert.match(memo.body, /--ld-page:/);
  assert.match(memo.body, /<style/);
  assert.match(memo.body, /SIMULATED\/OFFLINE/);
  assert.match(memo.body, /Actually spent: \$0 USD/);
  assert.match(memo.body, /Preview with fixture data\. Not real evidence\./);
  assert.match(memo.body, /UNKNOWN/);

  // An explicit valid scenario renders that scenario's verdict.
  const blocked = httpResponse();
  await memoHandler({ method: "GET", url: "/memo?token=DEMO&scenario=5", headers: { host: "localhost" } }, blocked);
  assert.equal(blocked.statusCode, 200);
  assert.match(blocked.body, /NO-GO/);
  assert.match(blocked.body, /Hard block:<\/strong> confirmed sanctions match\./);
});
