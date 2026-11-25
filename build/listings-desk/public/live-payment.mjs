const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;
const UINT_PATTERN = /^(0|[1-9]\d*)$/;
const STORAGE_KEY = "leaderlight.live-attempts.v1";
const PENDING_DEPOSITS_KEY = "leaderlight.pending-deposits.v1";
const NODE_ROOT = "https://devnode.telegraphprotocol.com";
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
const LEDGER_ACCOUNT_BASE = "/api/ledger/account/";
const LEDGER_ACCOUNT_FIELDS = ["deposited", "withdrawn", "charged", "credited", "unbilled", "balance", "available", "charge_limit", "charged_this_block"];

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

export function validateEscrowReceipt(receipt, expected) {
  return escrowReceiptValidationIssue(receipt, expected) === null;
}

function escrowReceiptValidationIssue(receipt, { intent, amount, payer, minerId } = {}) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return "receipt object";
  if (typeof receipt.receipt_hash !== "string" || !HASH_PATTERN.test(receipt.receipt_hash)) return "receipt hash";
  if (receipt.rail !== "escrow") return "payment rail";
  if (typeof receipt.payer !== "string" || typeof payer !== "string" || receipt.payer.toLowerCase() !== payer.toLowerCase()) return "payer";
  if (typeof receipt.intent !== "string" || receipt.intent !== intent) return "intent";
  if (typeof receipt.amount_uusdc !== "string" || !UINT_PATTERN.test(receipt.amount_uusdc)) return "amount format";
  try { if (BigInt(receipt.amount_uusdc) !== BigInt(amount)) return "amount"; } catch { return "amount"; }
  if (!Number.isSafeInteger(receipt.epoch_id) || receipt.epoch_id < 0) return "epoch";
  if (receipt.settlement !== "epoch") return "settlement type";
  if (receipt.chain !== "telegraph") return "receipt chain";
  if (!Number.isSafeInteger(receipt.timestamp) || receipt.timestamp < 0) return "timestamp";
  const minerValid = (typeof receipt.miner === "string" && receipt.miner.trim().length > 0) ||
    (Number.isSafeInteger(receipt.miner) && receipt.miner > 0);
  if (!minerValid || (minerId != null && String(receipt.miner) !== String(minerId))) return "miner identity";
  return null;
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
  const seenAttemptIds = new Set();
  ledger.history = [];
  for (const entry of Object.values(ledger.attempts)) {
    const ordered = [
      ...flattenPriorAttempts(entry).filter((attempt) => attempt.attemptId !== entry.attemptId),
      entry,
    ];
    for (const attempt of ordered) {
      if (typeof attempt?.attemptId === "string" && seenAttemptIds.has(attempt.attemptId)) continue;
      if (typeof attempt?.attemptId === "string") seenAttemptIds.add(attempt.attemptId);
      ledger.history.push(attempt);
    }
  }
  ledger.byRun = {};
  ledger.byWallet = {};
  for (const attempt of ledger.history) {
    if (attempt.runId) (ledger.byRun[attempt.runId] ??= []).push(attempt);
    if (attempt.wallet) (ledger.byWallet[attempt.wallet.toLowerCase()] ??= []).push(attempt);
  }
  return ledger;
}

function compactPriorAttempt(attempt) {
  // Preserve identity, accounting evidence, intent and receipt provenance
  // through repeated compaction: older attempts must keep their reconciliation
  // state and unknown-payment history after reloads.
  const compact = Object.fromEntries([
    "attemptId", "requestId", "wallet", "runId", "status", "authorizationStarted",
    "amountMicro", "intent", "network", "payTo", "diamond", "miner",
    "accountedByNode", "accountedByNodeAt", "settledOnChain",
    "nodeResponseEvidence", "receipt", "receiptValid", "updatedAt", "createdAt",
  ].filter((key) => attempt?.[key] !== undefined).map((key) => [key, attempt[key]]));
  const receiptHash = attempt?.receipt?.receipt_hash ?? attempt?.receiptHash;
  if (typeof receiptHash === "string") compact.receiptHash = receiptHash;
  const receiptEpoch = attempt?.receipt?.epoch_id ?? attempt?.receiptEpoch;
  if (Number.isSafeInteger(receiptEpoch)) compact.receiptEpoch = receiptEpoch;
  const receiptTimestamp = attempt?.receipt?.timestamp ?? attempt?.receiptTimestamp;
  if (Number.isSafeInteger(receiptTimestamp)) compact.receiptTimestamp = receiptTimestamp;
  return compact;
}

