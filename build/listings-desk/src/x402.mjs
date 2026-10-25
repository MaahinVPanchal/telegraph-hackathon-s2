// x402 / escrow payment adapter for REAL mode.
//
// Implements the "escrow" scheme from Telegraph's 402 challenge:
//   1. no payment header → 402, body.accepts[] lists schemes
//   2. pick scheme "escrow", fill extra.message template ({from} lowercased,
//      {nonce} any unique string, {validAfter}/{validBefore} unix seconds)
//   3. sign the message with personal_sign (EIP-191) — via Foundry `cast`
//   4. retry with header `X-PAYMENT: base64(JSON envelope)`
//
// Before first use, fund the escrow once: EscrowFacet.depositUSDC(amount) on the
// Diamond (docs.telegraphprotocol.com/docs/using/escrow-inference).
// A failed request is never billed — treat 402/4xx as "not charged", retry with a
// FRESH nonce.
//
// The x402 "exact" scheme (EIP-3009 transferWithAuthorization, facilitator-verified)
// needs a real x402 client — the docs recommend @x402/fetch; we deliberately do not
// hand-roll EIP-712 over USDC here. Escrow is simpler, needs one deposit, and is
// what the docs recommend for anything more than occasional calls.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

const pExecFile = promisify(execFile);

export class EscrowSigner {
  /**
   * @param {string} privateKey  funded wallet key (env: WALLET_PRIVATE_KEY)
   * @param {string} castPath    optional path to cast binary
   */
  constructor(privateKey, castPath = "cast") {
    if (!privateKey) throw new Error("WALLET_PRIVATE_KEY is required for real mode");
    this.privateKey = privateKey;
    this.castPath = castPath;
    this.address = null; // derived lazily
  }

  async walletAddress() {
    if (!this.address) {
      const { stdout } = await pExecFile(this.castPath, ["wallet", "address", "--private-key", this.privateKey]);
      this.address = stdout.trim().toLowerCase();
    }
    return this.address;
  }

  /** personal_sign (EIP-191) via cast. */
  async personalSign(message) {
    const { stdout } = await pExecFile(this.castPath, [
      "wallet", "sign", "--private-key", this.privateKey, message,
    ]);
    return stdout.trim();
  }

  /**
   * Build the X-PAYMENT header value for a 402 challenge body.
   * @returns {string} base64 envelope
   */
  async buildEscrowHeader(challenge) {
    const entry = (challenge.accepts ?? []).find((a) => a.scheme === "escrow");
    if (!entry) {
      throw new Error(
        `no escrow scheme in challenge (got: ${(challenge.accepts ?? []).map((a) => a.scheme).join(", ") || "none"}) — ` +
        `the exact scheme needs an x402 client (@x402/fetch), see README "Going real"`
      );
    }
    const from = await this.walletAddress();
    const now = Math.floor(Date.now() / 1000);
    const auth = {
      from, // MUST be lowercase — the node lowercases before verifying
      to: String(entry.payTo).toLowerCase(),
      value: (String(entry.extra?.message).match(/Amount:\s*(\d+)\s*uUSDC/) ?? [])[1] ?? "10000",
      validAfter: String(now - 60),
      validBefore: String(now + 600),
      nonce: randomUUID(),
    };
    if (!auth.value) throw new Error("could not read the Amount line from the escrow message template");

    const message = String(entry.extra.message)
      .replaceAll("{from}", from)
      .replaceAll("{nonce}", auth.nonce)
      .replaceAll("{validAfter}", auth.validAfter)
      .replaceAll("{validBefore}", auth.validBefore);

    const signature = await this.personalSign(message);
    const envelope = {
      x402Version: 2,
      scheme: "escrow",
      network: entry.network ?? "eip155:84532",
      payload: { signature, authorization: auth },
    };
    return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64");
  }
}

/**
 * Wrap fetch with the 402 → sign → retry loop.
 * Returns { res, receipt } — receipt decoded from X-PAYMENT-RESPONSE when present.
 */
export async function fetchWithEscrow(fetchImpl, signer, url, init) {
  let res = await fetchImpl(url, init);
  if (res.status !== 402) return { res, receipt: null };

  const challenge = await res.json().catch(() => ({}));
  const header = await signer.buildEscrowHeader(challenge);

  res = await fetchImpl(url, {
    ...init,
    headers: { ...(init.headers ?? {}), "X-PAYMENT": header },
  });
  const raw = res.headers.get("x-payment-response");
  // attach for engine.ask() to fold into the receipt
  res.settlementReceipt = raw ? JSON.parse(Buffer.from(raw, "base64").toString("utf8")) : null;
  return { res, receipt: res.settlementReceipt };
}
