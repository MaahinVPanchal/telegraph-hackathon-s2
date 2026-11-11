import { readFileSync, writeFileSync } from "node:fs";
const path = "src/engine.mjs";
let e = readFileSync(path, "utf8");

const anchor = "  let data;\r\n  try {\r\n    data = await res.json();\r\n  } catch {";
if (!e.includes(anchor)) throw new Error("anchor not found");

const addition = "  // The x402 exact rail carries the settlement proof in the response header\r\n  // (the SDK verifies it internally -- we decode it for the memo evidence).\r\n  const settlementHeader = res.headers?.get(\"x-payment-response\") ?? null;\r\n  let settlementProof = null;\r\n  if (settlementHeader) {\r\n    try { settlementProof = JSON.parse(Buffer.from(settlementHeader, \"base64\").toString(\"utf8\")); }\r\n    catch { settlementProof = { raw: settlementHeader }; }\r\n  }\r\n  let data;\r\n  try {\r\n    data = await res.json();\r\n  } catch {";

e = e.replace(anchor, addition);
// thread the settlement proof into the receipt construction
const receiptAnchor = "    const receipt = {";
// find the receipt construction in ask()'s return path (the success path builds a receipt object with check/intent etc.)
let i = e.indexOf("    const receipt = {");
if (i < 0) throw new Error("receipt construction not found");
e = e.slice(0, i) + "    const settlementProof = res.settlementProof ?? null;\n" + e.slice(i);

writeFileSync(path, e);
console.log("settlement decode added + threaded");
