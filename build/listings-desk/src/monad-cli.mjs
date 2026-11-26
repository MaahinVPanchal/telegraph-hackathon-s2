import { x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import { createPublicClient, http, isAddress, isHash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

const network = "eip155:10143";
const asset = "0x534b2f3a21130d7a60830c2df862319e593943a3";
const defaultUrl = "https://devnode.telegraphprotocol.com/engine/v1/ask";
const usage = [
  "node src/monad-cli.mjs quote [URL] [JSON]",
  "node src/monad-cli.mjs pay URL JSON PAY_TO [MAX_MICRO_USDC]",
  "Pay mode requires MONAD_TESTNET_PRIVATE_KEY. The default cap is 10000 (0.01 test USDC).",
].join("\n");

async function main([mode, endpoint = defaultUrl, body = '{"intent":"CRYPTO_PRICE_USD","params":{"symbol":"BTC"}}', payTo, cap = "10000"]) {
  if (mode === "--help" || !mode) {
    console.log(usage);
    return;
  }
  if (mode !== "quote" && mode !== "pay") throw new Error(usage);
  if (mode === "pay" && (!payTo || !isAddress(payTo) || !/^[1-9]\d*$/.test(cap))) throw new Error(usage);
  const url = new URL(endpoint);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) ||
      url.username || url.password || url.hash) throw new Error("Use an HTTPS endpoint or http://localhost for development.");
  JSON.parse(body);

  function post(payment) {
    const headers = { "Content-Type": "application/json" };
    if (payment) headers["PAYMENT-SIGNATURE"] = payment;
    return fetch(url, { method: "POST", headers, body, redirect: "error", signal: AbortSignal.timeout(60_000) });
  }

  const first = await post();
  await first.body?.cancel();
  const header = first.headers.get("payment-required");
  if (first.status !== 402 || !header) throw new Error("Expected HTTP 402 with a PAYMENT-REQUIRED header.");
  const challenge = decodePaymentRequiredHeader(header);
  if (challenge.x402Version !== 2 || !Array.isArray(challenge.accepts)) throw new Error("Expected an x402 v2 challenge.");
  const options = challenge.accepts.filter((entry) =>
    entry.scheme === "exact" && entry.network === network && entry.asset?.toLowerCase() === asset &&
    /^[1-9]\d*$/.test(entry.amount) && isAddress(entry.payTo));
  if (mode === "quote") {
    console.log(JSON.stringify({ status: first.status, monadAvailable: options.length > 0, accepts: challenge.accepts }, null, 2));
  }
  if (!options.length) throw new Error("This endpoint did not offer Monad Testnet exact USDC.");
  if (mode === "quote") return;

  const permitted = options.filter((entry) =>
    entry.payTo.toLowerCase() === payTo.toLowerCase() && BigInt(entry.amount) <= BigInt(cap));
  if (permitted.length !== 1) throw new Error("Expected one Monad quote matching the recipient and spend cap.");
  const key = process.env.MONAD_TESTNET_PRIVATE_KEY;
  if (!/^0x[0-9a-f]{64}$/i.test(key ?? "")) throw new Error("Set MONAD_TESTNET_PRIVATE_KEY to a funded testnet wallet key.");
  const client = new x402Client().register(network, new ExactEvmScheme(privateKeyToAccount(key)));
  const payment = await client.createPaymentPayload({ ...challenge, accepts: permitted });

  try {
    const response = await post(encodePaymentSignatureHeader(payment));
    const settlementHeader = response.headers.get("payment-response");
    const settlement = settlementHeader ? decodePaymentResponseHeader(settlementHeader) : null;
    if (!response.ok || !settlement?.success || settlement.network !== network || !isHash(settlement.transaction)) {
      throw new Error("No successful Monad settlement returned (HTTP " + response.status + ").");
    }
    console.error("Monad transaction: " + settlement.transaction);
    const chain = createPublicClient({ chain: monadTestnet, transport: http() });
    const receipt = await chain.waitForTransactionReceipt({ hash: settlement.transaction, confirmations: 1, timeout: 30_000 });
    if (receipt.status !== "success") throw new Error("The Monad transaction reverted.");
    const telegraphHeader = response.headers.get("x-telegraph-receipt");
    console.log(JSON.stringify({
      network,
      transaction: receipt.transactionHash,
      block: receipt.blockNumber.toString(),
      telegraphReceipt: telegraphHeader ? JSON.parse(Buffer.from(telegraphHeader, "base64").toString("utf8")) : null,
      result: await response.json(),
    }, null, 2));
  } catch (error) {
    throw new Error(error.message + " Check the settlement outcome before authorizing another payment.");
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
