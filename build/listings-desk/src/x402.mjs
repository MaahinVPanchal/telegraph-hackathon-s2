import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { usdToMicro } from "./config.mjs";

const pExecFile = promisify(execFile);

export class PaymentPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "PaymentPolicyError";
    this.paymentPolicyRejected = true;
  }
}

export class PaymentPolicy {
  constructor({ maxUsdPerRunMicros, maxUsdPerIntentMicros }) {
    if (typeof maxUsdPerRunMicros !== "bigint" || typeof maxUsdPerIntentMicros !== "bigint" ||
        maxUsdPerRunMicros <= 0n || maxUsdPerIntentMicros <= 0n) {
      throw new PaymentPolicyError("payment caps must be positive integer micro-USDC values");
    }
    this.maxUsdPerRunMicros = maxUsdPerRunMicros;
    this.maxUsdPerIntentMicros = maxUsdPerIntentMicros;
    this.reservations = new Map();
    this.sequence = 0;
  }

  reserve(intent, amount, requestId) {
    if (typeof intent !== "string" || !intent) throw new PaymentPolicyError("payment intent is required");
    if (typeof amount !== "bigint" || amount <= 0n) throw new PaymentPolicyError("challenge amount must be positive integer micro-USDC");
    if (typeof requestId !== "string" || !/^sha256:[0-9a-f]{64}$/.test(requestId)) {
      throw new PaymentPolicyError("stable payment request ID is required");
    }
    const matchingReservations = [...this.reservations.values()].filter((reservation) => reservation.requestId === requestId);
    if (matchingReservations.some((reservation) => reservation.intent !== intent)) {
      throw new PaymentPolicyError("payment request ID cannot be reused for a different intent");
    }
    const activeDuplicate = matchingReservations.find((reservation) => reservation.status !== "failed");
    if (activeDuplicate) {
      throw new PaymentPolicyError(`duplicate payment request ID is ${activeDuplicate.status}`);
    }
    const active = [...this.reservations.values()].filter((r) => r.status !== "failed");
    const runTotal = active.reduce((sum, r) => sum + r.amount, 0n);
    const intentTotal = active.filter((r) => r.intent === intent).reduce((sum, r) => sum + r.amount, 0n);
    if (intentTotal + amount > this.maxUsdPerIntentMicros) {
      throw new PaymentPolicyError(`intent cap exceeded for ${intent}`);
    }
    if (runTotal + amount > this.maxUsdPerRunMicros) {
      throw new PaymentPolicyError("run cap exceeded");
    }
    const id = `reservation-${++this.sequence}`;
    this.reservations.set(id, { id, intent, amount, requestId, status: "reserved" });
    return id;
  }

  transition(id, status) {
    const reservation = this.reservations.get(id);
    if (!reservation) throw new PaymentPolicyError(`unknown reservation: ${id}`);
    const allowed = {
      reserved: ["in_flight", "failed"],
      in_flight: ["settled", "failed", "unknown"],
      unknown: ["settled", "failed"],
      settled: [],
      failed: [],
    };
    if (!allowed[reservation.status].includes(status)) {
      throw new PaymentPolicyError(`invalid reservation transition ${reservation.status} -> ${status}`);
    }
    reservation.status = status;
  }

  snapshot() {
    const active = [...this.reservations.values()].filter((r) => r.status !== "failed");
    return {
      maxRunMicro: String(this.maxUsdPerRunMicros),
      maxIntentMicro: String(this.maxUsdPerIntentMicros),
      reservedOrAuthorizedMicro: String(active.reduce((sum, r) => sum + r.amount, 0n)),
      reservations: [...this.reservations.values()].map((r) => ({
        id: r.id, requestId: r.requestId, intent: r.intent, amountMicro: String(r.amount), status: r.status,
      })),
    };
  }
}

export class EscrowSigner {
  constructor(privateKey, castPath = "cast") {
    if (!privateKey) throw new Error("WALLET_PRIVATE_KEY is required for real mode");
    this.privateKey = privateKey;
    this.castPath = castPath;
    this.address = null;
  }

  async walletAddress() {
    if (!this.address) {
      const { stdout } = await pExecFile(this.castPath, ["wallet", "address", "--private-key", this.privateKey]);
      this.address = stdout.trim().toLowerCase();
    }
    return this.address;
  }

  async personalSign(message) {
    const { stdout } = await pExecFile(this.castPath, [
      "wallet", "sign", "--private-key", this.privateKey, message,
    ]);
    return stdout.trim();
  }
}

function oneLine(message, name) {
  const lines = message.split(/\r?\n/).filter((line) => line.startsWith(`${name}:`));
  if (lines.length !== 1) throw new PaymentPolicyError(`challenge template must contain exactly one ${name} line`);
  return lines[0].slice(name.length + 1).trim();
}

