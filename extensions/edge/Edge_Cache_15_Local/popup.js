"use strict";

const enabledCheckbox = document.getElementById("enabled");
const storageCheckbox = document.getElementById("includeStorage");
const clearButton = document.getElementById("clearNow");
const status = document.getElementById("status");

function describeLastRun(data) {
  if (data.lastError) return `Last error: ${data.lastError}`;
  if (data.lastRun) return `Last cleared: ${new Date(data.lastRun).toLocaleString()}`;
  return "No automatic cleanup has run yet. First run occurs about 15 minutes after activation.";
}

async function refresh() {
  const data = await chrome.storage.local.get({
    enabled: true,
    includeCacheStorage: false,
    lastRun: null,
    lastError: null
  });
  enabledCheckbox.checked = data.enabled;
  storageCheckbox.checked = data.includeCacheStorage;
  status.textContent = describeLastRun(data);
}

enabledCheckbox.addEventListener("change", async () => {
  await chrome.storage.local.set({ enabled: enabledCheckbox.checked });
  await refresh();
});

storageCheckbox.addEventListener("change", async () => {
  await chrome.storage.local.set({ includeCacheStorage: storageCheckbox.checked });
  await refresh();
});

clearButton.addEventListener("click", async () => {
  clearButton.disabled = true;
  status.textContent = "Clearing cache...";
  try {
    const result = await chrome.runtime.sendMessage({ action: "clearNow" });
    if (!result?.ok) throw new Error(result?.error || "Unknown error");
    await refresh();
  } catch (error) {
    status.textContent = `Error: ${error?.message || error}`;
  } finally {
    clearButton.disabled = false;
  }
});

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local" && !clearButton.disabled) refresh().catch(console.error);
});

refresh().catch(error => {
  status.textContent = `Could not load settings: ${error?.message || error}`;
});
