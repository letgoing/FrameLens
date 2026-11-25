import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url)));
const source = fs.readFileSync(new URL("../core/runtime.js", import.meta.url), "utf8");

function setup(initialVersion = manifest.version) {
  const injections = [];
  const messages = [];
  let version = initialVersion;
  const chrome = {
    runtime: {
      getManifest: () => manifest,
      async sendMessage() { return {ok:true, config:{width:430}}; }
    },
    tabs: { sendMessage(id, message, callback) {
      messages.push({id,...message});
      callback(message.type === "FRAMELENS_PING" ? {version} : {ok:false,error:"保存失败"});
    } },
    scripting: { async executeScript(options) { injections.push(options); version = manifest.version; } }
  };
  const context = vm.createContext({chrome});
  vm.runInContext(source, context);
  return { runtime:context.FrameLensRuntime, chrome, injections, messages };
}

test("已加载当前版本时不重复注入", async () => {
  const {runtime,injections} = setup();
  await runtime.ensureContent(1);
  assert.equal(injections.length,0);
  assert.equal(runtime.version,manifest.version);
});
test("旧版本使用 Manifest 声明的完整模块顺序升级", async () => {
  const {runtime,injections,messages} = setup("1.2.4");
  await runtime.ensureContent(1);
  assert.equal(injections.length,1);
  assert.deepEqual(structuredClone(injections[0].files),manifest.content_scripts[0].js);
  assert.equal(messages.length,2);
});
test("注入后仍是旧版本时明确报错", async () => {
  const {runtime,chrome} = setup("1.2.4");
  chrome.scripting.executeScript = async () => {};
  await assert.rejects(runtime.ensureContent(1), /页面仍在运行旧版脚本/);
});
test("内容脚本返回失败时，侧栏和快捷键统一收到错误", async () => {
  const {runtime} = setup();
  await assert.rejects(runtime.sendToTab(1,{type:"FRAMELENS_OPEN"}), /保存失败/);
});
test("状态保存失败不会被当作已成功应用", async () => {
  const {runtime,chrome} = setup();
  chrome.runtime.sendMessage = async () => ({ok:false,error:"存储不可用"});
  await assert.rejects(runtime.requestTabState({type:"FRAMELENS_SAVE_TAB_STATE"}), /存储不可用/);
});