export function flattenPriorAttempts(attempt) {
  const flat = [];
  const seen = new Set();
  const visit = (record) => {
    if (!record || typeof record !== "object") return;
    if (Array.isArray(record.priorAttempts)) record.priorAttempts.forEach(visit);
    const identity = typeof record.attemptId === "string" ? record.attemptId
      : typeof record.requestId === "string" ? record.requestId
      : null;
    if (identity === null) { flat.push(compactPriorAttempt(record)); return; }
    if (!seen.has(identity)) { seen.add(identity); flat.push(compactPriorAttempt(record)); }
  };
  visit(attempt);
  return flat;
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
  const priorAttempts = existing ? flattenPriorAttempts(existing).filter((a) => a.attemptId !== attemptId) : [];

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
          !["0x0", "0x1"].includes(receipt.status)) {
        throw new Error("provider returned mismatched receipt or malformed transaction receipt");
      }
      if (receipt.status === "0x0") {
        const error = new Error(`transaction ${hash} reverted on-chain`);
        error.transactionHash = hash;
        error.transactionStatus = "reverted";
        throw error;
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

async function estimatedGas(provider, tx) {
  let estimate;
  try { estimate = await provider.request({ method: "eth_estimateGas", params: [{ from: tx.from, to: tx.to, data: tx.data, value: tx.value }] }); }
  catch (error) { throw new Error(`gas estimation failed; transaction was not sent: ${String(error?.message ?? error)}`); }
  let units;
  try { units = BigInt(estimate); } catch { throw new Error("gas estimation returned malformed data; transaction was not sent"); }
  if (units <= 0n) throw new Error("gas estimation returned zero; transaction was not sent");
  return "0x" + ((units * 125n + 99n) / 100n + 20_000n).toString(16);
}

export async function mintTestUsdc({ provider, wallet, usdc, isCurrent = () => true }) {
  await assertSepolia(provider, wallet, isCurrent);
  const normalizedWallet = assertAddress(wallet, "wallet");
  const normalizedUsdc = assertAddress(usdc, "usdc");
  const data = encodeFunctionCall("0x40c10f19", ["address", "uint256"], [normalizedWallet, 10_000_000n]);
  const gas = await estimatedGas(provider, { from: normalizedWallet, to: normalizedUsdc, data });
  await assertSepolia(provider, normalizedWallet, isCurrent);
  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from: normalizedWallet, to: normalizedUsdc, data, gas }],
  });
  try { await waitForTransaction(provider, hash); }
  catch (error) {
    if (error?.transactionStatus === "reverted") throw error;
    const unknown = new Error(`mint submitted (tx ${hash}) but its receipt is unknown: ${String(error?.message ?? error)}. Check this hash before retrying.`);
    unknown.transactionHash = hash;
    unknown.pendingState = "unknown";
    throw unknown;
  }
  await assertSepolia(provider, normalizedWallet, isCurrent);
  return hash;
}

export async function readWalletFundingState({ provider, wallet, usdc, diamond, storage = globalThis.localStorage, isCurrent = () => true, fetchImpl = globalThis.fetch }) {
  const normalizedWallet = assertAddress(wallet, "wallet");
  const normalizedUsdc = assertAddress(usdc, "usdc");
  const normalizedDiamond = assertAddress(diamond, "diamond");
  await assertSepolia(provider, normalizedWallet, isCurrent);
  // Reconcile + resolve pending deposits under the same wallet lock that guards
  // payment writes: settled receipts stop reserving spendable (the node's
  // `available` already accounts for them) and confirmed deposits resolve once
  // the ledger indexes them. Ledger-read failures keep prior state (conservative).
  let ledgerAccount = null;
  let ledgerReadError = null;
  let reconciliation = { accounted: 0, persistenceFailed: false };
  let pendingResolution = { resolved: 0, remaining: 0 };
  try {
    if (!isCurrent()) throw new Error("Wallet account or network changed; aborting balance read");
    await withLock("lock:escrow:" + normalizedWallet, async () => {
      ledgerAccount = await fetchNodeLedger(normalizedWallet, fetchImpl);
      reconciliation = reconcileAccountedReceipts(storage, normalizedWallet, { diamond: normalizedDiamond, network: "eip155:11155111", ledgerAccount });
      pendingResolution = await resolvePendingDeposits(storage, normalizedWallet, ledgerAccount, { network: "eip155:11155111", diamond: normalizedDiamond, provider });
    });
  } catch (error) {
    ledgerReadError = String(error?.message ?? error).slice(0, 160);
  }
  const read = async (fn) => { try { return await fn(); } catch (error) { return { error: String(error?.message ?? error) }; } };
  const guardedRead = async (fn) => {
    if (!isCurrent()) throw new Error("Wallet account or network changed; aborting balance reads");
    const result = await read(fn);
    if (!isCurrent()) throw new Error("Wallet account or network changed; aborting balance reads");
    return result;
  };
  const eth = await guardedRead(async () => BigInt(await provider.request({ method: "eth_getBalance", params: [normalizedWallet, "latest"] })));
  const usdcRead = await guardedRead(async () => readUint(provider, normalizedUsdc, encodeFunctionCall(ERC20_BALANCE_OF_SELECTOR, ["address"], [normalizedWallet]), normalizedWallet));
  const allowance = await guardedRead(async () => readUint(provider, normalizedUsdc, encodeFunctionCall(ERC20_ALLOWANCE_SELECTOR, ["address", "address"], [normalizedWallet, normalizedDiamond]), normalizedWallet));
  const nodeLedger = await guardedRead(async () => {
      if (typeof fetchImpl !== "function") throw new Error("ledger fetch unavailable");
      const response = await fetchImpl(`${LEDGER_ACCOUNT_BASE}${normalizedWallet}`, { method: "GET", cache: "no-store" });
      if (!response.ok) throw new Error(`ledger HTTP ${response.status}`);
      const body = await response.json();
      if (!body || typeof body !== "object" || Array.isArray(body) || LEDGER_ACCOUNT_FIELDS.some((field) => typeof body[field] !== "string" || !UINT_PATTERN.test(body[field]))) throw new Error("ledger response is missing a documented decimal-string field");
      return Object.fromEntries(LEDGER_ACCOUNT_FIELDS.map((field) => [field, BigInt(body[field])]));
    });
  const local = await guardedRead(async () => {
      const ledger = readAttemptLedger(storage);
      const attempts = ledger.history?.length ? ledger.history : Object.values(ledger.attempts);
      const validated = new Set(reconciliation.validatedAttemptIds ?? []);
      return attempts.filter((a) => a.wallet?.toLowerCase() === normalizedWallet && a.authorizationStarted && (a.status === "authorization_pending" || a.status === "unknown" || (a.status === "protocol_receipt" && !validated.has(a.attemptId)))).reduce((sum, a) => sum + (typeof a.amountMicro === "string" ? BigInt(a.amountMicro) : 0n), 0n);
    });
  if (!isCurrent()) throw new Error("Wallet account or network changed; aborting");
  let pendingDeposits = [];
  let pendingDepositReadError = null;
  try { pendingDeposits = readPendingDeposits(storage, normalizedWallet); }
  catch (error) { pendingDepositReadError = String(error?.message ?? error); }
  const spendable = ledgerAccount && !local.error && !pendingDepositReadError ? (ledgerAccount.available > local ? ledgerAccount.available - local : 0n) : null;
  return {
    wallet: normalizedWallet, ethBalanceWei: eth.error ? null : eth, ethBalanceReadError: eth.error ?? null,
    usdcBalanceMicro: usdcRead.error ? null : usdcRead, usdcBalanceReadError: usdcRead.error ?? null,
    allowanceMicro: allowance.error ? null : allowance, allowanceReadError: allowance.error ?? null,
    ledgerAccount, ledgerReadError,
    rawEscrowBalanceMicro: ledgerAccount?.balance ?? null, rawEscrowReadError: ledgerReadError,
    effectiveEscrowBalanceMicro: ledgerAccount?.available ?? null, effectiveEscrowReadError: ledgerReadError,
    pendingLiabilitiesMicro: local.error ? 0n : local, liabilitiesReadError: local.error ?? null,
    spendableEscrowMicro: spendable,
    reconciliation, pendingDeposits, pendingDepositReadError, pendingResolution,
  };
}

