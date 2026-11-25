import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const context = vm.createContext({ URL });
for (const file of ["devices.js", "core/config.js", "core/state.js"]) {
  vm.runInContext(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), context, {filename:file});
}
const config = context.FrameLensConfig;
const state = context.FrameLensState;
const makeStorage = (data = {}) => ({
  data,
  async get(key) { return { [key]: data[key] }; },
  async set(values) { Object.assign(data, structuredClone(values)); },
  async remove(key) { delete data[key]; }
});

test("默认值、非法输入、尺寸及缩放使用同一校验规则", () => {
  for (const input of [undefined, null, "bad", []]) {
    const normalized = config.normalizeSettings(input);
    assert.equal(normalized.width, 430);
    assert.equal(normalized.scale, "fit");
  }
  const normalized = config.normalizeSettings({ width: -20, height: 9999, scale: 10, frame: "invalid" });
  assert.equal(normalized.width, 240);
  assert.equal(normalized.height, 2560);
  assert.equal(normalized.scale, 1.5);
  assert.equal(normalized.frame, "iphone");
});

test("设备偏好排除 URL 和临时状态，标签页配置保留 URL", async () => {
  const storage = makeStorage();
  const settings = state.createSettingsStore(storage);
  const original = {width: 412, height: 915, scale: "0.75", url: "https://example.com/page", loading: true};
  await settings.patch(original);
  assert.equal(storage.data.frameLensSettings.url, undefined);
  assert.equal(storage.data.frameLensSettings.loading, undefined);
  assert.equal(storage.data.frameLensSettings.scale, 0.75);
  assert.equal(config.normalizePreview(original).url, original.url);
  assert.equal(config.normalizePreview({url:"javascript:alert(1)"}, "https://example.com").url, "https://example.com");
});

test("旧配置兼容升级，不改变自定义尺寸或其他保存内容", async () => {
  const storage = makeStorage({
    frameLensSettings: {presetId:"custom-1", name:"我的尺寸", width:412, height:915, frame:"android", scale:"0.75", liveSync:false, url:"https://old.example"},
    frameLensCustomDevices: [{id:"custom-1",width:412,height:915}],
    frameLensPanelCompact: true
  });
  const settings = state.createSettingsStore(storage);
  await settings.patch({});
  assert.equal(storage.data.frameLensSettings.name, "我的尺寸");
  assert.equal(storage.data.frameLensSettings.width, 412);
  assert.equal(storage.data.frameLensSettings.liveSync, false);
  assert.equal(storage.data.frameLensSettings.url, undefined);
  assert.equal(storage.data.frameLensCustomDevices.length, 1);
  assert.equal(storage.data.frameLensPanelCompact, true);
  await settings.patch({ liveSync: true });
  assert.equal(storage.data.frameLensSettings.name, "我的尺寸");
  assert.equal(storage.data.frameLensSettings.liveSync, true);
});

test("不同标签页状态和默认设备偏好互不覆盖", async () => {
  const storage = makeStorage();
  const tabs = state.createTabStateStore(storage);
  const settings = state.createSettingsStore(storage);
  const sender = (id) => ({tab:{id},frameId:0,url:"https://example.com/page"});
  await settings.patch({width:430,height:932});
  await tabs.handle({type:"FRAMELENS_SAVE_TAB_STATE",config:{width:412,height:915}},sender(1));
  await tabs.handle({type:"FRAMELENS_SAVE_TAB_STATE",config:{width:768,height:1024}},sender(2));
  assert.equal((await tabs.handle({type:"FRAMELENS_GET_TAB_STATE"},sender(1))).config.width,412);
  assert.equal((await tabs.handle({type:"FRAMELENS_GET_TAB_STATE"},sender(2))).config.width,768);
  assert.equal((await settings.load()).width,430);
});

test("状态栏高度独立，所有模型都保留完整页面视口", () => {
  for (const frame of ["iphone", "android", "tablet", "browser", "none"]) {
    const metrics = config.frameMetrics(frame, 430, 932);
    assert.ok(metrics.height >= 932 + config.statusBarHeight(frame));
    assert.ok(metrics.width >= 430);
  }
  assert.equal(config.statusBarHeight("iphone"),48);
  assert.equal(config.statusBarHeight("browser"),0);
});

test("模型位置默认居中，保存位置不应用尺寸草稿，各标签页刷新后恢复各自的位置", async () => {
  for (const modelPosition of [undefined, null, "", "bottom"]) {
    assert.equal(config.normalizePreview({modelPosition}).modelPosition, "center");
  }
  const storage = makeStorage();
  const settings = state.createSettingsStore(storage);
  const tabs = state.createTabStateStore(storage);
  await settings.patch({width: 412});
  for (const [id, modelPosition] of [[1, "left"], [2, "right"]]) {
    await settings.patch({modelPosition});
    const sender = {tab: {id}, frameId: 0, url: "https://example.com/home"};
    await tabs.handle({type: "FRAMELENS_SAVE_TAB_STATE", config: {modelPosition}}, sender);
  }
  const restored = state.createTabStateStore(storage);
  for (const [id, position] of [[1, "left"], [2, "right"]]) {
    const sender = {tab: {id}, frameId: 0, url: "https://example.com/detail"};
    const {config} = await restored.handle({type: "FRAMELENS_GET_TAB_STATE"}, sender);
    assert.equal(config.modelPosition, position);
  }
  assert.equal((await settings.load()).width, 412);
  assert.equal((await settings.load()).modelPosition, "right");
});

