const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;
const UINT_PATTERN = /^(0|[1-9]\d*)$/;
const STORAGE_KEY = "leaderlight.live-attempts.v1";
const INTENT_KEY = "leaderlight.live-assessment-intents.v1";
const LEDGER_VERSION = 1;
const LIVE_CHAIN_ID = "0xaa36a7";
const RUN_CAP_MICRO = 20_000n;
const CALL_CAP_MICRO = 10_000n;
const FUNDING_AMOUNT_MICRO = 3_000_000n;
const DEPOSIT_SELECTOR = "0xf688bcfb";

// Selectors for contracts
const ERC20_ALLOWANCE_SELECTOR = "0xdd62ed3e";
const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
const ERC20_BALANCE_OF_SELECTOR = "0x70a08231";
const ESCROW_BALANCE_SELECTOR = "0x55af6353";
const ESCROW_EFFECTIVE_BALANCE_SELECTOR = "0x16a398f7";
const ESCROW_AGENT_DEBT_SELECTOR = "0xdb9104c6";
const ESCROW_PENDING_WITHDRAWAL_SELECTOR = "0x0964c95b";

function assertAddress(value, label) {
  if (typeof value !== "string" || !ADDRESS_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a valid Ethereum address`);
  }
  return value.toLowerCase();
}

function abiWord(type, value) {
  if (type === "address") return assertAddress(value, "ABI address").slice(2).padStart(64, "0");
  if (type !== "uint256") throw new TypeError(`unsupported ABI parameter type: ${type}`);
  const integer = typeof value === "bigint" ? value : BigInt(value);
  if (integer < 0n || integer >= 1n << 256n) throw new RangeError("ABI uint256 is out of range");
  return integer.toString(16).padStart(64, "0");
}

export function encodeFunctionCall(selector, types, values) {
  if (!/^0x[0-9a-f]{8}$/i.test(selector) || !Array.isArray(types) ||
      !Array.isArray(values) || types.length !== values.length) {
    throw new TypeError("function selector and ABI arguments are invalid");
  }
  return selector.toLowerCase() + types.map((type, index) => abiWord(type, values[index])).join("");
}

export function parseMicroUsdc(value, label = "amount_uusdc") {
  if (typeof value !== "string" || !UINT_PATTERN.test(value)) {
    throw new TypeError(`${label} must be an unsigned integer micro-USDC string`);
  }
  return BigInt(value);
}

function exactlyOneLine(message, name) {
  const lines = message.split(/\r?\n/).filter((line) => line.startsWith(`${name}:`));
  if (lines.length !== 1) throw new TypeError(`challenge must contain exactly one ${name} line`);
  return lines[0].slice(name.length + 1).trim();
}

export function validateEscrowChallenge(challenge, {
  wallet,
  network,
  payTo,
  origin,
  resource,
  requestUrl,
  runReservedMicro = 0n,
} = {}) {
  const payer = assertAddress(wallet, "connected wallet");
  const trustedPayTo = assertAddress(payTo, "trusted payee");
  if (typeof network !== "string" || !/^eip155:\d+$/.test(network) ||
      typeof origin !== "string" || typeof resource !== "string" || !resource.startsWith("/") ||
      typeof requestUrl !== "string") {
    throw new TypeError("trusted network, origin, resource and request URL are required");
  }
  const url = new URL(requestUrl);
  if (url.origin !== origin || url.pathname !== `/api/engine${resource}`) {
    throw new TypeError("request origin/resource does not match the trusted Engine request");
  }
  if (!challenge || !Array.isArray(challenge.accepts)) throw new TypeError("malformed 402 challenge");
  const escrowEntries = challenge.accepts.filter((entry) => entry?.scheme === "escrow");
  if (escrowEntries.length !== 1) throw new TypeError("challenge must contain exactly one escrow scheme");
  const entry = escrowEntries[0];
  if (entry.network !== network || assertAddress(entry.payTo, "challenge payee") !== trustedPayTo) {
    throw new TypeError("challenge network or payee does not match trusted configuration");
  }
  if (entry.extra?.resource !== resource) throw new TypeError("challenge resource does not match the request");
  if (entry.extra?.signWith && entry.extra.signWith !== "personal_sign (EIP-191)") {
    throw new TypeError("challenge requests an unsupported signing method");
  }
  const template = entry.extra?.message;
  if (typeof template !== "string" || template.length > 2000) throw new TypeError("challenge message template is missing or invalid");
  const templateLines = template.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const expectedLines = [
    "Telegraph Escrow Payment",
    "Wallet:",
    "Pay To:",
    "Network:",
    "Amount:",
    "Resource:",
    "Nonce:",
    "Valid After:",
    "Valid Before:",
  ];
  if (templateLines.length !== expectedLines.length ||
      expectedLines.some((prefix, index) => !templateLines[index].startsWith(prefix))) {
    throw new TypeError("challenge message structure is not the documented escrow template");
  }
  if (exactlyOneLine(template, "Network") !== network ||
      assertAddress(exactlyOneLine(template, "Pay To"), "template payee") !== trustedPayTo ||
      exactlyOneLine(template, "Resource") !== resource) {
    throw new TypeError("challenge template does not match its trusted envelope");
  }
  for (const [field, placeholder] of [["Wallet", "{from}"], ["Nonce", "{nonce}"], ["Valid After", "{validAfter}"], ["Valid Before", "{validBefore}"]]) {
    const value = exactlyOneLine(template, field);
    if (value !== placeholder || template.split(placeholder).length - 1 !== 1) {
      throw new TypeError(`challenge template must bind ${field} to exactly ${placeholder}`);
    }
  }
  const amountText = exactlyOneLine(template, "Amount");
  const amountMatch = /^(\d+) uUSDC$/.exec(amountText);
  if (!amountMatch) throw new TypeError("challenge amount is malformed");
  const amount = BigInt(amountMatch[1]);
  if (amount <= 0n || amount > CALL_CAP_MICRO || BigInt(runReservedMicro) + amount > RUN_CAP_MICRO) {
    throw new RangeError("challenge exceeds the per-call or per-run payment limit");
  }
  return { payer, payTo: trustedPayTo, network, resource, amount, template };
}

export function validateEscrowReceipt(receipt, { intent, amount, payer, minerId } = {}) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return false;
  if (typeof receipt.receipt_hash !== "string" || !HASH_PATTERN.test(receipt.receipt_hash)) return false;
  if (receipt.rail !== "escrow") return false;
  if (typeof receipt.payer !== "string" || receipt.payer.toLowerCase() !== payer.toLowerCase()) return false;
  if (typeof receipt.intent !== "string" || receipt.intent !== intent) return false;
  if (typeof receipt.amount_uusdc !== "string" || !UINT_PATTERN.test(receipt.amount_uusdc)) return false;
  try { if (BigInt(receipt.amount_uusdc) !== BigInt(amount)) return false; } catch { return false; }
  if (!Number.isSafeInteger(receipt.epoch_id) || receipt.epoch_id < 0) return false;
  if (receipt.settlement !== "epoch") return false;
  if (receipt.chain !== "telegraph") return false;
  if (!Number.isSafeInteger(receipt.timestamp) || receipt.timestamp < 0) return false;
  const minerValid = (typeof receipt.miner === "string" && receipt.miner.trim().length > 0) ||
    (Number.isSafeInteger(receipt.miner) && receipt.miner > 0);
  if (!minerValid) return false;
  if (minerId != null && String(receipt.miner) !== String(minerId)) return false;
  return true;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((k) => [k, stable(value[k])])
    );
  }
  return value;
}

export function isMatchingAnswer(data, { intent, params } = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data) || !data.input || typeof data.input !== "object" || Array.isArray(data.input)) return false;
  if (data.intent !== intent) return false;
  return JSON.stringify(stable(data.input)) === JSON.stringify(stable(params));
}

// In-process memory locks fallback
const processLocks = new Map();

export async function withLock(lockName, fn) {
  if (typeof globalThis.navigator !== "undefined" && typeof globalThis.navigator?.locks?.request === "function") {
    return await globalThis.navigator.locks.request(lockName, async () => {
      return await fn();
    });
  }
  // In browser environments without navigator.locks, fail closed rather than silently permitting unsafe concurrency
  if (typeof globalThis.window !== "undefined") {
    throw new Error("Concurrency locking primitive (navigator.locks) is unavailable; failing closed to prevent duplicate authorization");
  }
  // Fallback async queue lock for Node environments if navigator.locks is absent
  while (processLocks.has(lockName)) {
    await processLocks.get(lockName);
  }
  let unlock;
  const promise = new Promise((resolve) => { unlock = resolve; });
  processLocks.set(lockName, promise);
  try {
    return await fn();
  } finally {
    processLocks.delete(lockName);
    unlock();
  }
}

export function readAttemptLedger(storage = globalThis.localStorage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (error) {
    throw new Error(`payment attempt ledger could not be read: ${error.message}`);
  }
  if (!raw) return { version: LEDGER_VERSION, attempts: {}, history: [], byRun: {}, byWallet: {} };
  let ledger;
  try {
    ledger = JSON.parse(raw);
  } catch (error) {
    throw new Error(`payment attempt ledger contains malformed JSON; reconcile storage manually: ${error.message}`);
  }
  if (ledger?.version !== LEDGER_VERSION || !ledger.attempts ||
      typeof ledger.attempts !== "object" || Array.isArray(ledger.attempts)) {
    throw new Error("payment attempt ledger version or schema is invalid; reconcile storage manually");
  }
  ledger.history = Object.values(ledger.attempts).flatMap((entry) => [
    ...(Array.isArray(entry.priorAttempts) ? entry.priorAttempts : []), entry,
  ]);
  ledger.byRun = {};
  ledger.byWallet = {};
  for (const attempt of ledger.history) {
    if (attempt.runId) (ledger.byRun[attempt.runId] ??= []).push(attempt);
    if (attempt.wallet) (ledger.byWallet[attempt.wallet.toLowerCase()] ??= []).push(attempt);
  }
  return ledger;
}

export function getLatestAttempt(ledger, requestId) {
  if (!ledger?.attempts) return null;
  const entry = ledger.attempts[requestId];
  if (!entry) return null;
  return entry;
}

export function saveAttempt(storage, requestId, attempt) {
  if (!/^sha256:[0-9a-f]{64}$/.test(requestId)) throw new TypeError("stable payment request ID is required");
  const ledger = readAttemptLedger(storage);
  if (!Array.isArray(ledger.history)) {
    ledger.history = [];
  }
  if (!ledger.byRun || typeof ledger.byRun !== "object") ledger.byRun = {};
  if (!ledger.byWallet || typeof ledger.byWallet !== "object") ledger.byWallet = {};

  const existing = ledger.attempts[requestId];
  const attemptId = attempt.attemptId || existing?.attemptId || (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  const attemptRecord = {
    ...attempt,
    requestId,
    attemptId,
    updatedAt: new Date().toISOString(),
  };

  // Update or append to ledger.history (append-only record of all attempts)
  const histIdx = ledger.history.findIndex((a) => a.attemptId === attemptId);
  if (histIdx >= 0) {
    ledger.history[histIdx] = attemptRecord;
  } else {
    ledger.history.push(attemptRecord);
  }

  // Index by runId
  if (attemptRecord.runId) {
    if (!Array.isArray(ledger.byRun[attemptRecord.runId])) {
      ledger.byRun[attemptRecord.runId] = [];
    }
    const rIdx = ledger.byRun[attemptRecord.runId].findIndex((a) => a.attemptId === attemptId);
    if (rIdx >= 0) {
      ledger.byRun[attemptRecord.runId][rIdx] = attemptRecord;
    } else {
      ledger.byRun[attemptRecord.runId].push(attemptRecord);
    }
  }

  // Index by wallet
  if (attemptRecord.wallet) {
    const normW = attemptRecord.wallet.toLowerCase();
    if (!Array.isArray(ledger.byWallet[normW])) {
      ledger.byWallet[normW] = [];
    }
    const wIdx = ledger.byWallet[normW].findIndex((a) => a.attemptId === attemptId);
    if (wIdx >= 0) {
      ledger.byWallet[normW][wIdx] = attemptRecord;
    } else {
      ledger.byWallet[normW].push(attemptRecord);
    }
  }

  // Preserve prior attempts for this requestId non-destructively
  const priorAttempts = existing
    ? (Array.isArray(existing.priorAttempts) ? [...existing.priorAttempts] : (existing.attemptId !== attemptId ? [existing] : []))
    : [];
  if (existing && existing.attemptId !== attemptId && !priorAttempts.some((a) => a.attemptId === existing.attemptId)) {
    priorAttempts.push(existing);
  }

  // Set the primary attempt object on attempts[requestId] for backward-compatible property access
  ledger.attempts[requestId] = {
    ...attemptRecord,
    priorAttempts,
  };

  try {
    const persisted = { version: LEDGER_VERSION, attempts: ledger.attempts };
    const encoded = JSON.stringify(persisted);
    storage.setItem(STORAGE_KEY, encoded);
    if (storage.getItem(STORAGE_KEY) !== encoded) {
      throw new Error("persistence verification failed");
    }
  } catch (error) {
    throw new Error(`payment outcome could not be saved: ${error.message}`);
  }
  return ledger.attempts[requestId];
}

export async function paymentRequestId(wallet, intent, params) {
  const payload = JSON.stringify(stable({ wallet: assertAddress(wallet, "wallet"), intent, params }));
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return "sha256:" + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function mintAssessmentIntent(storage, wallet, intent, params) {
  const requestId = await paymentRequestId(wallet, intent, params);
  const token = globalThis.crypto?.randomUUID?.() ?? `intent_${Date.now()}_${Math.random()}`;
  let intents;
  try { intents = JSON.parse(storage.getItem(INTENT_KEY) || "{}"); } catch { throw new Error("assessment intent storage is unavailable; failing closed"); }
  intents[requestId] = token;
  try { storage.setItem(INTENT_KEY, JSON.stringify(intents)); } catch { throw new Error("assessment intent could not be saved; failing closed"); }
  return token;
}

export async function getAssessmentIntent(storage, wallet, intent, params) {
  const requestId = await paymentRequestId(wallet, intent, params);
  let intents;
  try { intents = JSON.parse(storage.getItem(INTENT_KEY) || "{}"); } catch { throw new Error("assessment intent storage is unavailable; failing closed"); }
  return intents[requestId] ?? null;
}

export async function assertSepolia(provider, wallet, isCurrent = () => true) {
  if (!isCurrent()) throw new Error("Wallet account or network changed; aborting");
  const chainId = await provider.request({ method: "eth_chainId" });
  if (typeof chainId !== "string" || chainId.toLowerCase() !== LIVE_CHAIN_ID) {
    throw new Error(`provider is on ${chainId}, expected Ethereum Sepolia (${LIVE_CHAIN_ID})`);
  }
  const accounts = await provider.request({ method: "eth_accounts" });
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("provider has no selected accounts");
  }
  if (accounts[0].toLowerCase() !== assertAddress(wallet, "wallet")) {
    throw new Error(`provider account ${accounts[0]} does not match active wallet ${wallet}`);
  }
  if (!isCurrent()) throw new Error("Wallet account or network changed; aborting");
}

export async function waitForTransaction(provider, hash, {
  timeoutMs = 60_000,
  pollMs = 1_000,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (typeof hash !== "string" || !HASH_PATTERN.test(hash)) throw new TypeError("invalid transaction hash");
  const start = now();
  while (now() - start < timeoutMs) {
    const receipt = await provider.request({
      method: "eth_getTransactionReceipt",
      params: [hash],
    });
    if (receipt) {
      if (typeof receipt.transactionHash !== "string" || receipt.transactionHash.toLowerCase() !== hash.toLowerCase() ||
          receipt.status !== "0x1") {
        throw new Error("provider returned mismatched receipt or transaction reverted on-chain");
      }
      return receipt;
    }
    await sleep(pollMs);
  }
  throw new Error(`transaction ${hash} is still pending after ${timeoutMs}ms`);
}

async function readUint(provider, to, data, from) {
  const result = await provider.request({
    method: "eth_call",
    params: [{ to, data, from }, "latest"],
  });
  if (typeof result !== "string" || result === "0x" || !/^0x[0-9a-f]+$/i.test(result)) {
    throw new Error("contract call returned empty or malformed data");
  }
  return BigInt(result);
}

export async function mintTestUsdc({ provider, wallet, usdc, isCurrent = () => true }) {
  await assertSepolia(provider, wallet, isCurrent);
  const normalizedWallet = assertAddress(wallet, "wallet");
  const normalizedUsdc = assertAddress(usdc, "usdc");
  const data = encodeFunctionCall("0x40c10f19", ["address", "uint256"], [normalizedWallet, 10_000_000n]);
  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from: normalizedWallet, to: normalizedUsdc, data, gas: "0x186a0" }],
  });
  await waitForTransaction(provider, hash);
  await assertSepolia(provider, normalizedWallet, isCurrent);
  return hash;
}

export async function readWalletFundingState({
  provider,
  wallet,
  usdc,
  diamond,
  storage = globalThis.localStorage,
  isCurrent = () => true,
}) {
  const normalizedWallet = assertAddress(wallet, "wallet");
  const normalizedUsdc = assertAddress(usdc, "usdc");
  const normalizedDiamond = assertAddress(diamond, "diamond");

  await assertSepolia(provider, normalizedWallet, isCurrent);

  let ethBalanceWei = null;
  let ethBalanceReadError = null;
  try {
    const res = await provider.request({ method: "eth_getBalance", params: [normalizedWallet, "latest"] });
    ethBalanceWei = BigInt(res);
  } catch (err) {
    ethBalanceReadError = String(err?.message ?? err);
  }

  let usdcBalanceMicro = null;
  let usdcBalanceReadError = null;
  try {
    const data = encodeFunctionCall(ERC20_BALANCE_OF_SELECTOR, ["address"], [normalizedWallet]);
    usdcBalanceMicro = await readUint(provider, normalizedUsdc, data, normalizedWallet);
  } catch (err) {
    usdcBalanceReadError = String(err?.message ?? err);
  }

  let allowanceMicro = null;
  let allowanceReadError = null;
  try {
    const data = encodeFunctionCall(ERC20_ALLOWANCE_SELECTOR, ["address", "address"], [normalizedWallet, normalizedDiamond]);
    allowanceMicro = await readUint(provider, normalizedUsdc, data, normalizedWallet);
  } catch (err) {
    allowanceReadError = String(err?.message ?? err);
  }

  let rawEscrowBalanceMicro = null;
  let rawEscrowReadError = null;
  try {
    const data = encodeFunctionCall(ESCROW_BALANCE_SELECTOR, ["address"], [normalizedWallet]);
    rawEscrowBalanceMicro = await readUint(provider, normalizedDiamond, data, normalizedWallet);
  } catch (err) {
    rawEscrowReadError = String(err?.message ?? err);
  }

  let effectiveEscrowBalanceMicro = null;
  let effectiveEscrowReadError = null;
  try {
    const data = encodeFunctionCall(ESCROW_EFFECTIVE_BALANCE_SELECTOR, ["address"], [normalizedWallet]);
    effectiveEscrowBalanceMicro = await readUint(provider, normalizedDiamond, data, normalizedWallet);
  } catch (err) {
    effectiveEscrowReadError = String(err?.message ?? err);
  }

  let agentDebtMicro = null;
  let agentDebtReadError = null;
  try {
    const data = encodeFunctionCall(ESCROW_AGENT_DEBT_SELECTOR, ["address"], [normalizedWallet]);
    agentDebtMicro = await readUint(provider, normalizedDiamond, data, normalizedWallet);
  } catch (err) {
    agentDebtReadError = String(err?.message ?? err);
  }

  let pendingWithdrawalMicro = null;
  let pendingWithdrawalReadError = null;
  try {
    const data = encodeFunctionCall(ESCROW_PENDING_WITHDRAWAL_SELECTOR, ["address"], [normalizedWallet]);
    pendingWithdrawalMicro = await readUint(provider, normalizedDiamond, data, normalizedWallet);
  } catch (err) {
    pendingWithdrawalReadError = String(err?.message ?? err);
  }

  // Calculate unbilled liabilities from stored attempts:
  // Include authorization_pending, unknown, and protocol_receipt (billed but unsettled on-chain).
  // If ledger is malformed or storage unavailable, liabilities are marked as read error!
  let pendingLiabilitiesMicro = 0n;
  let liabilitiesReadError = null;
  try {
    const ledger = readAttemptLedger(storage);
    const allAttempts = Array.isArray(ledger.history) && ledger.history.length > 0
      ? ledger.history
      : Object.values(ledger.attempts);
    pendingLiabilitiesMicro = allAttempts
      .filter((attempt) => {
        if (!attempt.wallet || attempt.wallet.toLowerCase() !== normalizedWallet) return false;
        if (!attempt.authorizationStarted) return false;
        return (
          attempt.status === "authorization_pending" ||
          attempt.status === "unknown" ||
          (attempt.status === "protocol_receipt" && attempt.settledOnChain !== true)
        );
      })
      .reduce((sum, attempt) => sum + (typeof attempt.amountMicro === "string" ? BigInt(attempt.amountMicro) : 0n), 0n);
  } catch (err) {
    liabilitiesReadError = String(err?.message ?? err);
  }

  // Post-read context guard
  if (!isCurrent()) {
    throw new Error("Wallet account or network changed; aborting");
  }

  let spendableEscrowMicro = null;
  // If effectiveEscrow failed, debt read failed, or liabilities read failed, spendable is unknown/null
  if (effectiveEscrowBalanceMicro != null && !effectiveEscrowReadError && !agentDebtReadError && !liabilitiesReadError) {
    // effectiveBalance already excludes pending withdrawals and gas reserve on Telegraph Diamond.
    const safeBase = effectiveEscrowBalanceMicro > pendingLiabilitiesMicro
      ? effectiveEscrowBalanceMicro - pendingLiabilitiesMicro
      : 0n;
    spendableEscrowMicro = safeBase;
  }

  return {
    wallet: normalizedWallet,
    ethBalanceWei,
    ethBalanceReadError,
    usdcBalanceMicro,
    usdcBalanceReadError,
    allowanceMicro,
    allowanceReadError,
    rawEscrowBalanceMicro,
    rawEscrowReadError,
    effectiveEscrowBalanceMicro,
    effectiveEscrowReadError,
    agentDebtMicro,
    agentDebtReadError,
    pendingWithdrawalMicro,
    pendingWithdrawalReadError,
    pendingLiabilitiesMicro,
    liabilitiesReadError,
    spendableEscrowMicro,
  };
}

export async function fundEscrow({
  provider,
  wallet,
  usdc,
  diamond,
  amountMicro,
  isCurrent = () => true,
  waitForReceipt = waitForTransaction,
  onStage = () => {},
}) {
  await assertSepolia(provider, wallet, isCurrent);
  const normalizedWallet = assertAddress(wallet, "wallet");
  const normalizedUsdc = assertAddress(usdc, "usdc");
  const normalizedDiamond = assertAddress(diamond, "diamond");

  const allowanceData = encodeFunctionCall(ERC20_ALLOWANCE_SELECTOR, ["address", "address"], [normalizedWallet, normalizedDiamond]);
  const allowanceBefore = await readUint(provider, normalizedUsdc, allowanceData, normalizedWallet);

  let approveHash = null;
  if (amountMicro !== undefined) {
    // Balance-aware path with explicit funding amount
    const topUpMicro = typeof amountMicro === "bigint" ? amountMicro : BigInt(amountMicro);
    if (topUpMicro <= 0n) throw new RangeError("funding amount must be greater than zero");

    if (allowanceBefore < topUpMicro) {
      onStage("approval_pending", { needed: topUpMicro.toString(), currentAllowance: allowanceBefore.toString() });
      await assertSepolia(provider, normalizedWallet, isCurrent);
      const approveData = encodeFunctionCall(ERC20_APPROVE_SELECTOR, ["address", "uint256"], [normalizedDiamond, topUpMicro]);
      approveHash = await provider.request({
        method: "eth_sendTransaction",
        params: [{ from: normalizedWallet, to: normalizedUsdc, data: approveData, gas: "0x186a0" }],
      });
      await waitForReceipt(provider, approveHash);
      await assertSepolia(provider, normalizedWallet, isCurrent);
      const allowanceAfter = await readUint(provider, normalizedUsdc, allowanceData, normalizedWallet);
      if (allowanceAfter < topUpMicro) {
        throw new Error("USDC approval receipt confirmed, but allowance is insufficient for the deposit");
      }
      onStage("approval_confirmed", { approveHash, allowance: allowanceAfter.toString() });
    } else {
      onStage("approval_skipped", { allowance: allowanceBefore.toString() });
    }

    // Pre-deposit reads: raw escrow balance AND agent debt
    const escrowBalanceData = encodeFunctionCall(ESCROW_BALANCE_SELECTOR, ["address"], [normalizedWallet]);
    const debtData = encodeFunctionCall(ESCROW_AGENT_DEBT_SELECTOR, ["address"], [normalizedWallet]);

    const [balanceBefore, debtBefore] = await Promise.all([
      readUint(provider, normalizedDiamond, escrowBalanceData, normalizedWallet),
      readUint(provider, normalizedDiamond, debtData, normalizedWallet),
    ]);

    onStage("deposit_pending", { amount: topUpMicro.toString(), debtBefore: debtBefore.toString() });
    await assertSepolia(provider, normalizedWallet, isCurrent);

    const depositData = encodeFunctionCall(DEPOSIT_SELECTOR, ["uint256"], [topUpMicro]);
    const depositHash = await provider.request({
      method: "eth_sendTransaction",
      params: [{ from: normalizedWallet, to: normalizedDiamond, data: depositData, gas: "0x30d40" }],
    });

    await waitForReceipt(provider, depositHash);
    await assertSepolia(provider, normalizedWallet, isCurrent);

    // Post-deposit reads
    const [balanceAfter, debtAfter] = await Promise.all([
      readUint(provider, normalizedDiamond, escrowBalanceData, normalizedWallet),
      readUint(provider, normalizedDiamond, debtData, normalizedWallet),
    ]);

    // Accounting assumption (not documented contract ordering): compare raw balance delta plus debt reduction.
    // Same order-independent accounting assumption as the explicit top-up path.
    const debtRepaid = debtBefore > debtAfter ? debtBefore - debtAfter : 0n;
    if ((balanceAfter - balanceBefore) + debtRepaid < topUpMicro) {
      throw new Error("deposit receipt confirmed, but balance and debt changes do not account for the top-up");
    }

    onStage("deposit_confirmed", {
      depositHash,
      balanceMicro: balanceAfter.toString(),
      debtRepaid: debtRepaid.toString(),
      debtRemaining: debtAfter.toString(),
    });

    return {
      approveHash,
      depositHash,
      balanceMicro: balanceAfter.toString(),
      debtRepaid: debtRepaid.toString(),
      debtRemaining: debtAfter.toString(),
    };
  } else {
    // Legacy behavior when amountMicro is omitted (unconditional approval for 3 USDC)
    await assertSepolia(provider, normalizedWallet, isCurrent);
    const approveData = encodeFunctionCall(ERC20_APPROVE_SELECTOR, ["address", "uint256"], [normalizedDiamond, FUNDING_AMOUNT_MICRO]);
    approveHash = await provider.request({
      method: "eth_sendTransaction",
      params: [{ from: normalizedWallet, to: normalizedUsdc, data: approveData, gas: "0x186a0" }],
    });
    await waitForReceipt(provider, approveHash);
    await assertSepolia(provider, normalizedWallet, isCurrent);
    const allowanceAfter = await readUint(provider, normalizedUsdc, allowanceData, normalizedWallet);
    if (allowanceAfter < FUNDING_AMOUNT_MICRO) {
      throw new Error("USDC approval receipt confirmed, but allowance is insufficient for the deposit");
    }

    const escrowBalanceData = encodeFunctionCall(ESCROW_BALANCE_SELECTOR, ["address"], [normalizedWallet]);
    const debtData = encodeFunctionCall(ESCROW_AGENT_DEBT_SELECTOR, ["address"], [normalizedWallet]);

    const [balanceBefore, debtBefore] = await Promise.all([
      readUint(provider, normalizedDiamond, escrowBalanceData, normalizedWallet),
      readUint(provider, normalizedDiamond, debtData, normalizedWallet),
    ]);

    const depositData = encodeFunctionCall(DEPOSIT_SELECTOR, ["uint256"], [FUNDING_AMOUNT_MICRO]);
    const depositHash = await provider.request({
      method: "eth_sendTransaction",
      params: [{ from: normalizedWallet, to: normalizedDiamond, data: depositData, gas: "0x30d40" }],
    });
    await waitForReceipt(provider, depositHash);
    await assertSepolia(provider, normalizedWallet, isCurrent);

    const [balanceAfter, debtAfter] = await Promise.all([
      readUint(provider, normalizedDiamond, escrowBalanceData, normalizedWallet),
      readUint(provider, normalizedDiamond, debtData, normalizedWallet),
    ]);

    const debtRepaid = debtBefore > debtAfter ? debtBefore - debtAfter : 0n;
    if ((balanceAfter - balanceBefore) + debtRepaid < FUNDING_AMOUNT_MICRO) {
      throw new Error("deposit receipt confirmed, but balance and debt changes do not account for the 3 USDC top-up");
    }

    return {
      approveHash,
      depositHash,
      balanceMicro: balanceAfter.toString(),
      debtRepaid: debtRepaid.toString(),
      debtRemaining: debtAfter.toString(),
    };
  }
}

export async function performPaidAsk({
  provider,
  wallet,
  intent,
  params,
  requestUrl,
  runId,
  storage = globalThis.localStorage,
  network = "eip155:11155111",
  payTo,
  origin,
  resource = "/v1/ask",
  fetchImpl,
  intentToken,
  isCurrent = () => true,
  onAttempt = () => {},
}) {
  if (typeof fetchImpl !== "function") throw new TypeError("trusted Engine fetch implementation is required");
  await assertSepolia(provider, wallet, isCurrent);
  const normalizedWallet = assertAddress(wallet, "wallet");
  const requestId = await paymentRequestId(normalizedWallet, intent, params);
  const attemptId = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Fail-closed concurrency protection across tabs and in-tab calls for the same wallet
  return await withLock(`lock:escrow:${normalizedWallet}`, async () => {
    // Authoritative re-read inside the critical section
    const currentLedger = readAttemptLedger(storage);
    const existing = currentLedger.attempts[requestId];
    let tokenAuthorized = false;
    let intents;
    try { intents = JSON.parse(storage.getItem(INTENT_KEY) || "{}"); } catch { throw new Error("assessment intent storage is unavailable; failing closed"); }
    if (intentToken && intents[requestId] === intentToken) {
      delete intents[requestId];
      try { storage.setItem(INTENT_KEY, JSON.stringify(intents)); } catch { throw new Error("assessment intent could not be consumed; failing closed"); }
      tokenAuthorized = true;
    }

    const history = Array.isArray(currentLedger.history) ? currentLedger.history : Object.values(currentLedger.attempts);
    if (history.some((attempt) => attempt.wallet?.toLowerCase() === normalizedWallet &&
      attempt.authorizationStarted && ["authorization_pending", "unknown"].includes(attempt.status))) {
      throw new Error("A payment for this wallet has an unresolved authorization; Reconcile it before starting another.");
    }

    if (existing?.status === "protocol_receipt") {
      if (!tokenAuthorized) {
        throw new Error("This request was already authorized in the current assessment run or has a saved protocol receipt. Reconcile it, or click New assessment before repeating these exact inputs.");
      }
    }

    if (existing?.authorizationStarted) {
      if (existing.status === "protocol_receipt") {
        // A single-use New assessment token, checked and consumed above, authorizes repeats.
      } else if (existing.status !== "definitive_unpaid" && existing.status !== "signature_rejected") {
        throw new Error("A prior request may already have been authorized. Reconcile its saved receipt or epoch delivery before retrying.");
      }
    }

    const body = JSON.stringify({ intent, params });
    const first = await fetchImpl(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (first.status !== 402) {
      if (!first.ok) {
        const errorText = await first.text().catch(() => "");
        saveAttempt(storage, requestId, {
          attemptId,
          wallet: normalizedWallet, intent, params, runId: runId ?? null, status: "definitive_unpaid",
          authorizationStarted: false, error: `Engine HTTP ${first.status}: ${errorText}`,
        });
        throw new Error(`Engine HTTP ${first.status}`);
      }
      const answer = await first.json();
      const answerMatches = isMatchingAnswer(answer, { intent, params });
      const attempt = saveAttempt(storage, requestId, {
        attemptId,
        wallet: normalizedWallet, intent, params, runId: runId ?? null, status: "answered_without_payment",
        authorizationStarted: false, answer, answerMatches, receipt: null,
      });
      onAttempt(attempt);
      return { requestId, attemptId, answer, receipt: null, paymentStatus: "not_authorized", answerMatches, amountMicro: null };
    }

    const challenge = await first.json();
    await assertSepolia(provider, normalizedWallet, isCurrent);

    // Calculate budget for the current assessment run and wallet
    let runReservedMicro = 0n;
    const allAttempts = Array.isArray(currentLedger.history) && currentLedger.history.length > 0
      ? currentLedger.history
      : Object.values(currentLedger.attempts);

    if (runId) {
      runReservedMicro = allAttempts
        .filter((attempt) => {
          if (!attempt.wallet || attempt.wallet.toLowerCase() !== normalizedWallet) return false;
          if (attempt.runId !== runId) return false;
          return attempt.authorizationStarted && attempt.status !== "definitive_unpaid" && attempt.status !== "signature_rejected";
        })
        .reduce((sum, attempt) => sum + (typeof attempt.amountMicro === "string" ? BigInt(attempt.amountMicro) : 0n), 0n);
    } else {
      // Legacy un-scoped fallback for callers without runId
      runReservedMicro = allAttempts
        .filter((attempt) => {
          return attempt.authorizationStarted && attempt.status !== "definitive_unpaid" && attempt.status !== "signature_rejected";
        })
        .reduce((sum, attempt) => sum + (typeof attempt.amountMicro === "string" ? BigInt(attempt.amountMicro) : 0n), 0n);
    }

    const validated = validateEscrowChallenge(challenge, {
      wallet: normalizedWallet, network, payTo, origin, resource, requestUrl, runReservedMicro,
    });

    const authorization = {
      from: validated.payer,
      to: validated.payTo,
      value: String(validated.amount),
      validAfter: String(Math.floor(Date.now() / 1000) - 5),
      validBefore: String(Math.floor(Date.now() / 1000) + 100),
      nonce: Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join(""),
    };

    const message = validated.template
      .replace("{from}", authorization.from)
      .replace("{nonce}", authorization.nonce)
      .replace("{validAfter}", authorization.validAfter)
      .replace("{validBefore}", authorization.validBefore);

    const pending = saveAttempt(storage, requestId, {
      attemptId,
      wallet: normalizedWallet, intent, params, runId: runId ?? null, status: "authorization_pending",
      authorizationStarted: true, amountMicro: String(validated.amount),
      answer: null, receipt: null,
    });
    onAttempt(pending);

    let signature;
    try {
      signature = await provider.request({ method: "personal_sign", params: [message, normalizedWallet] });
    } catch (error) {
      const isRejection = error?.code === 4001;
      const rejected = saveAttempt(storage, requestId, {
        ...pending,
        status: isRejection ? "signature_rejected" : "unknown",
        authorizationStarted: !isRejection,
        error: String(error?.message ?? error),
      });
      onAttempt(rejected);
      throw error;
    }

    if (typeof signature !== "string" || !/^0x(?:[0-9a-f]{2})+$/i.test(signature)) {
      const unknown = saveAttempt(storage, requestId, { ...pending, status: "unknown", error: "wallet returned a malformed signature" });
      onAttempt(unknown);
      throw new Error("wallet returned a malformed signature");
    }

    try {
      await assertSepolia(provider, normalizedWallet, isCurrent);
      const envelope = {
        x402Version: 2,
        scheme: "escrow",
        network: validated.network,
        payload: { signature, authorization },
      };
      const response = await fetchImpl(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT": btoa(JSON.stringify(envelope)),
        },
        body,
      });
      const encodedReceipt = response.headers?.get?.("x-payment-response") ?? null;
      let receipt = null;
      if (encodedReceipt) {
        try {
          receipt = JSON.parse(atob(encodedReceipt));
        } catch {
          receipt = null;
        }
      }
      const responseData = response.ok ? await response.json() : null;
      const receiptValid = validateEscrowReceipt(receipt, {
        intent, amount: validated.amount, payer: normalizedWallet, minerId: responseData?.miner_id,
      });
      const answerMatches = isMatchingAnswer(responseData, { intent, params });
      const status = receiptValid ? "protocol_receipt" : "unknown";
      const saved = saveAttempt(storage, requestId, {
        ...pending, status, authorizationStarted: true, answer: responseData,
        answerMatches, receipt: receiptValid ? receipt : null,
        receiptValid, httpStatus: response.status,
      });
      onAttempt(saved);
      if (!response.ok) throw new Error(`Engine HTTP ${response.status} after authorization`);
      return {
        requestId,
        attemptId,
        answer: responseData,
        answerMatches,
        receipt: receiptValid ? receipt : null,
        paymentStatus: status,
        amountMicro: String(validated.amount),
      };
    } catch (error) {
      const latestAttempt = readAttemptLedger(storage).attempts[requestId];
      if (latestAttempt?.status !== "protocol_receipt") {
        const unknown = saveAttempt(storage, requestId, {
          ...pending, status: "unknown", authorizationStarted: true,
          error: String(error?.message ?? error),
        });
        onAttempt(unknown);
      }
      throw error;
    }
  });
}

export const LIVE_PAYMENT_LIMITS = Object.freeze({
  callMicro: String(CALL_CAP_MICRO),
  runMicro: String(RUN_CAP_MICRO),
  fundingMicro: String(FUNDING_AMOUNT_MICRO),
  chainId: LIVE_CHAIN_ID,
});
