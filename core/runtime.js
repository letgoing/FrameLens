(() => {
  const manifest = chrome.runtime.getManifest();
  const version = manifest.version;
  const sendToTab = (tabId, message) => new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError?.message ||
        (response?.ok === false ? response.error || "预览操作失败" : null);
      if (error) reject(new Error(error));
      else resolve(response);
    });
  });
  const inject = (tabId) => chrome.scripting.executeScript({
    target: { tabId }, files: manifest.content_scripts[0].js
  });
  const ensureContent = async (tabId) => {
    let ping;
    try { ping = await sendToTab(tabId, { type: "FRAMELENS_PING" }); } catch { /* 尚未注入。 */ }
    if (ping?.version !== version) await inject(tabId);
    const confirmed = await sendToTab(tabId, { type: "FRAMELENS_PING" });
    if (confirmed?.version !== version) throw new Error("页面仍在运行旧版脚本，请重新打开该标签页");
  };
  const requestTabState = async (message) => {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || "无法保存或恢复预览状态");
    return response;
  };
  const settings = Object.freeze({
    load: async () => (await requestTabState({type:"FRAMELENS_GET_SETTINGS"})).config,
    patch: async (changes, expected) => (await requestTabState({type:"FRAMELENS_PATCH_SETTINGS", changes, expected})).config
  });
  globalThis.FrameLensRuntime = Object.freeze({ version, sendToTab, ensureContent, requestTabState, settings });
})();