test("文件网址按文件隔离，普通网址按站点隔离", () => {
  assert.notEqual(state.scopeOf("file:///a.html"), state.scopeOf("file:///b.html"));
  assert.equal(state.scopeOf("https://example.com/a"), state.scopeOf("https://example.com/b"));
  assert.equal(state.scopeOf("chrome://settings"), null);
});

test("后台按字段串行保存，两个入口同时修改不同的偏好都保留，失败不会堵住后续写入", async () => {
  const storage = makeStorage({frameLensSettings:{width:412}});
  const writer = state.createSettingsStore(storage);
  await Promise.all([writer.patch({modelPosition:"right"}), writer.patch({statusBarDivider:true})]);
  const prefs = await writer.load();
  assert.equal(prefs.modelPosition, "right");
  assert.equal(prefs.statusBarDivider, true);
  const set = storage.set.bind(storage);
  storage.set = async () => { throw new Error("failed"); };
  await assert.rejects(writer.patch({width:518}), /failed/);
  storage.set = set;
  await writer.patch({liveSync:false});
  assert.equal((await writer.load()).width, 412);
});

test("仅同一外层地址的刷新恢复内页；主动导航、跨域、旧记录使用当前外层地址", () => {
  const outer = "https://example.com/login", detail = "https://example.com/detail?q=1#part";
  const entry = {outerUrl:outer, config:{url:detail}};
  assert.equal(state.restoreUrl(entry, outer, "reload"), detail);
  for (const type of ["navigate","back_forward",undefined]) assert.equal(state.restoreUrl(entry, outer, type),outer);
  assert.equal(state.restoreUrl(entry, outer+"?new", "reload"), outer+"?new");
  assert.equal(state.restoreUrl({config:{url:detail}},outer,"reload"), outer);
  for (const url of ["https://other.test/x","about:blank","file:///x",null]) {
    assert.equal(state.restoreUrl({...entry,config:{url}},outer,"reload"),outer);
  }
});

test("旋转旧标签页不会覆盖另一标签页后来应用的设备尺寸；当前设备旋转仍可保存", async () => {
  const writer = state.createSettingsStore(makeStorage());
  const before = {presetId:"phone-a",width:412,height:915};
  await writer.patch(before);
  await writer.patch({width:915,height:412}, before);
  assert.equal((await writer.load()).width,915);
  await writer.patch({presetId:"tablet-b",width:768,height:1024});
  await writer.patch({width:412,height:915}, {...before,width:915,height:412});
  assert.equal((await writer.load()).width,768);
});

test("状态栏分隔线默认与旧配置均隐藏，只接受明确的布尔开启值", () => {
  assert.equal(config.defaults.statusBarDivider, false);
  for (const value of [undefined, null, false, "true", "false", 1, 0]) {
    assert.equal(config.normalizeSettings({ statusBarDivider: value }).statusBarDivider, false);
  }
  assert.equal(config.normalizeSettings({ statusBarDivider: true }).statusBarDivider, true);
  assert.equal(config.normalizePreview({ width: 412 }).statusBarDivider, false);
});

test("分隔线偏好独立保存，不覆盖尺寸；标签页状态刷新可恢复且互不串用", async () => {
  const storage = makeStorage({ frameLensSettings: { width: 412, height: 915, liveSync: false } });
  const settings = state.createSettingsStore(storage);
  await settings.patch({ statusBarDivider: true });
  assert.equal((await settings.load()).width, 412);
  assert.equal((await settings.load()).liveSync, false);
  assert.equal((await state.createSettingsStore(storage).load()).statusBarDivider, true);
  const sender = (id) => ({ tab: { id }, frameId: 0, url: "https://example.com/page" });
  const tabs = state.createTabStateStore(storage);
  await tabs.handle({ type: "FRAMELENS_SAVE_TAB_STATE", config: { statusBarDivider: true } }, sender(1));
  await tabs.handle({ type: "FRAMELENS_SAVE_TAB_STATE", config: {} }, sender(2));
  const restored = state.createTabStateStore(storage);
  assert.equal((await restored.handle({ type: "FRAMELENS_GET_TAB_STATE" }, sender(1))).config.statusBarDivider, true);
  assert.equal((await restored.handle({ type: "FRAMELENS_GET_TAB_STATE" }, sender(2))).config.statusBarDivider, false);
  await settings.patch({ statusBarDivider: false });
  assert.equal((await settings.load()).statusBarDivider, false);
});