async function fetchNodeLedger(wallet, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new Error("ledger fetch unavailable");
  const response = await fetchImpl(`${LEDGER_ACCOUNT_BASE}${wallet}`, { method: "GET", cache: "no-store" });
  if (!response.ok) throw new Error(`ledger HTTP ${response.status}`);
  const body = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body) || LEDGER_ACCOUNT_FIELDS.some((field) => typeof body[field] !== "string" || !UINT_PATTERN.test(body[field]))) throw new Error("ledger response is missing a documented decimal-string field");
  return Object.fromEntries(LEDGER_ACCOUNT_FIELDS.map((field) => [field, BigInt(body[field])]));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Receipt evidence, per the documented escrow model (anjoman.ai/docs/using/escrow-inference):
// - receipt_hash is "the key of the delivery's row in the node's ledger" — a
//   structurally valid receipt is the node's own attestation that the delivery
//   row exists and that the node's `available` already accounts for the charge
//   (charged or unbilled). That evidence level is `accountedByNode` and it is
//   what releases a local reservation.
// - `settledOnChain` is a STRICTER, separate claim: it requires the documented
//   delivery proof (GET /v1/blocks/{epochId}/deliveries/{receiptHash}) showing
//   the receipt's Merkle inclusion in a recorded epoch block. It is verified on
//   demand (verifyReceiptOnChain), never asserted by reconciliation alone.
// - Missing, malformed, or mismatched receipts (amount/intent/payer) keep the
//   reservation intact. Unknown and authorization-pending attempts keep
//   reserving and keep duplicate-payment protection.
// Receipt accounting evidence, per the documented escrow model
// (anjoman.ai/docs/using/escrow-inference): a structurally valid receipt is the
// node's own attestation that the delivery row exists in its ledger
// ("receipt_hash is the key of the delivery's row in the node's ledger") and
// the node's `available` already accounts for charged and unbilled usage.
// The evidence must bind to the trusted capture context: wallet, Diamond,
// network, intent, miner, amount. Missing, malformed, or mismatched proof
// keeps the local reservation intact. On-chain settlement (settledOnChain) is
// a separate, stricter claim verified via the documented delivery-proof
// endpoint — never asserted by this function.
function documentedReceiptEvidence(attempt, wallet, { diamond, network } = {}) {
  const trusted = attempt?.nodeResponseEvidence;
  if (!trusted || trusted.version !== 1 || trusted.wallet?.toLowerCase() !== String(wallet).toLowerCase() ||
      trusted.network !== network || trusted.diamond?.toLowerCase() !== String(diamond ?? "").toLowerCase() ||
      trusted.intent !== attempt.intent || String(trusted.miner) !== String(attempt.miner) ||
      String(trusted.amountMicro) !== String(attempt.amountMicro) ||
      trusted.receiptHash?.toLowerCase() !== attempt.receipt?.receipt_hash?.toLowerCase()) {
    return { ok: false, reason: "trusted payment-response evidence missing or mismatched" };
  }
  const receipt = attempt?.receipt;
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return { ok: false, reason: "receipt missing" };
  if (typeof receipt.receipt_hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(receipt.receipt_hash)) return { ok: false, reason: "receipt_hash missing/malformed" };
  if (receipt.rail !== "escrow") return { ok: false, reason: "rail mismatch" };
  if (receipt.settlement !== "epoch") return { ok: false, reason: "settlement field mismatch" };
  if (receipt.chain !== "telegraph") return { ok: false, reason: "chain mismatch" };
  if (typeof receipt.amount_uusdc !== "string" || !/^(0|[1-9]\d*)$/.test(receipt.amount_uusdc)) return { ok: false, reason: "amount missing/malformed" };
  if (attempt.amountMicro !== undefined && BigInt(receipt.amount_uusdc) !== BigInt(attempt.amountMicro)) return { ok: false, reason: "amount mismatch vs authorization" };
  if (!Number.isSafeInteger(receipt.epoch_id) || receipt.epoch_id < 0) return { ok: false, reason: "epoch_id missing/malformed" };
  if (!Number.isSafeInteger(receipt.timestamp) || receipt.timestamp < 0) return { ok: false, reason: "timestamp missing/malformed" };
  if (typeof receipt.payer !== "string" || receipt.payer.toLowerCase() !== String(wallet).toLowerCase()) return { ok: false, reason: "payer missing/mismatched" };
  if (typeof receipt.miner !== "string" && !Number.isSafeInteger(receipt.miner)) return { ok: false, reason: "miner missing" };
  if (String(receipt.miner) !== String(trusted.miner) || String(receipt.miner) !== String(attempt.miner)) return { ok: false, reason: "miner mismatch" };
  if (attempt.intent !== undefined && receipt.intent !== attempt.intent) return { ok: false, reason: "intent mismatch" };
  if (typeof attempt.payTo !== "string" || attempt.payTo.toLowerCase() !== String(diamond ?? "").toLowerCase()) return { ok: false, reason: "Diamond provenance missing/mismatched" };
  if (typeof attempt.network !== "string" || attempt.network !== String(network ?? "")) return { ok: false, reason: "network provenance missing/mismatched" };
  return { ok: true };
}

