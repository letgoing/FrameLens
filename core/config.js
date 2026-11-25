(() => {
  const defaults = globalThis.FrameLensDevices.defaultConfig;
  const frames = new Set(["iphone", "android", "tablet", "browser", "none"]);
  const normalizePosition = (value) =>
    value === "left" || value === "right" ? value : defaults.modelPosition;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const dimension = (value, fallback = 240) =>
    clamp(Number.parseInt(value, 10) || fallback, 240, 2560);

  // 持久偏好只包含设备字段，不混入当前标签页的网址或运行状态。
  const normalizeSettings = (input = {}) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) input = {};
    const width = dimension(input.width, defaults.width);
    const height = dimension(input.height, defaults.height);
    const rawScale = input.scale ?? defaults.scale;
    return {
      presetId: String(input.presetId || defaults.presetId),
      name: String(input.name || defaults.name).slice(0, 60),
      width, height,
      dpr: input.dpr === null ? null : Number(input.dpr) || defaults.dpr,
      physical: input.physical === null ? null : String(input.physical || defaults.physical),
      frame: frames.has(input.frame) ? input.frame : defaults.frame,
      modelPosition: normalizePosition(input.modelPosition),
      scale: rawScale === "fit" ? "fit" : clamp(Number.parseFloat(rawScale) || 1, 0.25, 1.5),
      orientation: width <= height ? "portrait" : "landscape",
      liveSync: input.liveSync !== false,
      statusBarDivider: input.statusBarDivider === true,
      theme: input.theme === "light" ? "light" : "dark"
    };
  };
  const normalizePreview = (input = {}, currentUrl = "") => ({
    ...normalizeSettings(input),
    toolbarHidden: input?.toolbarHidden === true,
    url: typeof input?.url === "string" && /^(https?:|file:)/.test(input.url)
      ? input.url : currentUrl
  });
  const statusBarHeight = (frame) => ({ iphone: 48, android: 40, tablet: 34 })[frame] || 0;
  const frameMetrics = (frame, width, height) => {
    if (frame === "iphone" || frame === "android") {
      return { width: width + 26, height: height + 26 + statusBarHeight(frame) };
    }
    if (frame === "tablet") {
      return { width: width + 32, height: height + 32 + statusBarHeight(frame) };
    }
    if (frame === "browser") return { width: width + 2, height: height + 40 };
    return { width: width + 2, height: height + 2 };
  };
  globalThis.FrameLensConfig = Object.freeze({
    defaults, clamp, dimension, normalizePosition, normalizeSettings, normalizePreview, statusBarHeight, frameMetrics
  });
})();
