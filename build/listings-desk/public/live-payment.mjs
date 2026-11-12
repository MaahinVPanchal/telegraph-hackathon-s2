const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;
const UINT_PATTERN = /^(0|[1-9]\d*)$/;
const STORAGE_KEY = "leaderlight.live-attempts.v1";
const LEDGER_VERSION = 1;
const LIVE_CHAIN_ID = "0xaa36a7";
const RUN_CAP_MICRO = 20_000n;
const CALL_CAP_MICRO = 10_000n;
const FUNDING_AMOUNT_MICRO = 3_000_000n;
const DEPOSIT_SELECTOR = "0xf688bcfb";

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
  const amountText = exactlyOneLine(template, "Amount");
  const amountMatch = /^(\d+) uUSDC$/.exec(amountText);
  if (!amountMatch) throw new TypeError("challenge amount is malformed");
  const amount = BigInt(amountMatch[1]);
  if (amount <= 0n || amount > CALL_CAP_MICRO || BigInt(runReservedMicro) + amount > RUN_CAP_MICRO) {
    throw new RangeError("challenge exceeds the per-call or per-run payment limit");
  }
  for (const [field, placeholder] of [
    ["Wallet", "{from}"],
    ["Nonce", "{nonce}"],
    ["Valid After", "{validAfter}"],
    ["Valid Before", "{validBefore}"],
  ]) {
    if (exactlyOneLine(template, field) !== placeholder || template.split(placeholder).length !== 2) {
      throw new TypeError(`challenge template must bind ${field} to exactly ${placeholder}`);
    }
  }
  return { entry, template, amount, payer, payTo: trustedPayTo, network };
}

export function validateEscrowReceipt(receipt, { intent, amount, payer, minerId } = {}) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return false;
  if (!HASH_PATTERN.test(receipt.receipt_hash ?? "") ||
      receipt.rail !== "escrow" ||
      typeof receipt.payer !== "string" ||
      receipt.payer.toLowerCase() !== String(payer).toLowerCase() ||
      !((typeof receipt.miner === "string" && receipt.miner.trim()) ||
        (Number.isSafeInteger(receipt.miner) && receipt.miner > 0)) ||
      String(receipt.intent) !== intent ||
      typeof receipt.amount_uusdc !== "string" ||
      !UINT_PATTERN.test(receipt.amount_uusdc) ||
      BigInt(receipt.amount_uusdc) !== BigInt(amount) ||
      !Number.isSafeInteger(receipt.epoch_id) || receipt.epoch_id < 0 ||
      receipt.settlement !== "epoch" || receipt.chain !== "telegraph" ||
      !Number.isSafeInteger(receipt.timestamp) || receipt.timestamp < 0) return false;
  if (minerId != null && String(receipt.miner) !== String(minerId)) return false;
  return true;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function isMatchingAnswer(data, { intent, params } = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      data.intent !== intent || !data.input || typeof data.input !== "object" ||
      Array.isArray(data.input)) return false;
  return JSON.stringify(stable(data.input)) === JSON.stringify(stable(params));
}

export function readAttemptLedger(storage = globalThis.localStorage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (error) {
    throw new Error(`payment attempt storage is unavailable: ${error.message}`);
  }
  if (raw == null) return { version: LEDGER_VERSION, attempts: {} };
  let ledger;
  try {
    ledger = JSON.parse(raw);
  } catch {
    throw new Error("saved payment attempts are malformed; reconcile before another payment");
  }
  if (ledger?.version !== LEDGER_VERSION || !ledger.attempts ||
      typeof ledger.attempts !== "object" || Array.isArray(ledger.attempts)) {
    throw new Error("saved payment attempts are unsupported; reconcile before another payment");
  }
  return ledger;
}

export function saveAttempt(storage, requestId, attempt) {
  if (!/^sha256:[0-9a-f]{64}$/.test(requestId)) throw new TypeError("stable payment request ID is required");
  const ledger = readAttemptLedger(storage);
  ledger.attempts[requestId] = { ...attempt, requestId, updatedAt: new Date().toISOString() };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(ledger));
    if (storage.getItem(STORAGE_KEY) !== JSON.stringify(ledger)) {
      throw new Error("payment attempt did not persist");
    }
  } catch (error) {
    throw new Error(`payment outcome could not be saved: ${error.message}`);
  }
  return ledger.attempts[requestId];
}