// Canonical persisted record: version + attempts. history/byRun/byWallet are
// derived by readAttemptLedger and must not be duplicated in storage.
function persistCanonicalLedger(storage, ledger) {
  const serialized = JSON.stringify({ version: LEDGER_VERSION, attempts: ledger.attempts });
  storage.setItem(STORAGE_KEY, serialized);
  if (storage.getItem(STORAGE_KEY) !== serialized) throw new Error("persistence verification failed");
}
export function reconcileAccountedReceipts(storage, wallet, { diamond, network, ledgerAccount } = {}) {
  const normalizedWallet = assertAddress(wallet, "wallet");
  if (!ledgerAccount || typeof ledgerAccount.charged !== "bigint" || typeof ledgerAccount.unbilled !== "bigint") {
    return { accounted: 0, persistenceFailed: false, validatedAttemptIds: [], policyMismatch: "fresh node accounting ledger is unavailable" };
  }
  // Re-read canonical persisted history, then update the actual nested records.
  const ledger = readAttemptLedger(storage);
  const attempts = Array.isArray(ledger.history) ? ledger.history : Object.values(ledger.attempts);
  const trustedDiamond = typeof diamond === "string" ? diamond.toLowerCase() : null;
  const trustedNetwork = typeof network === "string" ? network : null;
  const checked = [];
  for (const attempt of attempts) {
    if (attempt?.wallet?.toLowerCase() !== normalizedWallet || attempt.status !== "protocol_receipt") continue;
    const result = documentedReceiptEvidence(attempt, normalizedWallet, { diamond: trustedDiamond, network: trustedNetwork });
    checked.push({ attemptId: attempt.attemptId, requestId: attempt.requestId, attempt, ok: result.ok, reason: result.reason });
  }
  const valid = checked.filter((item) => item.ok && typeof item.attempt.amountMicro === "string");
  const coverage = ledgerAccount.charged + ledgerAccount.unbilled;
  const total = valid.reduce((sum, item) => sum + BigInt(item.attempt.amountMicro), 0n);
  const policyMismatch = total > coverage ? "ledger charged+unbilled cannot cover the evidence-backed receipts" : null;
  const currentlyAccounted = policyMismatch ? [] : valid;
  const byIdentity = new Map(currentlyAccounted.map((item) => [item.attemptId, item]));
  let accounted = 0;
  let changed = false;
  for (const [requestId, canonical] of Object.entries(ledger.attempts)) {
    const visit = (record) => {
      if (!record || typeof record !== "object") return;
      if (Array.isArray(record.priorAttempts)) record.priorAttempts.forEach(visit);
      if (record.status !== "protocol_receipt" || record.wallet?.toLowerCase() !== normalizedWallet) return;
      const item = byIdentity.get(record.attemptId);
      if (item && item.ok) {
        if (record.accountedByNode !== true) accounted++;
        record.accountedByNode = true;
        record.accountedByNodeAt ??= new Date().toISOString();
      } else {
        delete record.accountedByNode;
        delete record.accountedByNodeAt;
      }
    };
    visit(canonical);
  }
  const validatedAttemptIds = currentlyAccounted.map((item) => item.attemptId).filter(Boolean);
  try { persistCanonicalLedger(storage, ledger); }
  catch (error) { return { accounted: 0, persistenceFailed: true, validatedAttemptIds: [], error: error.message, mismatchedEvidence: checked.filter((item) => !item.ok).length }; }
  return { accounted, persistenceFailed: false, validatedAttemptIds, mismatchedEvidence: checked.filter((item) => !item.ok).length, policyMismatch };
}

// On-demand on-chain settlement verification (stricter than accountedByNode).
// verifyReceiptOnChain is intentionally disabled pending a verified
// delivery-proof implementation: the first draft accepted deliveries with
// wrong payer/amount and empty proofs, and persisted a stale ledger after its
// network request. Re-enable only with full proof/root validation under the
// wallet lock (fresh re-read after every network call).
function readPendingDeposits(storage, wallet) {
  if (!storage) throw new Error("pending deposit storage is unavailable; refusing new funding");
  let raw;
  try { raw = storage.getItem(PENDING_DEPOSITS_KEY); } catch (error) { throw new Error(`pending deposit storage could not be read; refusing new funding: ${error.message}`); }
  let all = {};
  if (raw) { try { all = JSON.parse(raw); } catch (error) { throw new Error(`pending deposit storage is corrupt; refusing new funding: ${error.message}`); }
    if (!all || typeof all !== "object" || Array.isArray(all)) throw new Error("pending deposit storage has an invalid schema; refusing new funding"); }
  for (const [hash, record] of Object.entries(all)) {
    if (!record || typeof record !== "object" || (record.depositHash && record.depositHash !== hash)) throw new Error("pending deposit storage has an invalid record; refusing new funding");
  }
  return Object.values(all).filter((record) => record?.wallet?.toLowerCase() === wallet.toLowerCase() && record.status !== "resolved");
}

