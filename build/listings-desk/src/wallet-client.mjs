const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export function isEthereumAddress(value) {
  return typeof value === "string" && ADDRESS_PATTERN.test(value);
}

function isProvider(provider) {
  return provider != null && typeof provider.request === "function";
}

export function selectMetaMaskProvider(injectedProvider, announcedProviders = []) {
  const announced = Array.isArray(announcedProviders)
    ? announcedProviders.find((entry) =>
      typeof entry?.info?.rdns === "string" &&
      entry.info.rdns.toLowerCase() === "io.metamask" &&
      isProvider(entry.provider)
    )
    : null;
  if (announced) return announced.provider;

  const injected = Array.isArray(injectedProvider?.providers)
    ? injectedProvider.providers
    : [injectedProvider];
  return injected.find((provider) => provider?.isMetaMask === true && isProvider(provider)) ?? null;
}

export async function requestMetaMaskAccounts(provider) {
  if (!isProvider(provider)) throw new TypeError("MetaMask provider is unavailable.");
  const accounts = await provider.request({ method: "eth_requestAccounts", params: [] });
  if (!Array.isArray(accounts) || accounts.length === 0 || !accounts.every(isEthereumAddress)) {
    throw new TypeError("MetaMask returned no valid Ethereum accounts.");
  }
  return [...accounts];
}

function formatProviderError(error) {
  if (error?.code === 4001) return "Connection request rejected. No account was shared.";
  if (error?.code === -32002) return "A MetaMask connection request is already pending.";
  return error instanceof Error ? error.message : String(error);
}

function initializeWalletConnection() {
  const button = document.getElementById("wallet-connect");
  const status = document.getElementById("wallet-status");
  if (!button || !status) return;

  const announcedProviders = [];
  let activeProvider = null;
  let accountsChangedHandler = null;

  window.addEventListener("eip6963:announceProvider", (event) => {
    const detail = event.detail;
    if (typeof detail?.info?.rdns !== "string" ||
        detail.info.rdns.toLowerCase() !== "io.metamask" ||
        !isProvider(detail.provider)) return;
    if (!announcedProviders.some((entry) => entry.provider === detail.provider)) {
      announcedProviders.push(detail);
    }
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  function showStatus(message, state = "idle") {
    status.textContent = message;
    status.className = `wallet-status wallet-status--${state}`;
  }

  function showAccounts(accounts) {
    if (accounts.length === 0) {
      button.textContent = "Connect MetaMask";
      button.removeAttribute("aria-label");
      showStatus("MetaMask account access was removed for this page.", "idle");
      return;
    }
    const first = accounts[0];
    button.textContent = `Connected · ${first.slice(0, 6)}…${first.slice(-4)}`;
    button.setAttribute("aria-label", `Connected MetaMask account ${first}`);
    const additionalAccounts = accounts.length > 1 ? ` (${accounts.length} accounts)` : "";
    showStatus(
      `Account access only${additionalAccounts}: ${accounts.join(", ")}. This address is not sent to Listings Desk; no signature or payment was requested.`,
      "connected"
    );
  }

  function listenForAccountChanges(provider) {
    if (activeProvider && accountsChangedHandler && typeof activeProvider.removeListener === "function") {
      activeProvider.removeListener("accountsChanged", accountsChangedHandler);
    }
    activeProvider = provider;
    accountsChangedHandler = (accounts) => {
      if (!Array.isArray(accounts) || !accounts.every(isEthereumAddress)) {
        button.textContent = "Connect MetaMask";
        button.removeAttribute("aria-label");
        showStatus("MetaMask returned an invalid account update.", "error");
        return;
      }
      showAccounts(accounts);
    };
    if (typeof provider.on === "function") provider.on("accountsChanged", accountsChangedHandler);
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Waiting for MetaMask…";
    button.setAttribute("aria-busy", "true");
    showStatus("Approve account access in MetaMask. No signature or payment is requested.", "pending");

    try {
      window.dispatchEvent(new Event("eip6963:requestProvider"));
      await new Promise((resolve) => setTimeout(resolve, 150));
      const provider = selectMetaMaskProvider(window.ethereum, announcedProviders);
      if (!provider) {
        throw new Error("MetaMask was not detected. Enable the MetaMask extension, then try again.");
      }
      const accounts = await requestMetaMaskAccounts(provider);
      listenForAccountChanges(provider);
      showAccounts(accounts);
    } catch (error) {
      button.textContent = "Connect MetaMask";
      button.removeAttribute("aria-label");
      showStatus(formatProviderError(error), error?.code === 4001 ? "idle" : "error");
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  initializeWalletConnection();
}
