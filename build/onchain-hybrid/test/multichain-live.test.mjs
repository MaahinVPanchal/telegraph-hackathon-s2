import { handle, CHAINS } from "../src/core.mjs";

const ADDRESS = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const EXTRA_RPCS = {
  ethereum: [],
  polygon: ["https://1rpc.io/matic"],
  "arbitrum-one": [],
};
const outcomes = { PASS: 0, FAIL: 0, SKIP: 0 };

async function rpc(url, method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const body = await response.json();
  if (body.error || body.result == null) throw new Error(`RPC_ERROR:${String(body.error?.message || "empty result").slice(0, 100)}`);
  return body.result;
}

function report(status, chain, detail) {
  outcomes[status]++;
  console.log(`${status} ${chain}: ${detail}`);
}

for (const [name, config] of Object.entries(CHAINS)) {
  const urls = [...new Set([...config.rpcs, ...EXTRA_RPCS[name]])];
  const probes = await Promise.all(urls.map(async (url) => {
    const host = new URL(url).host;
    try {
      const chainId = BigInt(await rpc(url, "eth_chainId", []));
      if (chainId !== BigInt(config.id)) throw new Error(`CHAIN_ID_${chainId}`);
      const head = BigInt(await rpc(url, "eth_blockNumber", []));
      return { url, host, head };
    } catch (error) {
      return { url, host, error: String(error.message || error) };
    }
  }));
  const mismatched = probes.filter((probe) => probe.error?.startsWith("CHAIN_ID_"));
  if (mismatched.length) {
    report("FAIL", name, `configured comparison RPC returned the wrong chain ID: ${mismatched.map((p) => `${p.host}=${p.error}`).join(", ")}`);
    continue;
  }
  const available = probes.filter((probe) => probe.head !== undefined);
  if (available.length < 2) {
    report("SKIP", name, `fewer than two chain-ID-verified RPCs; ${probes.map((p) => `${p.host}=${p.error || "ok"}`).join(", ")}`);
    continue;
  }

  const block = available.reduce((lowest, probe) => probe.head < lowest ? probe.head : lowest, available[0].head) - 2n;
  const request = new URL("https://worker.local/query");
  request.searchParams.set("metric", "eth_balance");
  request.searchParams.set("chain", name);
  request.searchParams.set("address", ADDRESS);
  request.searchParams.set("block", block.toString());
  const workerTimes = [];
  let worker = null;
  for (let i = 0; i < 4; i++) {
    const started = performance.now();
    worker = await handle(request, {}, { quiet: true });
    workerTimes.push(performance.now() - started);
    if (worker.status !== 200 || JSON.parse(worker.text).ok !== true) break;
  }
  const body = JSON.parse(worker.text);
  if (worker.status !== 200 || body.ok !== true) {
    const detail = `worker HTTP ${worker.status} ${body.error || "unknown error"} at block ${block}; ${body.message || ""}`;
    if (["NO_ARCHIVE_SOURCE", "DEADLINE_EXCEEDED", "NO_SOURCE"].includes(body.error)) report("SKIP", name, detail);
    else report("FAIL", name, detail);
    continue;
  }
  if (body.chain_id !== config.id || BigInt(body.block) !== block || typeof body.balance_wei !== "string") {
    report("FAIL", name, `worker provenance/value mismatch at block ${block}: ${worker.text}`);
    continue;
  }
  const independentCandidates = available.filter((probe) => probe.host !== body.source);
  if (!independentCandidates.length) {
    report("SKIP", name, `no independent reachable RPC differs from worker source ${body.source}`);
    continue;
  }
  let independent;
  let independentWei;
  const independentErrors = [];
  for (const candidate of independentCandidates) {
    try {
      independentWei = BigInt(await rpc(candidate.url, "eth_getBalance", [ADDRESS, `0x${block.toString(16)}`]));
      independent = candidate;
      break;
    } catch (error) {
      independentErrors.push(`${candidate.host}=${String(error.message || error)}`);
    }
  }
  if (!independent) {
    report("SKIP", name, `independent state read unavailable at block ${block}: ${independentErrors.join(", ")}`);
    continue;
  }
  const workerWei = BigInt(body.balance_wei);
  if (workerWei !== independentWei) {
    report("FAIL", name, `block=${block} worker=${workerWei} (${body.source}) independent=${independentWei} (${independent.host})`);
  } else {
    const sorted = [...workerTimes].sort((a, b) => a - b);
    const p50 = sorted[Math.ceil(0.50 * sorted.length) - 1];
    const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1];
    report("PASS", name, `chainId=${config.id} block=${block} balanceWei=${workerWei} worker=${body.source} independent=${independent.host} fresh-read-p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms n=${workerTimes.length}`);
  }
}

console.log(`multichain live summary: ${outcomes.PASS} PASS, ${outcomes.FAIL} FAIL, ${outcomes.SKIP} SKIP`);
process.exit(outcomes.FAIL ? 1 : 0);