function markPendingDepositStatus(storage, depositHash, status) {
  let all = {};
  try { const raw = storage.getItem(PENDING_DEPOSITS_KEY); all = JSON.parse(raw) ?? {}; } catch { all = {}; }
  if (!all[depositHash]) throw new Error("pending deposit record is missing for " + status);
  all[depositHash].status = status;
  all[depositHash].updatedAt = new Date().toISOString();
  const serialized = JSON.stringify(all);
  storage.setItem(PENDING_DEPOSITS_KEY, serialized);
  if (storage.getItem(PENDING_DEPOSITS_KEY) !== serialized) throw new Error("pending deposit status could not be saved");
}

function recordPendingDeposit(storage, wallet, { approveHash, depositHash, amountMicro, depositedBefore, status = "submitted", network, diamond }) {
  if (!storage) return false;
  let all = {};
  try { const raw = storage.getItem(PENDING_DEPOSITS_KEY); if (raw) { const parsed = JSON.parse(raw); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) all = parsed; } } catch { all = {}; }
  all[depositHash] = {
    wallet: wallet.toLowerCase(), approveHash, depositHash,
    amountMicro: String(amountMicro), depositedBefore: String(depositedBefore),
    status, network: network ?? null, diamond: String(diamond ?? "").toLowerCase() || null,
    recordedAt: new Date().toISOString(),
  };
  const serialized = JSON.stringify(all);
  storage.setItem(PENDING_DEPOSITS_KEY, serialized);
  if (storage.getItem(PENDING_DEPOSITS_KEY) !== serialized) throw new Error("pending deposit record could not be saved");
}

async function resolvePendingDeposits(storage, wallet, ledgerAccount, { network, diamond, provider, verifiedDepositHash } = {}) {
  if (!storage) return { resolved: 0, remaining: 0 };
  const pending = readPendingDeposits(storage, wallet);
  let resolved = 0;
  let remaining = 0;
  if (pending.length === 0) return { resolved, remaining };
  let all = JSON.parse(storage.getItem(PENDING_DEPOSITS_KEY) || "{}");
  for (const record of pending) {
    const canonical = all[record.depositHash];
    if (!canonical) { remaining++; continue; }
    if (canonical.status === "reverted") { remaining++; continue; }
    if (canonical.network !== network || canonical.diamond?.toLowerCase() !== diamond?.toLowerCase()) { remaining++; continue; }
    let verifiedStatus = canonical.depositHash === verifiedDepositHash ? "0x1" : null;
    if (!verifiedStatus && provider && typeof provider.request === "function" && typeof canonical.depositHash === "string" && HASH_PATTERN.test(canonical.depositHash)) {
      try {
        const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [canonical.depositHash] });
        if (receipt?.transactionHash?.toLowerCase() === canonical.depositHash.toLowerCase() && ["0x0", "0x1"].includes(receipt.status)) verifiedStatus = receipt.status;
      } catch { /* no verified receipt: keep the durable pending state */ }
    }
    if (verifiedStatus === "0x0") { canonical.status = "reverted"; canonical.updatedAt = new Date().toISOString(); remaining++; continue; }
    if (verifiedStatus !== "0x1") { remaining++; continue; }
    canonical.status = "confirmed";
    const delta = BigInt(ledgerAccount.deposited) - BigInt(canonical.depositedBefore);
    if (delta >= BigInt(canonical.amountMicro)) { canonical.status = "resolved"; canonical.resolvedAt = new Date().toISOString(); resolved++; }
    else remaining++;
  }
  const serialized = JSON.stringify(all);
  storage.setItem(PENDING_DEPOSITS_KEY, serialized);
  if (storage.getItem(PENDING_DEPOSITS_KEY) !== serialized) throw new Error("pending deposit resolution could not be saved");
  return { resolved, remaining };
}


