(() => {
  if (window.top !== window) return;
  const contentVersion = globalThis.FrameLensRuntime.version;
  if (globalThis.__FRAMELENS_CONTENT_VERSION__ === contentVersion) return;

  try {
    globalThis.__FRAMELENS_CONTENT_CLEANUP__?.();
  } catch {
    // 旧版本上下文可能已失效，继续移除遗留 DOM。
  }
  document.querySelector("#__framelens_preview_host__")?.remove();

  globalThis.__FRAMELENS_CONTENT_SCRIPT__ = true;
  globalThis.__FRAMELENS_CONTENT_VERSION__ = contentVersion;

  const { requestTabState } = globalThis.FrameLensRuntime;
  const { FrameLensPreview } = globalThis.FrameLensView;
  const { settings } = globalThis.FrameLensRuntime;
  let restoreGeneration = 0;
  let disposed = false;

  let activePreview = null;

  globalThis.__FRAMELENS_CONTENT_CLEANUP__ = () => {
    disposed = true;
    restoreGeneration += 1;
    chrome.runtime.onMessage.removeListener(onMessage);
    activePreview?.destroy();
    document.querySelector("#__framelens_preview_host__")?.remove();
    activePreview = null;
  };

  const openPreview = (config) => {
    if (activePreview) {
      activePreview.update(config, true);
      return activePreview;
    }
    activePreview = new FrameLensPreview(config, {
      onChange: (config, outerUrl) => requestTabState({ type: "FRAMELENS_SAVE_TAB_STATE", config, outerUrl }),
      onClose: async (preview) => {
        restoreGeneration += 1;
        await requestTabState({ type: "FRAMELENS_CLEAR_TAB_STATE" });
        if (activePreview === preview) activePreview = null;
      }
    });
    return activePreview;
  };

  const togglePreview = async () => {
    const generation = ++restoreGeneration;
    if (activePreview) {
      await activePreview.close();
      return false;
    }
    const stored = await settings.load();
    if (disposed || generation !== restoreGeneration) return Boolean(activePreview);
    const preview = openPreview({
      ...stored,
      url: location.href
    });
    await preview.saveState();
    return true;
  };

  const onMessage = (message, _sender, sendResponse) => {
    if (message?.type === "FRAMELENS_PING") {
      sendResponse({
        ready: true,
        open: Boolean(activePreview),
        version: contentVersion
      });
      return false;
    }

    if (message?.type === "FRAMELENS_OPEN") {
      const generation = ++restoreGeneration;
      (async () => {
        const defaults = activePreview ? {} : await settings.load();
        if (generation !== restoreGeneration || disposed || activePreview?.closing) throw new Error("预览状态已改变，请重新应用");
        const preview = openPreview({ ...defaults, ...message.config, url: activePreview?.getExitUrl() || location.href });
        await preview.saveState();
      })()
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === "FRAMELENS_CLOSE") {
      restoreGeneration += 1;
      const close = activePreview
        ? activePreview.close()
        : requestTabState({ type: "FRAMELENS_CLEAR_TAB_STATE" });
      close.then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === "FRAMELENS_SET_MODEL_POSITION") {
      const preview = activePreview;
      preview?.setModelPosition(message.position);
      (preview?.saveState() || Promise.resolve())
        .then(() => sendResponse({ ok: true, open: Boolean(preview) }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === "FRAMELENS_SET_STATUS_BAR_DIVIDER") {
      activePreview?.setStatusBarDivider(message.enabled);
      const save = activePreview?.saveState() || Promise.resolve();
      save.then(() => sendResponse({ ok: true, open: Boolean(activePreview) }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === "FRAMELENS_SET_LIVE_SYNC") {
      activePreview?.setLiveSync(message.enabled, false);
      const response = {
        ok: true,
        open: Boolean(activePreview),
        enabled: activePreview?.liveSyncEnabled ?? Boolean(message.enabled)
      };
      const save = activePreview?.saveState() || Promise.resolve();
      save.then(() => sendResponse(response))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === "FRAMELENS_TOGGLE") {
      togglePreview()
        .then((open) => sendResponse({ ok: true, open }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    return false;
  };
  chrome.runtime.onMessage.addListener(onMessage);

  // 刷新会重新运行内容脚本；只恢复当前标签页已应用的预览。
  const restoreAt = restoreGeneration;
  requestTabState({ type: "FRAMELENS_GET_TAB_STATE" })
    .then((entry) => {
      const { config } = entry;
      if (!config || disposed || restoreAt !== restoreGeneration || activePreview) return;
      const navType = performance.getEntriesByType("navigation")[0]?.type;
      const url = globalThis.FrameLensState.restoreUrl(entry, location.href, navType);
      return openPreview({ ...config, url }).saveState();
    })
    .catch(() => {
      // 首次安装/更新期间后台暂不可用时，仍允许用户手动应用预览。
    });
})();
