import assert from "node:assert/strict";

export async function approveMockCharges(page, onReview = async () => {}) {
  while (await page.waitForFunction(() => {
    const finished = document.querySelector("#out").getAttribute("aria-busy") === "false";
    const reviewing = document.querySelector("#payment-review").open;
    return finished ? "finished" : reviewing && "reviewing";
  }).then(handle => handle.jsonValue()) === "reviewing") {
    assert.equal(await page.locator("#payment-review-amount").innerText(), "0.01 test USDC");
    if (await onReview()) {
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    } else {
      await page.locator("#approve-live-charge").click();
    }
  }
}
