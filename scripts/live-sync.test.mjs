import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// 加载完整独立模块，不再通过字符串位置截取内容脚本中的类。
const source = readFileSync(new URL("../preview/sync.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(source, context);
const { SyncController } = context.FrameLensSync;

function setup() {
  let now = 10_000;
  let sequence = 0;
  const timers = new Map();
  const location = { href: "https://example.test/page" };
  const clock = {
    now: () => now,
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  const reloads = [];
  const states = [];
  const preview = new SyncController({
    getUrl: () => location.href, clock,
    onSync: (options) => reloads.push(options),
    onState: (state) => states.push(state)
  });
  const advance = (ms) => {
    const end = now + ms;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    now = end;
  };
  return { preview, location, reloads, states, advance, timers };
}

test("连续数据与表单信号合并成一次同步", () => {
  const { preview, advance, reloads } = setup();
  preview.schedule("storage");
  advance(200);
  preview.schedule("form");
  advance(649);
  assert.equal(reloads.length, 0);
  advance(1);
  assert.equal(reloads.length, 1);
  assert.equal(reloads[0].source, "auto");
  assert.equal(preview.sources.size, 0);
});

test("路由信号不会被之后的数据事件覆盖", () => {
  const { preview, advance, reloads, location } = setup();
  location.href += "#details";
  preview.checkRoute();
  preview.schedule("storage");
  advance(650);
  assert.equal(reloads.length, 1);
  assert.equal(reloads[0].url, location.href);
  assert.equal(reloads[0].source, "route");
  assert.equal(reloads[0].refreshDocument, true);
});

test("路由在防抖期内返回原值不重载", () => {
  const { preview, advance, reloads, location } = setup();
  const original = location.href;
  location.href += "#temporary";
  preview.checkRoute();
  location.href = original;
  preview.checkRoute();
  advance(2000);
  assert.equal(reloads.length, 0);
  assert.equal(preview.state, "ready");
});

test("正在加载时保留同步任务但不打断导航", () => {
  const { preview, advance, reloads } = setup();
  preview.startNavigation();
  preview.schedule("storage");
  advance(3000);
  assert.equal(reloads.length, 0);
  assert.equal(preview.sources.size, 1);
  preview.finishNavigation();
  advance(80);
  assert.equal(reloads.length, 1);
});

test("暂停取消排队同步，恢复后仅同步一次", () => {
  const { preview, advance, reloads, timers } = setup();
  preview.schedule("storage");
  preview.setEnabled(false);
  advance(3000);
  assert.equal(timers.size, 0);
  assert.equal(reloads.length, 0);
  assert.equal(preview.state, "paused");
  preview.setEnabled(true);
  advance(650);
  assert.equal(reloads.length, 1);
});

test("连续同步受到 1500ms 限流", () => {
  const { preview, advance, reloads } = setup();
  preview.schedule("storage");
  advance(650);
  preview.schedule("storage");
  advance(1499);
  assert.equal(reloads.length, 1);
  advance(1);
  assert.equal(reloads.length, 2);
});

test("存储监听可解绑，跨域访问失败安全退出", () => {
  const { preview } = setup();
  const calls = [];
  const target = {
    addEventListener(type, listener) { calls.push(["add", type, listener]); },
    removeEventListener(type, listener) { calls.push(["remove", type, listener]); }
  };
  preview.bindStorage(target);
  preview.unbindStorage();
  assert.deepEqual(calls.map(([action, type]) => [action, type]), [["add", "storage"], ["remove", "storage"]]);
  assert.equal(calls[0][2], preview.onStorage);
  assert.equal(preview.storageWindow, null);
  assert.doesNotThrow(() => preview.bindStorage({ addEventListener() { throw new Error("cross origin"); } }));
  assert.equal(preview.storageWindow, null);
});

test("纯 Hash 路由不要求文档重载", () => {
  const { preview, advance, reloads, location } = setup();
  location.href += "#new";
  preview.checkRoute();
  advance(650);
  assert.equal(reloads.length, 1);
  assert.equal(reloads[0].refreshDocument, false);
});

test("存储值不变和扩展自身设置不触发同步，clear 仍触发", () => {
  const { preview, advance, reloads } = setup();
  preview.onStorage({ key: "value", oldValue: "1", newValue: "1" });
  preview.onStorage({ key: "frameLensSettings", oldValue: "1", newValue: "2" });
  advance(2000);
  assert.equal(reloads.length, 0);
  preview.onStorage({ key: null, oldValue: null, newValue: null });
  advance(650);
  assert.equal(reloads.length, 1);
});

test("销毁清理任务及监听，迟到的加载和存储事件不能复活预览", () => {
  const { preview, advance, reloads, timers } = setup();
  let detached = false;
  preview.bindStorage({ addEventListener() {}, removeEventListener() { detached = true; } });
  preview.schedule("storage");
  preview.destroy();
  preview.finishNavigation();
  preview.onStorage({ key: "value", oldValue: "1", newValue: "2" });
  advance(3000);
  assert.equal(reloads.length, 0);
  assert.equal(timers.size, 0);
  assert.equal(detached, true);
  assert.equal(preview.state, "closed");
});
