import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("../preview/view.js", import.meta.url), "utf8");
function setup(url = "https://example.test/home?from=login#tab") {
  const calls = [], timers = [];
  const location = { href: "https://example.test/login", replace: (url) => calls.push(["navigate", url]) };
  const noop = () => {};
  const context = vm.createContext({
    URL, location,
    chrome: { runtime: { getURL: (url) => url } },
    FrameLensConfig: {},
    FrameLensRuntime: { settings:{} },
    window: { removeEventListener: noop, clearInterval: noop, setTimeout: (fn) => timers.push(fn) },
    document: { removeEventListener: noop }
  });
  context.chrome.storage = { local: {} };
  vm.runInContext(fs.readFileSync(new URL("../preview/navigation.js", import.meta.url), "utf8"), context);
  vm.runInContext(source, context);
  const view = Object.create(context.FrameLensView.FrameLensPreview.prototype);
  Object.assign(view, {
    destroyed: false, closing: false, closePromise: null,
    iframe: { src: location.href, contentWindow: { location: { href: url } } },
    host: { remove: () => calls.push(["remove"]) },
    sync: { destroy: () => calls.push(["sync-cleanup"]) },
    statusTheme: { destroy: noop }, syncLabel: {},
    onClose: async () => calls.push(["clear-state"]),
    onChange: async () => calls.push(["save"])
  });
  return { view, calls, location, timers };
}

test("关闭读取 iframe 实际 URL，保留路径、查询参数和 Hash，不用初始 src", async () => {
  const { view, calls, timers } = setup();
  await view.close();
  assert.deepEqual(calls, [["clear-state"], ["sync-cleanup"], ["remove"]]);
  assert.equal(timers.length, 1);
  timers[0]();
  assert.deepEqual(calls.at(-1), ["navigate", "https://example.test/home?from=login#tab"]);
});

test("等待会话清理后才销毁和跳转；重复关闭去重，关闭途中不再保存预览", async () => {
  const { view, calls, timers } = setup();
  let finish;
  view.onClose = () => new Promise(resolve => { finish = resolve; calls.push(["clear-start"]); });
  const closing = view.close();
  assert.equal(view.close(), closing);
  await view.saveState();
  await view.handleAction("rotate");
  assert.deepEqual(calls, [["clear-start"]]);
  assert.equal(timers.length, 0);
  finish(); await closing;
  assert.equal(view.destroyed, true);
  assert.equal(timers.length, 1);
});

test("清理失败保留预览、不跳转且允许重试", async () => {
  const { view, calls, timers } = setup();
  view.onClose = async () => { throw new Error("存储暂不可用"); };
  await assert.rejects(view.close(), /存储暂不可用/);
  assert.equal(view.destroyed, false);
  assert.equal(view.closing, false);
  assert.equal(view.syncLabel.textContent, "关闭失败");
  assert.deepEqual(calls, []);
  assert.equal(timers.length, 0);
  view.onClose = async () => calls.push(["clear-retry"]);
  await view.close();
  assert.equal(view.destroyed, true);
});

test("原页面与预览同地址时只关闭，不额外刷新", async () => {
  const { view, timers } = setup("https://example.test/login");
  await view.close();
  assert.equal(view.destroyed, true);
  assert.equal(timers.length, 0);
});

test("空白、受限、不可读 iframe 不使用旧 src 猜测跳转", async () => {
  for (const url of ["about:blank", "chrome-error://chromewebdata/", "javascript:alert(1)"]) {
    const { view, timers } = setup(url);
    await view.close();
    assert.equal(timers.length, 0);
  }
  const { view, timers } = setup();
  Object.defineProperty(view.iframe.contentWindow, "location", { get() { throw new Error("SecurityError"); } });
  await view.close();
  assert.equal(timers.length, 0);
});

test("扩展升级仅销毁资源，不清会话、不导航；旧关闭任务不能在销毁后跳转", async () => {
  const { view, calls, timers } = setup();
  let finish;
  view.onClose = () => new Promise(resolve => { finish = resolve; });
  const closing = view.close();
  view.destroy();
  finish(); await closing;
  assert.deepEqual(calls, [["sync-cleanup"], ["remove"]]);
  assert.equal(timers.length, 0);
});

test("预览重新加载时替换 Esc 监听，销毁时移除最后文档的监听", () => {
  const { view } = setup();
  const events = [];
  const doc = (name) => ({
    addEventListener: (...args) => events.push([name, "add", ...args]),
    removeEventListener: (...args) => events.push([name, "remove", ...args])
  });
  view.onKeydown = () => {};
  view.iframe.contentDocument = doc("first"); view.bindPreviewKeyboard();
  view.iframe.contentDocument = doc("second"); view.bindPreviewKeyboard();
  view.destroy();
  assert.deepEqual(events.map(([name, action, key, fn, capture]) => [name, action, key, fn === view.onKeydown, capture]), [
    ["first", "add", "keydown", true, true], ["first", "remove", "keydown", true, true],
    ["second", "add", "keydown", true, true], ["second", "remove", "keydown", true, true]
  ]);
});
