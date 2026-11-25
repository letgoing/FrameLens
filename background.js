importScripts("devices.js", "core/config.js", "core/state.js", "core/runtime.js");

const { ensureContent, sendToTab } = globalThis.FrameLensRuntime;
const tabStates = globalThis.FrameLensState.createTabStateStore(chrome.storage.session);
const settings = globalThis.FrameLensState.createSettingsStore(chrome.storage.local);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "FRAMELENS_PATCH_SETTINGS" || message?.type === "FRAMELENS_GET_SETTINGS") {
    const task = message.type === "FRAMELENS_PATCH_SETTINGS" ? settings.patch(message.changes, message.expected) : settings.load();
    task.then(config => sendResponse({ok:true, config}), error => sendResponse({ok:false, error:error.message}));
    return true;
  }
  if (![
    "FRAMELENS_GET_TAB_STATE", "FRAMELENS_SAVE_TAB_STATE", "FRAMELENS_CLEAR_TAB_STATE"
  ].includes(message?.type)) return false;
  tabStates.handle(message, sender).then(sendResponse, (error) =>
    sendResponse({ ok: false, error: error.message })
  );
  return true;
});

chrome.tabs.onRemoved.addListener((id) => tabStates.remove(id).catch(() => {}));
const enableActionSidePanel = () => chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => { /* 不影响快捷键和内容脚本。 */ });
enableActionSidePanel();

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-preview") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^(https?:|file:)/.test(tab.url || "")) return;
  try {
    await ensureContent(tab.id);
    await sendToTab(tab.id, { type: "FRAMELENS_TOGGLE" });
  } catch (error) {
    // 不重试非幂等的 toggle，避免首次成功后因响应丢失又把预览关闭。
    console.warn("FrameLens：无法切换预览", error.message);
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await enableActionSidePanel();
  const stored = await chrome.storage.local.get([
    "frameLensCustomDevices", "frameLensPanelCompact"
  ]);
  // 原键名不变；旧版配置在这里标准化，但保留设备和自定义尺寸。
  await settings.patch({});
  if (!stored.frameLensCustomDevices) await chrome.storage.local.set({ frameLensCustomDevices: [] });
  if (typeof stored.frameLensPanelCompact !== "boolean") {
    await chrome.storage.local.set({ frameLensPanelCompact: false });
  }
});
chrome.runtime.onStartup.addListener(enableActionSidePanel);
