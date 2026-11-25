import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const manifest = JSON.parse(read("manifest.json"));
assert(manifest.manifest_version === 3, "manifest_version 必须为 3");
assert(!manifest.action?.default_popup, "工具栏不应再打开设置弹窗");
assert(
  manifest.side_panel?.default_path === "popup.html",
  "缺少右侧边栏入口"
);
assert(
  manifest.permissions.includes("sidePanel"),
  "缺少 Side Panel API 权限"
);
assert(
  manifest.web_accessible_resources?.some(
    (entry) =>
      entry.resources?.includes("icons/icon-128.png") &&
      entry.matches?.includes("<all_urls>")
  ),
  "模型机工具栏的新 Logo 未声明为可访问资源"
);
assert(manifest.background?.service_worker === "background.js", "缺少后台脚本");

const declaredFiles = [
  manifest.side_panel.default_path,
  manifest.background.service_worker,
  ...manifest.content_scripts.flatMap((entry) => entry.js),
  ...Object.values(manifest.icons)
];
for (const file of declaredFiles) {
  assert(fs.existsSync(path.join(root, file)), `Manifest 引用的文件不存在：${file}`);
  if (file.endsWith(".js")) new vm.Script(read(file), {filename:file});
}

const sandbox = { globalThis: {} };
vm.runInNewContext(read("devices.js"), sandbox, { filename: "devices.js" });
const { presets, defaultConfig } = sandbox.globalThis.FrameLensDevices;
assert(read("core/runtime.js").includes("manifest.version"), "版本号应统一读取 Manifest");
assert(Array.isArray(presets) && presets.length >= 12, "设备预设数量不足");
assert(new Set(presets.map((item) => item.id)).size === presets.length, "设备 ID 重复");
assert(
  presets.every(
    (item) =>
      Number.isInteger(item.width) &&
      Number.isInteger(item.height) &&
      item.width >= 240 &&
      item.height >= 240
  ),
  "设备尺寸无效"
);

const iphone15pm = presets.find((item) => item.id === "iphone-15-pro-max");
const iphone17p = presets.find((item) => item.id === "iphone-17-pro");
assert(
  iphone15pm?.width === 430 && iphone15pm?.height === 932,
  "iPhone 15 Pro Max CSS 视口应为 430 × 932"
);
assert(
  iphone17p?.width === 402 && iphone17p?.height === 874,
  "iPhone 17 Pro CSS 视口应为 402 × 874"
);
assert(
  presets.some((item) => item.frame === "android") &&
    presets.some((item) => item.frame === "tablet") &&
    presets.some((item) => item.frame === "browser"),
  "模型外框类型覆盖不完整"
);
assert(
  presets.some((item) => item.id === defaultConfig.presetId),
  "默认设备不存在"
);

const popupHtml = read("popup.html");
assert(
  !popupHtml.includes('class="eyebrow"') &&
    !popupHtml.includes("把当前页面放进真实尺寸的模型机") &&
    !popupHtml.includes("同步外部存储数据与路由，普通页面渲染不触发刷新"),
  "侧栏不应恢复重复的小字说明"
);
assert(
  [...read("popup.css").matchAll(/font-size:\s*([\d.]+)px/g)].every(([, size]) => Number(size) >= 12),
  "侧栏辅助字号不得低于 12px"
);
for (const [, file] of popupHtml.matchAll(/<script src="([^"]+)"/g)) {
  assert(fs.existsSync(path.join(root, file)), `侧栏引用的脚本不存在：${file}`);
  new vm.Script(read(file), {filename:file});
}
for (const requiredId of [
  "deviceSelect",
  "widthInput",
  "heightInput",
  "frameSelect",
  "scaleSelect",
  "saveCustomBtn",
  "compactToggleBtn",
  "collapsePanelBtn",
  "expandSummaryBtn",
  "liveSyncInput",
  "statusBarDividerInput",
  "openBtn",
  "closeBtn"
]) {
  assert(popupHtml.includes(`id="${requiredId}"`), `Popup 缺少控件：${requiredId}`);
}
assert(
  read("background.js").includes("openPanelOnActionClick: true") &&
    read("popup.js").includes("chrome.sidePanel.close"),
  "边栏缺少工具栏点击打开或收起能力"
);
assert(
  popupHtml.includes('class="brand-mark"') &&
    popupHtml.includes('src="icons/icon-128.png"') &&
    read("preview/view.js").includes('chrome.runtime.getURL("icons/icon-128.png")') &&
    read("preview/template.js").includes('class="fl-brand-mark"'),
  "新 Logo 未同时接入设置边栏和模型机工具栏"
);

