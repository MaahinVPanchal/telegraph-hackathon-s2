# 📣 DISCORD UPDATE — "what we changed" (no-strategy version)

> Where: **#showcase** (as a reply/update on your existing post) or a miners channel.
> What's deliberately left out: which Intents we're targeting next, incumbent-score
> analysis, expansion plans. The YAMLs are public anyway — the edge is the targeting,
> not the config.

---

## Title

```
Miner update: from rank 35 (0.0000) to fixed — root cause + new FX miner live 🟢
```

## Body

```
Quick update on our miners (onchain-metric-publicnode, weather-verify-openmeteo):

🔧 Honest build-log entry: our onchain miner was **rank 35 with a 0.0000 score**
on the leaderboard — despite our API answering correctly when tested by hand.
Root cause: we served HEX values from a raw JSON-RPC node, and hadn't mapped
signal_mapping.label_field to an answer field. The response parser needs a
clean decimal label it can read — correctness alone doesn't score if the
parser can't find the value.

✅ What we changed:
• switched the upstream to a source that returns decimal values
• mapped signal_mapping.label_field to the exact answer field
• added the on_chain block + input_schema defaults

💡 PSA for anyone registering a miner: if your score is 0.0000 but your API
works fine when you test it by hand, check those two things first. The node
scores what the parser can read — not what your API returns.

🟢 Also new: fx-now-frankfurter is live, serving FX_NOW (ECB reference rates).

All three miners are active and answering. Happy to help anyone debug a
0.0000 score — we've seen most of the ways to earn one 😅
```

---

## What was deliberately NOT included (keep out of public posts)

- The per-Intent incumbent scores we're chasing (0.435 / 0.702 / 0.4967)
- That we chose these Intents *because* their boards are weak
- The 15/15 mission roadmap and miners 4–5 plans
- The deep-first-then-widen strategy and which Intents we'll add next
- Registration IDs chain / expansion timing