function amountFromTemplate(message) {
  const amountText = oneLine(message, "Amount");
  const match = /^(\d+) uUSDC$/.exec(amountText);
  if (!match) throw new PaymentPolicyError("challenge template has a missing or malformed Amount");
  const amount = BigInt(match[1]);
  if (amount <= 0n) throw new PaymentPolicyError("challenge amount must be positive");
  return amount;
}

function validateChallenge(challenge, url, expected) {
  if (!expected || typeof expected !== "object") {
    throw new PaymentPolicyError("trusted escrow expectations are required before signing");
  }
  const { network, payTo, origin, resource } = expected;
  if (typeof network !== "string" || !/^eip155:\d+$/.test(network) ||
      typeof payTo !== "string" || !/^0x[0-9a-f]{40}$/i.test(payTo) ||
      typeof origin !== "string" || typeof resource !== "string" || !resource.startsWith("/")) {
    throw new PaymentPolicyError("trusted escrow network, payee, origin and resource must be explicitly configured");
  }
    console.log("POLICY DEBUG:", JSON.stringify({ requestOrigin: new URL(url).origin, actualResource: new URL(url).pathname }));
  const requestUrl = new URL(url);
    const actualResource = requestUrl.pathname.replace(/^\/engine(?=\/)/, "");
  if (requestUrl.origin !== origin || actualResource !== resource) {
    throw new PaymentPolicyError("request origin/resource does not match trusted escrow configuration");
  }
  if (!challenge || !Array.isArray(challenge.accepts)) throw new PaymentPolicyError("malformed 402 challenge");
  const entries = challenge.accepts.filter((entry) => entry?.scheme === "escrow");
  if (entries.length !== 1) throw new PaymentPolicyError("challenge must contain exactly one escrow scheme");
  const entry = entries[0];
  if (entry.network !== network || typeof entry.payTo !== "string" ||
      entry.payTo.toLowerCase() !== payTo.toLowerCase()) {
    throw new PaymentPolicyError("challenge network or payee does not match trusted configuration");
  }
  const template = entry.extra?.message;
  if (typeof template !== "string" || !template) throw new PaymentPolicyError("challenge message template is missing");
  if (entry.extra?.resource !== resource ||
      oneLine(template, "Network") !== network ||
      oneLine(template, "Resource") !== resource ||
      oneLine(template, "Pay To").toLowerCase() !== payTo.toLowerCase()) {
    throw new PaymentPolicyError("challenge template does not match its envelope or trusted configuration");
  }
  for (const [field, placeholder] of [
    ["Wallet", "{from}"],
    ["Nonce", "{nonce}"],
    ["Valid After", "{validAfter}"],
    ["Valid Before", "{validBefore}"],
  ]) {
    if (oneLine(template, field) !== placeholder || template.split(placeholder).length !== 2) {
      throw new PaymentPolicyError(`challenge template must bind ${field} to exactly ${placeholder}`);
    }
  }
  return { entry, template, amount: amountFromTemplate(template) };
}

async function signChallenge(signer, challenge, { url, expected, policy, intent, requestId, now, nonceFactory }) {
  const validated = validateChallenge(challenge, url, expected);
  const reservationId = policy.reserve(intent, validated.amount, requestId);
  try {
    const from = (await signer.walletAddress()).toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(from)) throw new PaymentPolicyError("signer returned an invalid wallet address");
    const nowMs = now();
    if (!Number.isSafeInteger(nowMs) || nowMs <= 0) throw new PaymentPolicyError("clock did not return a valid millisecond timestamp");
    const timestamp = Math.floor(nowMs / 1000);
    const nonce = nonceFactory();
    if (typeof nonce !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(nonce)) {
      throw new PaymentPolicyError("nonce factory returned an invalid nonce");
    }
    const authorization = {
      from,
      to: validated.entry.payTo,
      value: String(validated.amount),
      validAfter: String(timestamp - 5),
      validBefore: String(timestamp + 100),
      nonce,
    };
    const message = validated.template
      .replace("{from}", authorization.from)
      .replace("{nonce}", authorization.nonce)
      .replace("{validAfter}", authorization.validAfter)
      .replace("{validBefore}", authorization.validBefore);
    const signature = await signer.personalSign(message);
    if (typeof signature !== "string" || !/^0x(?:[0-9a-f]{2})+$/i.test(signature)) {
      throw new PaymentPolicyError("signer returned a malformed signature");
    }
    const envelope = {
      x402Version: 2,
      scheme: "escrow",
      network: validated.entry.network,
      payload: { signature, authorization },
    };
    policy.transition(reservationId, "in_flight");
    return {
      header: Buffer.from(JSON.stringify(envelope), "utf8").toString("base64"),
      reservationId,
      amount: validated.amount,
      authorization,
    };
  } catch (error) {
    policy.transition(reservationId, "failed");
    throw error;
  }
}