export async function fundEscrow({ provider, wallet, usdc, diamond, amountMicro, storage = globalThis.localStorage, isCurrent = () => true, waitForReceipt = waitForTransaction, onStage = () => {}, fetchImpl = globalThis.fetch, pollAttempts = 5, pollMs = 2000, pendingDepositOverride = false, network = "eip155:11155111" }) {
  const normalizedWallet = assertAddress(wallet, "wallet");
  return await withLock(`lock:fund:${normalizedWallet}`, async () => {
    await assertSepolia(provider, normalizedWallet, isCurrent);
    const normalizedUsdc = assertAddress(usdc, "usdc");
    const normalizedDiamond = assertAddress(diamond, "diamond");
    const amount = amountMicro === undefined ? FUNDING_AMOUNT_MICRO : BigInt(amountMicro);
    if (amount <= 0n) throw new RangeError("funding amount must be greater than zero");

    // Durable storage must be verified BEFORE any transaction: the pending
    // guard and the submitted-hash record depend on it. Missing or corrupt
    // storage fails closed instead of allowing an untracked deposit.
    try {
      const probe = "__leaderlight_storage_probe__";
      storage.setItem(probe, "1");
      if (storage.getItem(probe) !== "1") throw new Error("readback failed");
      storage.removeItem?.(probe);
    } catch (error) {
      throw new Error(`durable storage unavailable; refusing to fund: ${String(error?.message ?? error).slice(0, 120)}`);
    }

    // Cross-tab / repeat-funding guard: a confirmed-but-unindexed deposit
    // (bound to wallet, network and Diamond) blocks new funding until the node
    // ledger reflects it, or an explicit override is supplied.
    const unresolvedPending = readPendingDeposits(storage, normalizedWallet)
      .filter((record) => !["resolved", "reverted"].includes(record.status) &&
        (!record.network || !record.diamond || (record.network === network && record.diamond?.toLowerCase() === normalizedDiamond.toLowerCase())));
    if (unresolvedPending.length > 0 && !pendingDepositOverride) {
      const first = unresolvedPending[0];
      throw new Error(`A previous deposit of ${first.amountMicro} µUSDC is confirmed on-chain but not yet reflected in the node ledger (tx ${first.depositHash}). Refresh balances; do not deposit again until it appears.`);
    }

    const allowanceData = encodeFunctionCall(ERC20_ALLOWANCE_SELECTOR, ["address", "address"], [normalizedWallet, normalizedDiamond]);
    const before = await fetchNodeLedger(normalizedWallet, fetchImpl);
    onStage("approval_pending", { needed: amount.toString() });
    await assertSepolia(provider, normalizedWallet, isCurrent);
    const approveTx = { from: normalizedWallet, to: normalizedUsdc, data: encodeFunctionCall(ERC20_APPROVE_SELECTOR, ["address", "uint256"], [normalizedDiamond, amount]), gas: "0x186a0" };
    approveTx.gas = await estimatedGas(provider, approveTx);
    await assertSepolia(provider, normalizedWallet, isCurrent);
    const approveHash = await provider.request({ method: "eth_sendTransaction", params: [approveTx] });
    try { await waitForReceipt(provider, approveHash); }
    catch (error) {
      const unknown = new Error(`approval submitted (tx ${approveHash}) but its receipt is ${error?.transactionStatus === "reverted" ? "reverted" : "unknown"}: ${String(error?.message ?? error)}. Check this hash before retrying.`);
      unknown.transactionHash = approveHash;
      unknown.pendingState = error?.transactionStatus === "reverted" ? "reverted" : "unknown";
      throw unknown;
    }
    await assertSepolia(provider, normalizedWallet, isCurrent);
    const allowanceAfter = await readUint(provider, normalizedUsdc, allowanceData, normalizedWallet);
    if (allowanceAfter < amount) throw new Error("USDC approval receipt confirmed, but allowance is insufficient for the deposit");
    onStage("approval_confirmed", { approveHash, allowance: allowanceAfter.toString() });
    onStage("deposit_pending", { amount: amount.toString(), depositedBefore: before.deposited.toString() });
    await assertSepolia(provider, normalizedWallet, isCurrent);
    let receiptStatus = null;
    let pendingPersistenceFailed = null;
    const depositTx = { from: normalizedWallet, to: normalizedDiamond, data: encodeFunctionCall(DEPOSIT_SELECTOR, ["uint256"], [amount]), gas: "0x30d40" };
    try { depositTx.gas = await estimatedGas(provider, depositTx); }
    catch (error) {
      const approvalOnly = new Error(`USDC approval confirmed (tx ${approveHash}); deposit was not sent because ${String(error?.message ?? error)}`);
      approvalOnly.transactionHash = approveHash;
      approvalOnly.pendingState = "approval_confirmed";
      throw approvalOnly;
    }
    await assertSepolia(provider, normalizedWallet, isCurrent);
    const depositHash = await provider.request({ method: "eth_sendTransaction", params: [depositTx] });

    // Record the submitted hash IMMEDIATELY — before waiting for the receipt —
    // so a reload or a second tab sees the in-flight deposit and never repeats it.
    try {
      await withLock(`lock:escrow:${normalizedWallet}`, async () => {
        recordPendingDeposit(storage, normalizedWallet, {
          approveHash: null, depositHash,
          amountMicro: amount, depositedBefore: before.deposited,
          status: "submitted", network, diamond: normalizedDiamond,
        });
      });
    } catch (error) {
      const lostGuard = new Error(`deposit submitted (tx ${depositHash}) but its pending guard could not be saved: ${String(error?.message ?? error).slice(0, 120)}. Do not deposit again; verify this transaction before retrying.`);
      lostGuard.depositHash = depositHash;
      lostGuard.pendingState = "unknown";
      throw lostGuard;
    }

    try {
      const receipt = await waitForReceipt(provider, depositHash);
      receiptStatus = receipt?.status ?? null;
    } catch (error) {
      // The transaction was submitted and its hash is durably recorded; an
      // unknown state must stay unknown (never look like a failed deposit).
    try {
      await withLock(`lock:escrow:${normalizedWallet}`, async () => {
        markPendingDepositStatus(storage, depositHash, error?.transactionStatus === "reverted" ? "reverted" : "unknown");
      })
    } catch (error) {
      pendingPersistenceFailed = String(error?.message ?? error).slice(0, 120);
    }
      if (error?.transactionStatus === "reverted") {
        const reverted = new Error(`deposit transaction reverted (tx ${depositHash}); no deposit was made and the pending guard is cleared for this attempt.`);
        reverted.depositHash = depositHash;
        reverted.pendingState = "reverted";
        throw reverted;
      }
      const unknown = new Error(`deposit submitted (tx ${depositHash}) but the receipt is unknown: ${String(error?.message ?? error).slice(0, 100)}. Do not deposit again — refresh balances or verify the transaction on the explorer.`);
      unknown.depositHash = depositHash;
      unknown.pendingState = "unknown";
      throw unknown;
    }
    await assertSepolia(provider, normalizedWallet, isCurrent);
    if (receiptStatus !== "0x1") {
    try {
      await withLock(`lock:escrow:${normalizedWallet}`, async () => {
        markPendingDepositStatus(storage, depositHash, "reverted");
      })
    } catch (error) {
      pendingPersistenceFailed = String(error?.message ?? error).slice(0, 120);
    }
      throw new Error(`deposit transaction reverted (tx ${depositHash})`);
    }
    try {
    await withLock(`lock:escrow:${normalizedWallet}`, async () => {
      markPendingDepositStatus(storage, depositHash, "confirmed");
    })
    } catch (error) {
      pendingPersistenceFailed = String(error?.message ?? error).slice(0, 120);
    }

    // Verify the ledger view, allowing for indexing delay: zero AND partial
    // deltas can lag. After the window, a zero delta stays an honest pending
    // (never a failed deposit); a short-but-indexed delta is a real mismatch.
    let after = null;
    let delta = null;
    let verificationError = null;
    try {
      after = await fetchNodeLedger(normalizedWallet, fetchImpl);
      delta = after.deposited - before.deposited;
    } catch (error) {
      verificationError = String(error?.message ?? error).slice(0, 160);
    }
    if (verificationError) {
      onStage("deposit_verification_unavailable", { depositHash, error: verificationError, expectedIncrease: amount.toString() });
      return { approveHash, depositHash, indexingPending: true, verificationError, pendingPersistenceFailed, pendingState: "confirmed", depositedMicro: before.deposited.toString(), balanceMicro: null, availableMicro: null };
    }
    if (delta < amount) {
      onStage("deposit_index_pending", { depositHash, depositedView: after.deposited.toString(), expectedIncrease: amount.toString() });
      for (let poll = 0; poll < pollAttempts && delta < amount; poll++) {
        await sleep(pollMs);
        if (!isCurrent()) throw new Error("Wallet account or network changed; aborting");
        try {
          after = await fetchNodeLedger(normalizedWallet, fetchImpl);
          delta = after.deposited - before.deposited;
        } catch (error) {
          verificationError = String(error?.message ?? error).slice(0, 160);
          break;
        }
      }
    }
    if (delta < amount) {
      onStage(verificationError ? "deposit_verification_unavailable" : delta === 0n ? "deposit_indexing_pending" : "deposit_partially_indexed", { depositHash, error: verificationError, depositedView: after?.deposited?.toString() ?? null, expectedIncrease: amount.toString() });
      return { approveHash, depositHash, indexingPending: true, verificationError, pendingPersistenceFailed, pendingState: "confirmed", partial: delta > 0n, depositedMicro: before.deposited.toString(), balanceMicro: after?.balance?.toString() ?? null, availableMicro: after?.available?.toString() ?? null };
    }
    try {
    await withLock(`lock:escrow:${normalizedWallet}`, async () => {
      await resolvePendingDeposits(storage, normalizedWallet, after, { network, diamond: normalizedDiamond, verifiedDepositHash: depositHash });
    })
    } catch (error) {
      pendingPersistenceFailed = String(error?.message ?? error).slice(0, 120);
    }
    onStage("deposit_confirmed", { depositHash, depositedMicro: after.deposited.toString(), balanceMicro: after.balance.toString(), availableMicro: after.available.toString() });
    return { approveHash, depositHash, indexingPending: false, pendingState: "resolved", pendingPersistenceFailed, depositedMicro: after.deposited.toString(), balanceMicro: after.balance.toString(), availableMicro: after.available.toString() };
  });
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
  confirmCharge,
  onAttempt = () => {},
}) {
  if (typeof fetchImpl !== "function") throw new TypeError("trusted Engine fetch implementation is required");
  await assertSepolia(provider, wallet, isCurrent);
  const normalizedWallet = assertAddress(wallet, "wallet");
  const requestId = await paymentRequestId(normalizedWallet, intent, params);
  const attemptId = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Fail-closed concurrency protection across tabs and in-tab calls for the same wallet
  return await withLock(`lock:escrow:${normalizedWallet}`, async () => {
    // Reconcile receipted attempts first: settled receipts stop reserving
    // spendable (the node's `available` already accounts for charged and unbilled
    // usage). A reconciliation failure keeps the conservative over-reserved state.
    let currentLedger = readAttemptLedger(storage);
    let freshValidatedAttemptIds = new Set();
    let migrated = false;
    for (const [id, record] of Object.entries(currentLedger.attempts)) {
      if (!record || typeof record !== "object") continue;
      if (record.wallet?.toLowerCase() !== normalizedWallet) continue;
      const flattened = flattenPriorAttempts(record).filter((prior) => prior.attemptId !== record.attemptId);
      if (JSON.stringify(record.priorAttempts ?? []) !== JSON.stringify(flattened)) {
        currentLedger.attempts[id] = { ...record, priorAttempts: flattened };
        migrated = true;
      }
    }
    if (migrated) {
      const serialized = JSON.stringify({ version: LEDGER_VERSION, attempts: currentLedger.attempts });
      try {
        storage.setItem(STORAGE_KEY, serialized);
        if (storage.getItem(STORAGE_KEY) !== serialized) throw new Error("persistence verification failed");
      } catch (error) {
        throw new Error(`payment history migration could not be saved; reconciliation required: ${error.message}`);
      }
    }
    const existing = currentLedger.attempts[requestId];
    let tokenAuthorized = false;
    let intents;
    try { intents = JSON.parse(storage.getItem(INTENT_KEY) || "{}"); } catch { throw new Error("assessment intent storage is unavailable; failing closed"); }
    tokenAuthorized = Boolean(intentToken && intents[requestId] === intentToken);

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

    // Revalidate historic protocol receipts against a fresh node accounting view on
    // every paid path. Do this after duplicate/unknown refusal checks, before any
    // new Engine request or signature, and before consuming a one-shot intent.
    const hasReceiptHistory = (currentLedger.history ?? []).some((item) => item.wallet?.toLowerCase() === normalizedWallet && item.status === "protocol_receipt");
    if (hasReceiptHistory) {
      const freshAccount = await fetchNodeLedger(normalizedWallet, fetchImpl);
      const reconciled = reconcileAccountedReceipts(storage, normalizedWallet, { diamond: payTo, network, ledgerAccount: freshAccount });
      freshValidatedAttemptIds = new Set(reconciled.validatedAttemptIds ?? []);
      currentLedger = readAttemptLedger(storage);
    }

    // Consume a matching repeat token only after all refusal checks pass, still under the wallet lock.
    if (tokenAuthorized) {
      delete intents[requestId];
      try { storage.setItem(INTENT_KEY, JSON.stringify(intents)); } catch { throw new Error("assessment intent could not be consumed; failing closed"); }
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
          wallet: normalizedWallet, intent, params, runId: runId ?? null, network, payTo, diamond: payTo, status: "definitive_unpaid",
          authorizationStarted: false, error: `Engine HTTP ${first.status}: ${errorText}`,
        });
        throw new Error(`Engine HTTP ${first.status}`);
      }
      const answer = await first.json();
      const answerMatches = isMatchingAnswer(answer, { intent, params });
      const attempt = saveAttempt(storage, requestId, {
        attemptId,
        wallet: normalizedWallet, intent, params, runId: runId ?? null, network, payTo, diamond: payTo, status: "answered_without_payment",
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
      // The run cap is a hard per-run budget: every attempt in this run counts,
      // settled or not. Settled receipts are reconciled for spendable display and
      // for the legacy (cross-run) reservation below, not here.
      runReservedMicro = allAttempts
        .filter((attempt) => {
          if (!attempt.wallet || attempt.wallet.toLowerCase() !== normalizedWallet) return false;
          if (attempt.runId !== runId) return false;
          return attempt.authorizationStarted && attempt.status !== "definitive_unpaid" && attempt.status !== "signature_rejected";
        })
        .reduce((sum, attempt) => sum + (typeof attempt.amountMicro === "string" ? BigInt(attempt.amountMicro) : 0n), 0n);
    } else {
      // Legacy un-scoped fallback for callers without runId: settled receipts are
      // reconciled against the node ledger (the node's `available` already accounts
      // for them), so they stop reserving forever here.
      runReservedMicro = allAttempts
        .filter((attempt) => {
          return attempt.authorizationStarted && attempt.status !== "definitive_unpaid" && attempt.status !== "signature_rejected" &&
            !(attempt.status === "protocol_receipt" && freshValidatedAttemptIds.has(attempt.attemptId));
        })
        .reduce((sum, attempt) => sum + (typeof attempt.amountMicro === "string" ? BigInt(attempt.amountMicro) : 0n), 0n);
    }

    const validated = validateEscrowChallenge(challenge, {
      wallet: normalizedWallet, network, payTo, origin, resource, requestUrl, runReservedMicro,
    });

    if (confirmCharge) {
      if (!await confirmCharge(validated.amount)) {
        const error = new Error("Payment review canceled before signing.");
        error.code = "PAYMENT_REVIEW_CANCELED";
        throw error;
      }
      await assertSepolia(provider, normalizedWallet, isCurrent);
    }

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

    let pending;
    try {
      pending = saveAttempt(storage, requestId, {
        attemptId,
        wallet: normalizedWallet, intent, params, runId: runId ?? null, network, payTo, diamond: payTo, status: "authorization_pending",
        authorizationStarted: true, amountMicro: String(validated.amount),
        answer: null, receipt: null,
      });
    } catch (error) {
      throw new Error(`payment outcome could not be saved before signing; no payment was authorized: ${error.message}`);
    }
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
      // Telegraph receipts use the on-chain registration ID. The answer uses the Engine routing ID.
      const receiptField = escrowReceiptValidationIssue(receipt, {
        intent, amount: validated.amount, payer: normalizedWallet,
      });
      const receiptValid = receiptField === null;
      const receiptIssue = receiptValid ? null
        : !encodedReceipt ? "missing"
        : receipt === null ? "unreadable"
        : "invalid";
      const answerMatches = isMatchingAnswer(responseData, { intent, params });
      const status = receiptValid ? "protocol_receipt" : "unknown";
      const saved = saveAttempt(storage, requestId, {
        ...pending, status, authorizationStarted: true, answer: responseData,
        answerMatches, receipt,
        receiptValid, receiptIssue, receiptField: receiptIssue === "invalid" ? receiptField : null, httpStatus: response.status,
        miner: receiptValid ? receipt.miner : null,
        routingMinerId: responseData?.miner_id ?? null,
        nodeResponseEvidence: receiptValid ? {
          version: 1, wallet: normalizedWallet, network, diamond: payTo,
          intent, miner: receipt.miner,
          amountMicro: String(validated.amount), receiptHash: receipt.receipt_hash,
        } : null,
      });
      onAttempt(saved);
      if (!response.ok) throw new Error(`Engine HTTP ${response.status} after authorization`);
      return {
        requestId,
        attemptId,
        answer: responseData,
        answerMatches,
        receipt: receiptValid ? receipt : null,
        receiptIssue,
        receiptField: receiptIssue === "invalid" ? receiptField : null,
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