export async function paymentRequestId(wallet, intent, params) {
  const input = JSON.stringify(stable({ wallet: assertAddress(wallet, "wallet"), intent, params }));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function assertSepolia(provider, wallet, isCurrent = () => true) {
  if (!provider || typeof provider.request !== "function") throw new Error("selected MetaMask provider is unavailable");
  const [chainId, accounts] = await Promise.all([
    provider.request({ method: "eth_chainId" }),
    provider.request({ method: "eth_accounts" }),
  ]);
  if (String(chainId).toLowerCase() !== LIVE_CHAIN_ID) throw new Error("Switch MetaMask to Ethereum Sepolia (chain ID 11155111) before continuing.");
  if (!Array.isArray(accounts) || !accounts.some((account) => account.toLowerCase() === wallet.toLowerCase())) {
    throw new Error("The selected MetaMask account changed; reconnect before continuing.");
  }
  if (!isCurrent()) throw new Error("Wallet account or network changed during this request.");
}

export async function waitForTransaction(provider, hash, { pollMs = 1000, timeoutMs = 120_000, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now } = {}) {
  if (!HASH_PATTERN.test(hash ?? "")) throw new Error("wallet returned an invalid transaction hash");
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const receipt = await provider.request({
      method: "eth_getTransactionReceipt",
      params: [hash],
    });
    if (receipt) {
      if (typeof receipt.transactionHash !== "string" ||
          receipt.transactionHash.toLowerCase() !== hash.toLowerCase() ||
          receipt.status !== "0x1") {
        throw new Error(`transaction ${hash} reverted or returned a mismatched receipt`);
      }
      return receipt;
    }
    await sleep(pollMs);
  }
  throw new Error(`transaction ${hash} is still pending; funding is not confirmed`);
}

async function readUint(provider, to, data, wallet) {
  const result = await provider.request({
    method: "eth_call",
    params: [{ to, data }, "latest"],
  });
  if (typeof result !== "string" || !/^0x[0-9a-f]+$/i.test(result)) throw new Error("wallet returned an invalid contract read");
  return BigInt(result);
}

export async function mintTestUsdc({ provider, wallet, usdc, isCurrent }) {
  await assertSepolia(provider, wallet, isCurrent);
  const data = encodeFunctionCall("0x40c10f19", ["address", "uint256"], [wallet, 10_000_000n]);
  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from: wallet, to: usdc, data, gas: "0x186a0" }],
  });
  await waitForTransaction(provider, hash);
  await assertSepolia(provider, wallet, isCurrent);
  return hash;
}

export async function fundEscrow({ provider, wallet, usdc, diamond, isCurrent, waitForReceipt = waitForTransaction }) {
  await assertSepolia(provider, wallet, isCurrent);
  const allowanceData = encodeFunctionCall("0xdd62ed3e", ["address", "address"], [wallet, diamond]);
  const approveData = encodeFunctionCall("0x095ea7b3", ["address", "uint256"], [diamond, FUNDING_AMOUNT_MICRO]);
  const approveHash = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from: wallet, to: usdc, data: approveData, gas: "0x186a0" }],
  });
  await waitForReceipt(provider, approveHash);
  await assertSepolia(provider, wallet, isCurrent);
  const allowanceAfter = await readUint(provider, usdc, allowanceData, wallet);
  if (allowanceAfter < FUNDING_AMOUNT_MICRO) {
    throw new Error("USDC approval receipt confirmed, but allowance is insufficient for the deposit");
  }
  const escrowBalanceData = encodeFunctionCall("0x55af6353", ["address"], [wallet]);
  const balanceBefore = await readUint(provider, diamond, escrowBalanceData, wallet);
  const depositData = encodeFunctionCall(DEPOSIT_SELECTOR, ["uint256"], [FUNDING_AMOUNT_MICRO]);
  const depositHash = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from: wallet, to: diamond, data: depositData, gas: "0x30d40" }],
  });
  await waitForReceipt(provider, depositHash);
  await assertSepolia(provider, wallet, isCurrent);
  const balanceAfter = await readUint(provider, diamond, escrowBalanceData, wallet);
  if (balanceAfter < balanceBefore + FUNDING_AMOUNT_MICRO) {
    throw new Error("deposit receipt confirmed, but escrow balance did not increase by 3 USDC");
  }
  return { approveHash, depositHash, balanceMicro: balanceAfter.toString() };
}