export function validateEscrowReceipt(receipt, { intent, amount, payer }) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return false;
  return /^0x[0-9a-f]{64}$/i.test(receipt.receipt_hash ?? "") &&
    receipt.rail === "escrow" &&
    typeof receipt.payer === "string" && receipt.payer.toLowerCase() === payer.toLowerCase() &&
    ((typeof receipt.miner === "string" && receipt.miner.trim()) || Number.isSafeInteger(receipt.miner)) &&
    String(receipt.intent) === intent &&
    typeof receipt.amount_uusdc === "string" && /^\d+$/.test(receipt.amount_uusdc) &&
    BigInt(receipt.amount_uusdc) === amount &&
    Number.isSafeInteger(receipt.epoch_id) && receipt.epoch_id >= 0 &&
    receipt.settlement === "epoch" && receipt.chain === "telegraph" &&
    Number.isSafeInteger(receipt.timestamp) && receipt.timestamp >= 0;
}

export async function fetchWithEscrow(fetchImpl, signer, url, init, options = {}) {
  const requestId = paymentRequestId(url, init, options.intent);
  const first = await fetchImpl(url, init);
  if (first.status !== 402) return { res: first, receipt: null, paymentStatus: "not_authorized" };
  if (!signer) return { res: first, receipt: null, paymentStatus: "unavailable" };
  let challenge;
  try {
    challenge = await first.json();
  } catch {
    throw new PaymentPolicyError("402 challenge body is not valid JSON");
  }
  const authorization = await signChallenge(signer, challenge, {
    ...options,
    url,
    policy: options.policy,
    requestId,
    now: options.now ?? Date.now,
    nonceFactory: options.nonceFactory ?? randomUUID,
  });
  let res;
  try {
    res = await fetchImpl(url, {
      ...init,
      headers: { ...(init.headers ?? {}), "X-PAYMENT": authorization.header },
    });
  } catch (error) {
    options.policy.transition(authorization.reservationId, "unknown");
    if (error && typeof error === "object") error.paymentStatus = "unknown";
    throw error;
  }
  let receipt = null;
  let receiptValid = false;
  let headerRead = true;
  let rawHeader = null;
  try {
    rawHeader = res.headers?.get?.("x-payment-response") ?? null;
    if (rawHeader !== null) {
      if (!rawHeader) throw new PaymentPolicyError("payment response header is empty");
      receipt = JSON.parse(Buffer.from(rawHeader, "base64").toString("utf8"));
      receiptValid = validateEscrowReceipt(receipt, {
        intent: options.intent,
        amount: authorization.amount,
        payer: authorization.authorization.from,
      });
    }
  } catch {
    headerRead = false;
    receipt = null;
  }
  let paymentStatus;
  if (receiptValid) {
    options.policy.transition(authorization.reservationId, "settled");
    paymentStatus = "receipt_valid";
  } else if (headerRead && res.status === 402 && rawHeader === null) {
    options.policy.transition(authorization.reservationId, "failed");
    paymentStatus = "definitive_unpaid";
  } else {
    options.policy.transition(authorization.reservationId, "unknown");
    paymentStatus = "unknown";
  }
  res.settlementReceipt = receipt;
  res.receiptValid = receiptValid;
  res.paymentStatus = paymentStatus;
  res.reservationId = authorization.reservationId;
  res.authorizedAmountMicro = String(authorization.amount);
  return { res, receipt, paymentStatus: res.paymentStatus };
}

function paymentRequestId(url, init, intent) {
  if (typeof intent !== "string" || !intent) throw new PaymentPolicyError("payment intent is required");
  if (init?.body != null && typeof init.body !== "string") {
    throw new PaymentPolicyError("payment request body must be stable text");
  }
  const requestUrl = new URL(url).toString();
  const method = typeof init?.method === "string" ? init.method.toUpperCase() : "GET";
  const body = stableRequestBody(init?.body ?? "");
  const fingerprint = JSON.stringify({ method, requestUrl, intent, body });
  return `sha256:${createHash("sha256").update(fingerprint).digest("hex")}`;
}

function stableRequestBody(body) {
  if (!body) return body;
  try {
    const value = JSON.parse(body);
    const sortKeys = (item) => {
      if (Array.isArray(item)) return item.map(sortKeys);
      if (item && typeof item === "object") {
        return Object.fromEntries(Object.keys(item).sort().map((key) => [key, sortKeys(item[key])]));
      }
      return item;
    };
    return JSON.stringify(sortKeys(value));
  } catch {
    return body;
  }
}

export function usdCostToMicro(value) {
  if (value === 0 || value === "0") return 0n;
  return usdToMicro(value, "cost_usd");
}
