import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("../background.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url)));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const makeBackground = (data = {}) => {
  let listener;
  let removed;
  const ignore = { addListener() {} };
  const chrome = {
    runtime: {
      getManifest: () => manifest,
      onMessage: { addListener(fn) { listener = fn; } },
      onInstalled: ignore, onStartup: ignore
    },
    tabs: { onRemoved: { addListener(fn) { removed = fn; } } },
    commands: { onCommand: ignore },
    sidePanel: { async setPanelBehavior() {} },
    storage: { session: {
      async set(values) { await delay(5); Object.assign(data, structuredClone(values)); },
      async get(key) { return structuredClone({ [key]: data[key] }); },
      async remove(key) { delete data[key]; }
    } }
  };
  const context = vm.createContext({ chrome, URL, console });
  context.importScripts = (...files) => files.forEach((file) =>
    vm.runInContext(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), context, {filename:file})
  );
  vm.runInContext(source, context);
  return {
    data,
    removed,
    message(type, config, tabId = 1, url = "https://example.com/page", frameId = 0) {
      return new Promise((resolve) => {
        listener({ type: `FRAMELENS_${type}_TAB_STATE`, config },
          { tab: { id: tabId }, url, frameId }, (value) => resolve(structuredClone(value)));
      });
    }
  };
};
const config = { width: 412, height: 915, frame: "android", scale: 0.75, liveSync: false };
const expected = {
  ...config, modelPosition: "center", toolbarHidden: false, presetId: "iphone-15-pro-max", name: "iPhone 15 Pro Max", dpr: 3,
  physical: "1290 × 2796", orientation: "portrait", theme: "dark", statusBarDivider: false, url: "https://example.com/page"
};

test("后台重新创建后仍可恢复已应用的标签页配置", async () => {
  const first = makeBackground();
  assert.equal((await first.message("SAVE", config)).ok, true);
  const restarted = makeBackground(first.data);
  assert.deepEqual((await restarted.message("GET")).config, expected);
  assert.equal((await restarted.message("GET", null, 2)).config, null);
});

test("连续保存与关闭按顺序完成，刷新不会复活已关闭的预览", async () => {
  const app = makeBackground();
  const save = app.message("SAVE", config);
  const clear = app.message("CLEAR");
  const get = app.message("GET");
  await Promise.all([save, clear]);
  assert.equal((await get).config, null);
});

test("同一网站路由可恢复，换站点后清理预览", async () => {
  const app = makeBackground();
  await app.message("SAVE", config);
  assert.deepEqual((await app.message("GET", null, 1, "https://example.com/next")).config, expected);
  assert.equal((await app.message("GET", null, 1, "https://other.example/page")).config, null);
  assert.equal((await app.message("GET")).config, null);
});

test("子框架不能覆盖顶层状态，关闭标签页后删除状态", async () => {
  const app = makeBackground();
  await app.message("SAVE", config);
  assert.equal((await app.message("SAVE", { width: 800 }, 1, "https://example.com/", 9)).ok, false);
  assert.deepEqual((await app.message("GET")).config, expected);
  app.removed(1);
  assert.equal((await app.message("GET")).config, null);
});