const contentSource = read("content.js");
const viewSource = read("preview/view.js");
const styleSource = read("preview/styles.js");
const templateSource = read("preview/template.js");
const syncSource = read("preview/sync.js");
for (const messageType of [
  "FRAMELENS_PING",
  "FRAMELENS_OPEN",
  "FRAMELENS_CLOSE",
  "FRAMELENS_SET_LIVE_SYNC",
  "FRAMELENS_SET_STATUS_BAR_DIVIDER",
  "FRAMELENS_TOGGLE"
]) {
  assert(contentSource.includes(messageType), `内容脚本缺少消息：${messageType}`);
}
assert(
  viewSource.includes("attachShadow"),
  "页面浮层应使用 Shadow DOM 隔离网站样式"
);
assert(
  templateSource.includes("fl-status-bar") &&
    templateSource.includes("fl-status-time") &&
    viewSource.includes("setInterval(this.updateClock"),
  "模型机缺少默认动态时间状态栏"
);
assert(
  styleSource.includes("border-radius: 64px") &&
    styleSource.includes("border-radius: 52px"),
  "iPhone 外壳与屏幕圆角比例未按新版校准"
);
const statusBarStyle = styleSource.match(/\.fl-status-bar \{([\s\S]*?)\}/)?.[1] || "";
assert(
  defaultConfig.statusBarDivider === false &&
    statusBarStyle.includes("box-shadow: none") &&
    styleSource.includes('.fl-status-bar[data-divider="true"]::after') &&
    popupHtml.includes('id="statusBarDividerInput" type="checkbox" />'),
  "分隔线必须默认隐藏，并通过侧栏独立开关显示"
);
assert(
  statusBarStyle.includes("color: #11141a") &&
    statusBarStyle.includes("background: #fff") &&
    styleSource.includes("background: #0a0c0f"),
  "状态栏无法取色时应为白底深色文字与图标，保持顶部纯色外壳"
);
assert(
  viewSource.includes("this.statusTheme.bind()") &&
    viewSource.includes("this.statusTheme.destroy()") &&
    !read("preview/status-theme.js").includes("location.reload"),
  "状态栏自动配色应独立绑定、清理且不触发刷新"
);
assert(
  contentSource.includes("__FRAMELENS_CONTENT_VERSION__") &&
    contentSource.includes("__FRAMELENS_CONTENT_CLEANUP__") &&
    read("core/runtime.js").includes("ping?.version !== version") &&
    read("popup.js").includes("ensureContent(tabId)"),
  "缺少旧内容脚本版本握手与自动清理机制"
);
assert(
  read("core/config.js").includes("height + 26 + statusBarHeight(frame)") &&
    viewSource.includes("height + statusBarHeight(frame)"),
  "状态栏未独立计入模型机高度，可能裁切页面底部"
);
assert(
  defaultConfig.liveSync === true &&
    !viewSource.includes("new MutationObserver") &&
    syncSource.includes('target.addEventListener("storage"') &&
    !viewSource.includes('window.addEventListener("storage"') &&
    syncSource.includes("1500 - elapsed"),
  "实时同步应监听预览收到的外部存储事件，不能由普通 DOM 变化或自身写入触发重载"
);
assert(
  !viewSource.includes("window.fetch =") &&
    !viewSource.includes("XMLHttpRequest.prototype"),
  "实时同步不应改写页面 fetch 或 XMLHttpRequest"
);
assert(
  read("popup.js").includes("FRAMELENS_SET_LIVE_SYNC") &&
    templateSource.includes('data-action="live-sync"'),
  "设置边栏或模型机工具栏缺少实时同步开关"
);

assert(read("core/runtime.js").includes("files: manifest.content_scripts[0].js"), "手动注入应复用 Manifest 模块顺序");
const scripts = manifest.content_scripts[0].js;
for (const file of ["core/config.js", "core/state.js", "core/runtime.js", "preview/styles.js", "preview/template.js", "preview/sync.js", "preview/navigation.js", "preview/status-theme.js", "preview/view.js"]) {
  assert(scripts.includes(file) && scripts.indexOf(file) < scripts.indexOf("content.js"), `入口缺少前置模块：${file}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      name: manifest.name,
      version: manifest.version,
      presets: presets.length,
      criticalViewports: {
        iphone15ProMax: `${iphone15pm.width}x${iphone15pm.height}`,
        iphone17Pro: `${iphone17p.width}x${iphone17p.height}`
      }
    },
    null,
    2
  )
);
