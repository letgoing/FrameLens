(() => {
  const builtInDevices = globalThis.FrameLensDevices.presets;
  const defaultConfig = globalThis.FrameLensConfig.defaults;
  const { settings } = globalThis.FrameLensRuntime;
  const { version, ensureContent, sendToTab: sendMessage } = globalThis.FrameLensRuntime;
  document.querySelector(".version").textContent = version;
  const quickDeviceIds = [
    "iphone-17-pro",
    "iphone-15-pro-max",
    "pixel-9-pro",
    "ipad-mini"
  ];

  const elements = {
    pageLabel: document.querySelector("#pageLabel"),
    deviceCount: document.querySelector("#deviceCount"),
    quickDevices: document.querySelector("#quickDevices"),
    deviceSelect: document.querySelector("#deviceSelect"),
    viewportMeta: document.querySelector("#viewportMeta"),
    physicalMeta: document.querySelector("#physicalMeta"),
    dprMeta: document.querySelector("#dprMeta"),
    widthInput: document.querySelector("#widthInput"),
    heightInput: document.querySelector("#heightInput"),
    portraitBtn: document.querySelector("#portraitBtn"),
    landscapeBtn: document.querySelector("#landscapeBtn"),
    swapBtn: document.querySelector("#swapBtn"),
    frameSelect: document.querySelector("#frameSelect"),
    scaleSelect: document.querySelector("#scaleSelect"),
    modelPosition: document.querySelector("#modelPosition"),
    liveSyncInput: document.querySelector("#liveSyncInput"),
    statusBarDividerInput: document.querySelector("#statusBarDividerInput"),
    customNameInput: document.querySelector("#customNameInput"),
    saveCustomBtn: document.querySelector("#saveCustomBtn"),
    deleteCustomBtn: document.querySelector("#deleteCustomBtn"),
    compactToggleBtn: document.querySelector("#compactToggleBtn"),
    collapsePanelBtn: document.querySelector("#collapsePanelBtn"),
    expandSummaryBtn: document.querySelector("#expandSummaryBtn"),
    summaryDeviceName: document.querySelector("#summaryDeviceName"),
    summaryViewport: document.querySelector("#summaryViewport"),
    status: document.querySelector("#status"),
    closeBtn: document.querySelector("#closeBtn"),
    openBtn: document.querySelector("#openBtn")
  };

  let customDevices = [];
  let selectedPresetId = defaultConfig.presetId;
  let activeTab = null;
  let panelCompact = false;

  const clampDimension = globalThis.FrameLensConfig.dimension;

  const setStatus = (message = "", type = "") => {
    elements.status.textContent = message;
    elements.status.className = `status${type ? ` ${type}` : ""}`;
  };

  const allDevices = () => [...builtInDevices, ...customDevices];

  const getSelectedDevice = () =>
    allDevices().find((device) => device.id === selectedPresetId);

  const setOrientationState = () => {
    const portrait =
      clampDimension(elements.heightInput.value) >=
      clampDimension(elements.widthInput.value);
    elements.portraitBtn.classList.toggle("active", portrait);
    elements.landscapeBtn.classList.toggle("active", !portrait);
  };

  const updateMeta = (device) => {
    const width = clampDimension(elements.widthInput.value);
    const height = clampDimension(elements.heightInput.value);
    elements.viewportMeta.textContent = `${width} × ${height}`;
    elements.physicalMeta.textContent = device?.physical || "自定义";
    elements.dprMeta.textContent = device?.dpr ? `${device.dpr}×` : "—";
    elements.summaryDeviceName.textContent =
      device?.name ||
      elements.customNameInput.value.trim() ||
      `自定义 ${width} × ${height}`;
    elements.summaryViewport.textContent = `${width} × ${height} · ${
      width <= height ? "竖屏" : "横屏"
    }`;
  };

  const setPanelCompact = async (compact, persist = true) => {
    panelCompact = Boolean(compact);
    document.body.classList.toggle("panel-compact", panelCompact);
    elements.compactToggleBtn.setAttribute(
      "aria-expanded",
      String(!panelCompact)
    );
    elements.compactToggleBtn.title = panelCompact ? "展开设置" : "收起设置";
    elements.compactToggleBtn.setAttribute(
      "aria-label",
      panelCompact ? "展开设置" : "收起设置"
    );
    if (persist) {
      await chrome.storage.local.set({
        frameLensPanelCompact: panelCompact
      });
    }
  };

  const updateSelectionUI = () => {
    elements.deviceSelect.value = selectedPresetId;
    elements.quickDevices
      .querySelectorAll(".device-chip")
      .forEach((button) =>
        button.classList.toggle("active", button.dataset.id === selectedPresetId)
      );
    elements.deleteCustomBtn.hidden = !selectedPresetId.startsWith("custom-");
  };

  const applyDevice = (device, preserveOrientation = false) => {
    if (!device) return;

    const wasLandscape =
      Number(elements.widthInput.value) > Number(elements.heightInput.value);
    selectedPresetId = device.id;

    let width = device.width;
    let height = device.height;
    if (preserveOrientation && wasLandscape && height > width) {
      [width, height] = [height, width];
    }

    elements.widthInput.value = width;
    elements.heightInput.value = height;
    elements.frameSelect.value = device.frame || "iphone";
    elements.customNameInput.value = device.custom ? device.name : "";
    updateMeta(device);
    setOrientationState();
    updateSelectionUI();
  };

  const markAsCustom = () => {
    selectedPresetId = "custom-current";
    updateMeta(null);
    setOrientationState();
    updateSelectionUI();
  };

  const renderQuickDevices = () => {
    elements.quickDevices.textContent = "";
    quickDeviceIds.forEach((id) => {
      const device = builtInDevices.find((item) => item.id === id);
      if (!device) return;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "device-chip";
      button.dataset.id = device.id;
      button.title = `${device.name} · ${device.width} × ${device.height}`;
      button.innerHTML = `
        <span class="mini-device ${device.frame === "tablet" ? "tablet" : ""}"></span>
        <strong>${device.shortName}</strong>
      `;
      button.addEventListener("click", () => applyDevice(device, true));
      elements.quickDevices.append(button);
    });
  };

  const renderDeviceSelect = () => {
    const currentValue = selectedPresetId;
    elements.deviceSelect.textContent = "";

    const families = [...new Set(builtInDevices.map((device) => device.family))];
    families.forEach((family) => {
      const group = document.createElement("optgroup");
      group.label = family;
      builtInDevices
        .filter((device) => device.family === family)
        .forEach((device) => {
          const option = document.createElement("option");
          option.value = device.id;
          option.textContent = `${device.name}  ·  ${device.width} × ${device.height}`;
          group.append(option);
        });
      elements.deviceSelect.append(group);
    });

    if (customDevices.length) {
      const customGroup = document.createElement("optgroup");
      customGroup.label = "我的尺寸";
      customDevices.forEach((device) => {
        const option = document.createElement("option");
        option.value = device.id;
        option.textContent = `${device.name}  ·  ${device.width} × ${device.height}`;
        customGroup.append(option);
      });
      elements.deviceSelect.append(customGroup);
    }

    const customOption = document.createElement("option");
    customOption.value = "custom-current";
    customOption.textContent = "自定义当前尺寸";
    elements.deviceSelect.append(customOption);

    elements.deviceCount.textContent = `${builtInDevices.length} 个预设`;
    elements.deviceSelect.value = allDevices().some(
      (device) => device.id === currentValue
    )
      ? currentValue
      : "custom-current";
  };

  const rotateTo = (orientation) => {
    let width = clampDimension(elements.widthInput.value);
    let height = clampDimension(elements.heightInput.value);
    const shouldSwap =
      (orientation === "portrait" && width > height) ||
      (orientation === "landscape" && height > width);
    if (shouldSwap) [width, height] = [height, width];
    elements.widthInput.value = width;
    elements.heightInput.value = height;
    updateMeta(getSelectedDevice());
    setOrientationState();
  };

  // “应用”只提交设备草稿；即时开关不属于这张草稿。
  const buildDeviceDraft = () => {
    const device = getSelectedDevice();
    const width = clampDimension(elements.widthInput.value);
    const height = clampDimension(elements.heightInput.value);
    return {
      presetId: selectedPresetId,
      name:
        elements.customNameInput.value.trim() ||
        device?.name ||
        `自定义 ${width} × ${height}`,
      width,
      height,
      dpr: device?.dpr || null,
      physical: device?.physical || null,
      frame: elements.frameSelect.value,
      scale: elements.scaleSelect.value
    };
  };


  const isPreviewablePage = () =>
    activeTab?.id && /^(https?:|file:)/.test(activeTab.url || "");

  const refreshActiveTab = async () => {
    [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    elements.pageLabel.textContent = isPreviewablePage()
      ? `${activeTab.title || "当前页面"} · ${
          new URL(activeTab.url).host || "本地文件"
        }`
      : "Chrome 内置页或受保护页面";
    document.body.classList.toggle("page-unavailable", !isPreviewablePage());
    return activeTab;
  };

  const collapseSidePanel = async () => {
    try {
      const currentWindow = await chrome.windows.getCurrent();
      if (chrome.sidePanel?.close && currentWindow?.id) {
        await chrome.sidePanel.close({ windowId: currentWindow.id });
        return;
      }
    } catch {
      // Chrome 141 以下没有 close()，使用扩展页面关闭作为降级。
    }
    window.close();
  };

  let controlRead = 0;
  const syncLiveControls = async () => {
    const read = ++controlRead;
    const tab = activeTab;
    if (!tab?.id) return;
    const key = globalThis.FrameLensState.tabKey(tab.id);
    const [session, defaults] = await Promise.all([
      chrome.storage.session.get(key), settings.load()
    ]);
    if (read !== controlRead || activeTab?.id !== tab.id) return;
    const entry = session[key];
    const current = entry && entry.scope === globalThis.FrameLensState.scopeOf(tab.url)
      ? entry.config : defaults;
    if (!elements.modelPosition.disabled) {
      const position = globalThis.FrameLensConfig.normalizePosition(current.modelPosition);
      elements.modelPosition.querySelector(`input[value="${position}"]`).checked = true;
    }
    if (!elements.liveSyncInput.disabled) elements.liveSyncInput.checked = current.liveSync !== false;
    if (!elements.statusBarDividerInput.disabled) elements.statusBarDividerInput.checked = current.statusBarDivider === true;
  };

  const openPreview = async () => {
    await refreshActiveTab();
    if (!isPreviewablePage()) {
      setStatus("此页面受 Chrome 保护，无法注入预览", "error");
      return;
    }

    elements.openBtn.disabled = true;
    setStatus("正在创建模型机…");
    const config = buildDeviceDraft();
    const tabId = activeTab.id;

    try {
      await ensureContent(tabId);
      await sendMessage(tabId, {
        type: "FRAMELENS_OPEN",
        config
      });
      await settings.patch(config);
      setStatus("预览已应用，刷新页面后会自动恢复", "success");
    } catch (error) {
      setStatus(
        activeTab.url?.startsWith("file:")
          ? "请在扩展详情中开启“允许访问文件网址”"
          : `无法预览：${error.message}`,
        "error"
      );
    } finally {
      elements.openBtn.disabled = false;
    }
  };

  const closePreview = async () => {
    await refreshActiveTab();
    if (!isPreviewablePage()) {
      setStatus("当前页面没有可关闭的预览", "error");
      return;
    }

    try {
      await sendMessage(activeTab.id, { type: "FRAMELENS_CLOSE" });
      setStatus("预览已关闭", "success");
    } catch (error) {
      setStatus(`关闭预览失败：${error.message}`, "error");
    }
  };

  const saveCustomDevice = async () => {
    const config = buildDeviceDraft();
    const name =
      elements.customNameInput.value.trim() ||
      `自定义 ${config.width} × ${config.height}`;
    const existing =
      selectedPresetId.startsWith("custom-") &&
      customDevices.find((device) => device.id === selectedPresetId);

    const device = {
      id: existing?.id || `custom-${Date.now()}`,
      name,
      shortName: name,
      family: "我的尺寸",
      width: config.width,
      height: config.height,
      dpr: null,
      physical: null,
      frame: config.frame,
      custom: true
    };

    customDevices = existing
      ? customDevices.map((item) => (item.id === existing.id ? device : item))
      : [...customDevices, device];
    selectedPresetId = device.id;

    await chrome.storage.local.set({ frameLensCustomDevices: customDevices });
    renderDeviceSelect();
    applyDevice(device);
    setStatus(existing ? "自定义尺寸已更新" : "自定义尺寸已保存", "success");
  };

  const deleteCustomDevice = async () => {
    if (!selectedPresetId.startsWith("custom-")) return;
    customDevices = customDevices.filter(
      (device) => device.id !== selectedPresetId
    );
    await chrome.storage.local.set({ frameLensCustomDevices: customDevices });
    renderDeviceSelect();
    applyDevice(
      builtInDevices.find((device) => device.id === defaultConfig.presetId)
    );
    setStatus("自定义尺寸已删除");
  };

  const hydrate = async () => {
    await refreshActiveTab();

    const stored = await chrome.storage.local.get([
      "frameLensSettings",
      "frameLensCustomDevices",
      "frameLensPanelCompact"
    ]);
    customDevices = Array.isArray(stored.frameLensCustomDevices)
      ? stored.frameLensCustomDevices
      : [];

    renderQuickDevices();
    renderDeviceSelect();

    const saved = globalThis.FrameLensConfig.normalizeSettings(stored.frameLensSettings);
    const selected = allDevices().find(
      (device) => device.id === saved.presetId
    );
    if (selected) {
      applyDevice(selected);
      elements.widthInput.value = saved.width || selected.width;
      elements.heightInput.value = saved.height || selected.height;
    } else {
      selectedPresetId = "custom-current";
      elements.widthInput.value = saved.width || defaultConfig.width;
      elements.heightInput.value = saved.height || defaultConfig.height;
      elements.customNameInput.value = saved.name || "";
    }

    elements.frameSelect.value = saved.frame || "iphone";
    elements.scaleSelect.value = String(saved.scale || "fit");
    elements.liveSyncInput.checked = saved.liveSync !== false;
    elements.statusBarDividerInput.checked = saved.statusBarDivider;
    updateMeta(selected);
    setOrientationState();
    updateSelectionUI();
    await setPanelCompact(Boolean(stored.frameLensPanelCompact), false);
    await syncLiveControls();
  };

  elements.deviceSelect.addEventListener("change", (event) => {
    const device = allDevices().find((item) => item.id === event.target.value);
    if (device) {
      applyDevice(device, true);
      return;
    }
    selectedPresetId = "custom-current";
    updateSelectionUI();
    updateMeta(null);
  });

  [elements.widthInput, elements.heightInput].forEach((input) => {
    input.addEventListener("input", markAsCustom);
    input.addEventListener("blur", () => {
      input.value = clampDimension(input.value);
      updateMeta(getSelectedDevice());
    });
  });

  elements.frameSelect.addEventListener("change", () => {
    if (!selectedPresetId.startsWith("custom-")) markAsCustom();
  });
  // 三个即时控件共用同一提交路径：只写该字段，不读取或重置尺寸草稿。
  const bindLiveControl = (control, key, messageType, appliedText, savedText, label) => {
    control.addEventListener("change", async ({target}) => {
      const position = key === "modelPosition";
      const value = position ? target.value : target.checked;
      const focused = document.activeElement === target;
      control.disabled = true;
      try {
        const tab = await refreshActiveTab();
        await settings.patch({[key]: value});
        let open = false;
        if (tab?.id && /^(https?:|file:)/.test(tab.url || "")) {
          try {
            const result = await sendMessage(tab.id, {type:messageType, ...(position ? {position:value} : {enabled:value})});
            open = Boolean(result?.open);
          } catch (error) {
            if (!error.message.includes("Receiving end does not exist")) throw error;
          }
        }
        setStatus(open ? appliedText(value) : savedText(value), "success");
      } catch (error) {
        setStatus(label + "设置失败：" + error.message, "error");
      } finally {
        control.disabled = false;
        await syncLiveControls().catch(() => {});
        if (focused && document.activeElement === document.body) target.focus({preventScroll:true});
      }
    });
  };
  bindLiveControl(elements.modelPosition, "modelPosition", "FRAMELENS_SET_MODEL_POSITION",
    () => "模型位置已更新", () => "模型位置已保存，下次预览时生效", "模型位置");
  bindLiveControl(elements.statusBarDividerInput, "statusBarDivider", "FRAMELENS_SET_STATUS_BAR_DIVIDER",
    on => on ? "分隔线已显示" : "分隔线已隐藏", () => "分隔线设置已保存，将在下次应用时生效", "分隔线");
  bindLiveControl(elements.liveSyncInput, "liveSync", "FRAMELENS_SET_LIVE_SYNC",
    on => on ? "实时同步已开启" : "实时同步已暂停", on => on ? "实时同步已设为默认开启" : "实时同步已设为默认暂停", "实时同步");
  elements.customNameInput.addEventListener("input", () =>
    updateMeta(getSelectedDevice())
  );
  elements.portraitBtn.addEventListener("click", () => rotateTo("portrait"));
  elements.landscapeBtn.addEventListener("click", () => rotateTo("landscape"));
  elements.swapBtn.addEventListener("click", () => {
    const width = elements.widthInput.value;
    elements.widthInput.value = elements.heightInput.value;
    elements.heightInput.value = width;
    updateMeta(getSelectedDevice());
    setOrientationState();
  });
  elements.saveCustomBtn.addEventListener("click", saveCustomDevice);
  elements.deleteCustomBtn.addEventListener("click", deleteCustomDevice);
  elements.compactToggleBtn.addEventListener("click", () =>
    setPanelCompact(!panelCompact)
  );
  elements.expandSummaryBtn.addEventListener("click", () =>
    setPanelCompact(false)
  );
  elements.collapsePanelBtn.addEventListener("click", collapseSidePanel);
  elements.openBtn.addEventListener("click", openPreview);
  elements.closeBtn.addEventListener("click", closePreview);

  chrome.tabs.onActivated.addListener(() => {
    refreshActiveTab().then(syncLiveControls).catch(() => {});
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (
      tabId === activeTab?.id &&
      (changeInfo.status === "complete" ||
        changeInfo.title ||
        changeInfo.url)
    ) {
      refreshActiveTab().then(syncLiveControls).catch(() => {});
    }
  });
  chrome.storage.onChanged?.addListener((changes, areaName) => {
    if ((areaName === "session" && changes[globalThis.FrameLensState.tabKey(activeTab?.id)]) ||
        (areaName === "local" && changes.frameLensSettings)) {
      syncLiveControls().catch(() => {});
    }
  });

  hydrate().catch((error) => setStatus(`初始化失败：${error.message}`, "error"));
})();