export async function performPaidAsk({
  provider,
  wallet,
  intent,
  params,
  requestUrl,
  fetchImpl = fetch,
  storage = globalThis.localStorage,
  network = "eip155:11155111",
  payTo,
  origin,
  resource = "/v1/ask",
  isCurrent = () => true,
  onAttempt = () => {},
}) {
  const requestId = await paymentRequestId(wallet, intent, params);
  const ledger = readAttemptLedger(storage);
  const previous = ledger.attempts[requestId];
  if (previous?.authorizationStarted || previous?.status === "protocol_receipt" || previous?.status === "unknown") {
    throw new Error("This request may already have been authorized. Reconcile its saved outcome before retrying.");
  }
  const body = JSON.stringify({ intent, params });
  saveAttempt(storage, requestId, {
    wallet: wallet.toLowerCase(), intent, params, status: "request_started",
    authorizationStarted: false, answer: null, receipt: null,
  });
  let first;
  try {
    first = await fetchImpl(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch (error) {
    saveAttempt(storage, requestId, {
      wallet: wallet.toLowerCase(), intent, params, status: "no_payment_response",
      authorizationStarted: false, answer: null, receipt: null, error: String(error?.message ?? error),
    });
    throw error;
  }
  if (first.status !== 402) {
    if (!first.ok) {
      saveAttempt(storage, requestId, {
        wallet: wallet.toLowerCase(), intent, params, status: "no_payment_response",
        authorizationStarted: false, answer: null, receipt: null, error: `Engine HTTP ${first.status}`,
      });
      throw new Error(`Engine HTTP ${first.status}`);
    }
    const answer = await first.json();
    const answerMatches = isMatchingAnswer(answer, { intent, params });
    const attempt = saveAttempt(storage, requestId, {
      wallet: wallet.toLowerCase(), intent, params, status: "answered_without_payment",
      authorizationStarted: false, answer, answerMatches, receipt: null,
    });
    onAttempt(attempt);
    return { requestId, answer, receipt: null, paymentStatus: "not_authorized", answerMatches, amountMicro: null };
  }
  const challenge = await first.json();
  await assertSepolia(provider, wallet, isCurrent);
  const currentLedger = readAttemptLedger(storage);
  const runReservedMicro = Object.values(currentLedger.attempts)
    .filter((attempt) => attempt.authorizationStarted && attempt.status !== "definitive_unpaid")
    .reduce((sum, attempt) => sum + (typeof attempt.amountMicro === "string" ? BigInt(attempt.amountMicro) : 0n), 0n);
  const validated = validateEscrowChallenge(challenge, {
    wallet, network, payTo, origin, resource, requestUrl, runReservedMicro,
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
    wallet: wallet.toLowerCase(), intent, params, status: "authorization_pending",
    authorizationStarted: true, amountMicro: String(validated.amount),
    answer: null, receipt: null,
  });
  onAttempt(pending);
  let signature;
  try {
    signature = await provider.request({ method: "personal_sign", params: [message, wallet] });
  } catch (error) {
    const rejected = saveAttempt(storage, requestId, {
      ...pending, status: error?.code === 4001 ? "signature_rejected" : "unknown",
      authorizationStarted: error?.code !== 4001,
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
    await assertSepolia(provider, wallet, isCurrent);
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
      intent, amount: validated.amount, payer: wallet, minerId: responseData?.miner_id,
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
      answer: responseData,
      answerMatches,
      receipt: receiptValid ? receipt : null,
      paymentStatus: status,
      amountMicro: String(validated.amount),
    };
  } catch (error) {
    const current = readAttemptLedger(storage).attempts[requestId];
    if (current?.status !== "protocol_receipt") {
      const unknown = saveAttempt(storage, requestId, {
        ...pending, status: "unknown", authorizationStarted: true,
        error: String(error?.message ?? error),
      });
      onAttempt(unknown);
    }
    throw error;
  }
}

export const LIVE_PAYMENT_LIMITS = Object.freeze({
  callMicro: String(CALL_CAP_MICRO),
  runMicro: String(RUN_CAP_MICRO),
  fundingMicro: String(FUNDING_AMOUNT_MICRO),
  chainId: LIVE_CHAIN_ID,
});
