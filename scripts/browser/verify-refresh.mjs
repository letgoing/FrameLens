import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readPngPixels } from "./png-pixels.mjs";

const work = path.dirname(fileURLToPath(import.meta.url));
const extension = path.resolve(work, "../..");
const releaseVersion = JSON.parse(fs.readFileSync(path.join(extension, "manifest.json"))).version;
const executable = process.env.FRAMELENS_CHROME;
if (!executable || !fs.existsSync(executable)) {
  throw new Error("请将 FRAMELENS_CHROME 指向 Chrome for Testing 或 Chromium 的可执行文件。");
}
const screenshots = fs.mkdtempSync(path.join(os.tmpdir(), "framelens-screenshots-"));
console.log("回归截图目录:", screenshots);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (probe, label, timeout = 12000) => {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeout) {
    try { const result = await probe(); if (result) return result; }
    catch (error) { lastError = error; }
    await delay(100);
  }
  throw new Error(`Timed out: ${label}${lastError ? ` (${lastError.message})` : ""}`);
};

class CDP {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.errors = [];
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === "Runtime.exceptionThrown") this.errors.push(message.params);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 12000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression, awaitPromise: true, returnByValue: true
    });
    if (result.exceptionDetails) throw new Error(
      result.exceptionDetails.exception?.description || result.exceptionDetails.text
    );
    return result.result.value;
  }
  close() { this.socket.close(); }
}

const fixture = fs.readFileSync(path.join(work, "verify.html"));
let writeOnFrameLoad = false;
const server = http.createServer((req, res) => {
  if (req.url === "/favicon.ico") { res.writeHead(204); res.end(); return; }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(writeOnFrameLoad && req.headers["sec-fetch-dest"] === "iframe"
    ? fixture.toString().replace("</body>", '<script>localStorage.setItem("preview-last-visit", String(Date.now()))</script></body>')
    : fixture);
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "framelens-refresh-"));
const origin = `http://127.0.0.1:${server.address().port}`;
const pageUrl = `${origin}/verify.html`;
const browserProcess = spawn(executable, [
  "--headless=new", "--no-first-run", "--no-default-browser-check",
  "--disable-background-networking", "--remote-debugging-port=0",
  `--user-data-dir=${profile}`, `--disable-extensions-except=${extension}`,
  `--load-extension=${extension}`, pageUrl
], { stdio: ["ignore", "ignore", "pipe"] });
let stderr = "";
browserProcess.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-12000); });
const sessions = [];
const checks = [];
const host = 'document.querySelector("#__framelens_preview_host__")';
const shadow = `${host}?.shadowRoot`;
let browser;

try {
  const port = await until(() => {
    const file = path.join(profile, "DevToolsActivePort");
    return fs.existsSync(file) && fs.readFileSync(file, "utf8").split("\n")[0];
  }, "Chrome debugging port");
  const base = `http://127.0.0.1:${port}`;
  const targets = () => fetch(`${base}/json/list`).then((r) => r.json());
  const connect = async (target) => {
    const session = new CDP(target.webSocketDebuggerUrl);
    sessions.push(session);
    await session.send("Runtime.enable");
    return session;
  };
  const version = await fetch(`${base}/json/version`).then((r) => r.json());
  browser = new CDP(version.webSocketDebuggerUrl);
  const workers = new Map();
  const { workerTarget, worker } = await until(async () => {
    for (const target of (await targets()).filter((t) => t.type === "service_worker" && t.url.endsWith("/background.js"))) {
      if (!workers.has(target.id)) workers.set(target.id, await connect(target));
      const session = workers.get(target.id);
      if (await session.eval('chrome.runtime.getManifest().name.startsWith("FrameLens")')) {
        return { workerTarget: target, worker: session };
      }
    }
    return null;
  }, "real FrameLens extension service worker");
  const extensionOrigin = `chrome-extension://${new URL(workerTarget.url).host}`;
  const pageTarget = (await targets()).find((t) => t.url === pageUrl);
  const page = await connect(pageTarget);
  await page.send("Page.enable");
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1200, height: 1100, deviceScaleFactor: 1, mobile: false
  });
  const tabId = await until(() => worker.eval(`(async () => (await chrome.tabs.query({})).find(t => (t.url || t.pendingUrl) === ${JSON.stringify(pageUrl)})?.id)()`), "loaded target tab").catch(async (error) => {
    console.error(await worker.eval('(async () => ({tabs:await chrome.tabs.query({}),permissions:await chrome.permissions.getAll(),name:chrome.runtime.getManifest().name}))()'));
    console.error(await page.eval('({url:location.href,text:document.body.innerText.slice(0,400)})'));
    throw error;
  });
  const ping = async (id = tabId) => worker.eval(`chrome.tabs.sendMessage(${id}, {type:"FRAMELENS_PING"})`);
  await until(() => ping(), "content script loaded");
  assert.equal((await ping()).open, false);
  assert.equal((await ping()).version, JSON.parse(fs.readFileSync(path.join(extension, "manifest.json"))).version);

  // 打开真实扩展设置页面，在目标网页保持活动的情况下点击“应用”。
  const panelTabId = await worker.eval(`(async () => (await chrome.tabs.create({url:${JSON.stringify(`${extensionOrigin}/popup.html`)},active:false})).id)()`);
  const panelTarget = await until(async () => (await targets()).find((t) => t.url === `${extensionOrigin}/popup.html`), "settings page");
  const panel = await connect(panelTarget);
  await until(() => panel.eval('document.querySelectorAll(".device-chip").length === 4'), "settings ready");
  // 窄侧栏维持字号，通过换行和滚动容纳内容；所有原有操作仍可见可用。
  for (const [width,height] of [[300,600],[360,800],[420,900]]) {
    await panel.send("Emulation.setDeviceMetricsOverride", {width,height,deviceScaleFactor:1,mobile:false});
    await panel.eval('window.scrollTo(0,0)');
    const typography = await panel.eval(`(() => {
      const font=(s)=>parseFloat(getComputedStyle(document.querySelector(s)).fontSize);
      const clipped=[...document.querySelectorAll(".device-chip strong,.device-meta strong,.live-sync-copy strong")]
        .filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.textContent);
      const title=document.querySelector(".brand-title-row").getBoundingClientRect();
      const headerButtons=document.querySelector(".panel-header-actions").getBoundingClientRect();
      return {overflow:document.documentElement.scrollWidth>innerWidth,clipped,
        heading:font("h2"),label:font(".field > span"),input:font("#widthInput"),select:font("select"),
        button:font("#openBtn"),switch:font(".live-sync-copy strong"),meta:font(".device-meta span"),
        headerOverlap:title.right>headerButtons.left,
        helpers:document.querySelectorAll(".eyebrow,.brand-copy p,.live-sync-copy small").length};
    })()`);
    assert.equal(typography.overflow,false,`side panel ${width}px horizontal overflow`);
    assert.deepEqual(typography.clipped,[],`side panel ${width}px clipped labels`);
    assert.equal(typography.headerOverlap,false);
    assert.equal(typography.helpers,0);
    for (const key of ["label","select","button","switch"]) assert.ok(typography[key]>=14,`${key} font at ${width}px`);
    assert.ok(typography.heading>=16 && typography.input>=16 && typography.meta>=12);
    await panel.eval('document.querySelector("#customNameInput").scrollIntoView({block:"center"})');
    assert.equal(await panel.eval('(() => {const r=document.querySelector("#customNameInput").getBoundingClientRect(),a=document.querySelector(".actions").getBoundingClientRect();return r.top>=0 && r.bottom<=a.top})()'),true,"custom name remains reachable above sticky actions");
    await panel.eval('window.scrollTo(0,0)');
    if (width===360) {
      const shot=await panel.send("Page.captureScreenshot",{format:"png"});
      fs.writeFileSync(path.join(screenshots,`FrameLens-settings-readable-v${releaseVersion}.png`),Buffer.from(shot.data,"base64"));
    }
    await panel.eval('document.querySelector("#compactToggleBtn").click()');
    assert.equal(await panel.eval('document.body.classList.contains("panel-compact") && getComputedStyle(document.querySelector(".collapsed-summary")).display === "flex"'),true);
    assert.equal(await panel.eval('document.documentElement.scrollWidth<=innerWidth'),true);
    await panel.eval('document.querySelector("#expandSummaryBtn").click()');
    assert.equal(await panel.eval('document.body.classList.contains("panel-compact")'),false);
  }
  checks.push("侧栏 300/360/420px 宽度字号不缩小、无横向溢出或关键文字截断；输入可滚动到达，收起/展开正常");
  await panel.eval(`(() => {
    for (const [id, value] of [["widthInput", 412], ["heightInput", 915]]) {
      const input = document.getElementById(id); input.value = value;
      input.dispatchEvent(new Event("input", {bubbles:true}));
    }
    document.getElementById("frameSelect").value = "android";
    document.getElementById("scaleSelect").value = "0.75";
    document.getElementById("openBtn").click();
  })()`);
  await until(() => panel.eval('document.querySelector("#status").textContent.includes("刷新页面后会自动恢复")'), "apply confirmation");
  const stateKey = `frameLensPreview:${tabId}`;
  const stored = () => worker.eval(`(async () => (await chrome.storage.session.get(${JSON.stringify(stateKey)}))[${JSON.stringify(stateKey)}])()`);
  const snapshot = () => page.eval(`(() => {
    const s = ${shadow}; if (!s) return null;
    const f = s.querySelector("iframe");
    return {
      width:f.clientWidth, height:f.clientHeight,
      frame:s.querySelector(".fl-device").className,
      scale:s.querySelector(".fl-zoom-value").textContent,
      theme:s.querySelector(".fl-overlay").dataset.theme,
      liveSync:s.querySelector('[data-action="live-sync"]').getAttribute("aria-pressed"),
      bottomBar:!!f.contentDocument?.querySelector("#testBottomBar"),
      nestedPreview:!!f.contentDocument?.querySelector("#__framelens_preview_host__")
    };
  })()`);
  const ready = () => until(() => page.eval(`${shadow}?.querySelector("iframe")?.contentDocument?.querySelector("#testBottomBar") != null && ${shadow}?.querySelector(".fl-loader").classList.contains("hidden") && ${shadow}?.querySelector(".fl-device").style.transform`), "preview loaded and scaled");
  const click = (action) => page.eval(`${shadow}.querySelector('[data-action="${action}"]').click()`);
  const reload = async (hard = false) => {
    await page.eval("window.__oldDocument = true");
    await page.send("Page.reload", { ignoreCache: hard });
    await until(() => page.eval("document.readyState === 'complete' && !window.__oldDocument"), "new document");
    await until(() => ping(), "reloaded content script");
  };
  await ready();
  const initial = await snapshot();
  assert.equal(initial.width, 412);
  assert.equal(initial.height, 915);
  assert.equal(initial.scale, "75%");
  assert.equal(initial.nestedPreview, false);
  checks.push("真实扩展设置页点击应用成功，自定义 412×915 / Android / 75%");

  const savedPrefs = () => panel.eval('(async () => (await chrome.storage.local.get("frameLensSettings")).frameLensSettings)()');
  await panel.eval(`(() => {
    const w = document.querySelector("#widthInput"); w.value = 518; w.dispatchEvent(new Event("input",{bubbles:true}));
    document.querySelector("#liveSyncInput").click();
  })()`);
  await until(async () => (await stored())?.config.liveSync === false, "sync paused with pending width");
  assert.equal((await savedPrefs()).width, 412, "切换同步不能保存未应用的宽度");
  assert.equal((await snapshot()).width, 412);
  assert.equal(await panel.eval('document.querySelector("#widthInput").value'), "518");
  await panel.eval('document.querySelector("#openBtn").click()');
  await until(async () => (await savedPrefs()).width === 518 && (await snapshot()).width === 518, "explicit apply commits draft");
  await panel.eval(`(() => {
    const w = document.querySelector("#widthInput"); w.value=412; w.dispatchEvent(new Event("input",{bubbles:true}));
    document.querySelector("#openBtn").click();
  })()`);
  await until(async () => (await savedPrefs()).width === 412 && (await snapshot()).width === 412, "restore test width");
  await panel.eval('document.querySelector("#liveSyncInput").click()');
  await until(async () => (await stored())?.config.liveSync === true, "resume sync");
  checks.push("同步开关不保存宽度草稿；只有点击应用后才更新模型和默认尺寸");
  for (const [position,enabled] of [["right",false],["center",true]]) {
    await Promise.all([
      panel.eval(`document.querySelector('#modelPosition input[value="${position}"]').click()`),
      click("live-sync")
    ]);
    await until(async () => {
      const defaults = await savedPrefs(), tab = (await stored())?.config;
      return defaults.modelPosition === position && defaults.liveSync === enabled &&
        tab?.modelPosition === position && tab.liveSync === enabled &&
        await panel.eval('!document.querySelector("#modelPosition").disabled');
    },"concurrent toolbar/side panel changes preserved");
  }
  checks.push("同时点侧栏模型位置和顶部同步开关，默认设置和标签页状态均保留两项变更");

  const frameHref = () => page.eval(`${shadow}.querySelector("iframe").contentWindow.location.href`);
  for (const [method, hard] of [["pushState",false],["replaceState",true]]) {
    const url = origin + "/inside/" + method + "?source=login#detail";
    await page.eval(`${shadow}.querySelector("iframe").contentWindow.history.${method}({}, "", ${JSON.stringify(url)})`);
    await reload(hard); await ready();
    assert.equal(await frameHref(),url,"整页刷新恢复刚刚进入的同源内页");
  }
  const fullUrl = origin+"/inside/document?from=details#tab";
  await page.eval(`${shadow}.querySelector("iframe").contentWindow.location.assign(${JSON.stringify(fullUrl)})`);
  await until(() => page.eval(`${shadow}.querySelector("iframe").contentDocument?.readyState==="complete" && ${shadow}.querySelector("iframe").contentWindow.location.href===${JSON.stringify(fullUrl)}`), "frame document committed");
  await reload(); await ready(); assert.equal(await frameHref(),fullUrl);
  const foreign = pageUrl.replace("127.0.0.1","localhost");
  await page.eval(`${shadow}.querySelector("iframe").setAttribute("src",${JSON.stringify(foreign)})`);
  await until(async () => (await stored())?.config.url === pageUrl && await page.eval(`${shadow}.querySelector("iframe").contentDocument === null`), "cross-origin clears old checkpoint");
  await reload(true); await ready(); assert.equal(await frameHref(), pageUrl);
  // 再建立一个不同的模型内地址，确保测试外层主动导航的优先级。
  await page.eval(`${shadow}.querySelector("iframe").contentWindow.history.pushState({}, "", ${JSON.stringify(fullUrl)})`);
  await page.send("Page.navigate",{url:pageUrl+"?fresh=1"});
  await until(() => page.eval('location.search === "?fresh=1"'),"new outer page"); await ready();
  assert.equal(await frameHref(), pageUrl+"?fresh=1", "主动导航优先于上次预览内页");
  await page.send("Page.navigate",{url:pageUrl});
  await until(() => page.eval('location.search === ""'),"original fixture"); await ready();
  checks.push("同源模型内 pushState/replaceState 后立刻普通/强制刷新仍留在详情，主动外层跳转使用新地址");
  checks.push("模型内整页跳转后刷新接续同源地址，转入跨域页再刷新不重放旧的同源地址");

  const divider = () => page.eval(`(() => {
    const s=${shadow}, b=s.querySelector(".fl-status-bar"), line=getComputedStyle(b,"::after"), f=s.querySelector("iframe");
    return {enabled:b.dataset.divider,content:line.content,height:line.height,color:line.backgroundColor,
      shadow:getComputedStyle(b).boxShadow,width:f.clientWidth,viewportHeight:f.clientHeight};
  })()`);
  const toggleDivider = async (enabled, applied = true) => {
    await panel.eval(`document.querySelector("#statusBarDividerInput").click()`);
    await until(() => panel.eval(`!document.querySelector("#statusBarDividerInput").disabled &&
      document.querySelector("#status").textContent === ${JSON.stringify(applied ? (enabled ? "分隔线已显示" : "分隔线已隐藏") : "分隔线设置已保存，将在下次应用时生效")}`), "divider setting saved");
  };
  assert.equal(await panel.eval('document.querySelector("#statusBarDividerInput").checked'),false);
  assert.equal((await divider()).content,"none");
  assert.equal((await divider()).shadow,"none");
  await page.eval(`window.__dividerLoads=0; ${shadow}.querySelector("iframe").addEventListener("load",()=>window.__dividerLoads++);`);
  // 未应用的宽度输入不能被外观开关顺便保存或应用。
  await panel.eval('document.querySelector("#widthInput").value="777"');
  await toggleDivider(true);
  assert.equal((await divider()).content,'""');
  assert.equal((await divider()).height,"1px");
  assert.equal((await divider()).width,412);
  assert.equal((await divider()).viewportHeight,915);
  assert.equal((await stored()).config.statusBarDivider,true);
  assert.equal(await worker.eval('(async () => (await chrome.storage.local.get("frameLensSettings")).frameLensSettings.width)()'),412);
  await delay(250);
  assert.equal(await page.eval("window.__dividerLoads"),0);
  await reload(); await ready();
  assert.equal((await divider()).enabled,"true");
  await reload(true); await ready();
  assert.equal((await divider()).enabled,"true");
  await panel.send("Page.reload");
  await until(() => panel.eval('document.querySelectorAll(".device-chip").length === 4 && document.querySelector("#statusBarDividerInput").checked'),"divider persisted in settings");
  await panel.send("Emulation.setDeviceMetricsOverride", {width:400,height:1250,deviceScaleFactor:1,mobile:false});
  assert.equal(await panel.eval('document.documentElement.scrollWidth <= innerWidth'),true);
  const dividerPanelShot = await panel.send("Page.captureScreenshot", {format:"png"});
  fs.writeFileSync(path.join(screenshots,`FrameLens-settings-divider-v${releaseVersion}.png`),Buffer.from(dividerPanelShot.data,"base64"));
  await page.eval(`window.__dividerLoads=0; ${shadow}.querySelector("iframe").addEventListener("load",()=>window.__dividerLoads++);`);
  await toggleDivider(false);
  assert.equal((await divider()).content,"none");
  await delay(250);
  assert.equal(await page.eval("window.__dividerLoads"),0);
  await reload(); await ready();
  assert.equal((await divider()).enabled,"false");
  await worker.eval(`chrome.tabs.sendMessage(${tabId},{type:"FRAMELENS_CLOSE"})`);
  await toggleDivider(true,false);
  assert.equal((await ping()).open,false,"修改分隔线不能自行打开预览");
  assert.equal(await stored(),undefined);
  await panel.eval('document.querySelector("#openBtn").click()');
  await until(() => panel.eval('document.querySelector("#status").textContent.includes("刷新页面后会自动恢复")'),"apply remembered divider preference");
  await ready();
  assert.equal((await divider()).enabled,"true");
  await toggleDivider(false);
  checks.push("分隔线默认隐藏，侧栏开关即时生效且零刷新；不误用未应用尺寸，普通/强制刷新与重开侧栏保留，关闭时设置不自动打开预览");

  const toolbarColors = () => page.eval(`(() => {
    const s = ${shadow};
    const color = (selector) => getComputedStyle(s.querySelector(selector)).color;
    return {
      brand:color(".fl-brand-copy strong"), device:color(".fl-device-name"),
      subtitle:color(".fl-brand-copy span"), size:color(".fl-device-size"),
      zoom:color(".fl-zoom-value"), host:getComputedStyle(${host}).color
    };
  })()`);
  console.log(JSON.stringify({toolbarBeforeValidation:await toolbarColors()}));
  if (!process.env.FRAMELENS_REPRO_TEXT) {
    assert.equal((await toolbarColors()).brand, "rgb(248, 250, 252)");
    assert.equal((await toolbarColors()).device, "rgb(248, 250, 252)");
    assert.equal((await toolbarColors()).subtitle, "rgb(181, 193, 213)");
    assert.equal((await toolbarColors()).size, "rgb(195, 204, 220)");
    assert.equal((await toolbarColors()).zoom, "rgb(195, 204, 220)");
    await click("theme");
    assert.equal((await toolbarColors()).brand, "rgb(32, 40, 58)");
    assert.equal((await toolbarColors()).device, "rgb(32, 40, 58)");
    assert.equal((await toolbarColors()).subtitle, "rgb(86, 98, 121)");
    assert.equal((await toolbarColors()).size, "rgb(79, 91, 112)");
    assert.equal((await toolbarColors()).zoom, "rgb(79, 91, 112)");
    await click("theme");
    await page.eval(`${host}.style.setProperty("color", "black", "important")`);
    assert.equal((await toolbarColors()).brand, "rgb(248, 250, 252)");
    assert.equal((await toolbarColors()).device, "rgb(248, 250, 252)");
    checks.push("顶部工具栏标题、设备名显式使用深色模式浅字/浅色模式深字");
  }

  // 工具栏放大字号后，在桌面/侧栏压缩后的窗口宽度下保持全部信息与操作。
  await worker.eval(`chrome.tabs.sendMessage(${tabId},{type:"FRAMELENS_OPEN",config:{name:"iPhone 15 Pro Max",width:430,height:932,dpr:3,physical:"1290 × 2796",frame:"iphone",scale:0.75}})`);
  await ready();
  const toolbarLayout = () => page.eval(`(() => {
    const s=${shadow}, bar=s.querySelector(".fl-toolbar"), r=bar.getBoundingClientRect();
    const rect=(el)=>el.getBoundingClientRect();
    const font=(selector)=>parseFloat(getComputedStyle(s.querySelector(selector)).fontSize);
    const elements=[...bar.querySelectorAll(".fl-brand-mark,.fl-device-name,.fl-device-metric,.fl-sync-status,.fl-zoom-value,button")];
    const outside=elements.filter(el=>{const b=rect(el);return b.width<1||b.height<1||b.left<r.left-1||b.right>r.right+1||b.top<r.top-1||b.bottom>r.bottom+1;}).map(el=>el.className);
    const buttons=[...bar.querySelectorAll("button")], pairs=[];
    for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){
      const a=rect(buttons[i]),b=rect(buttons[j]);
      if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)pairs.push([buttons[i].dataset.action,buttons[j].dataset.action]);
    }
    const pull=rect(s.querySelector(".fl-toolbar-pull")), anchor=rect(bar.querySelector('[data-action="hide-toolbar"]'));
    return {outside,pairs,overflow:bar.scrollWidth>bar.clientWidth,
      pullAligned:Math.abs((pull.left+pull.right-anchor.left-anchor.right)/2)<1 && Math.abs(pull.top-r.bottom)<1,
      fonts:{name:font(".fl-device-name"),size:font(".fl-device-size"),sync:font(".fl-sync-status"),zoom:font(".fl-zoom-value")},
      metrics:[...bar.querySelectorAll(".fl-device-metric")].map(el=>el.textContent),
      family:getComputedStyle(bar).fontFamily,buttonCount:buttons.length,
      minButtonWidth:Math.min(...buttons.map(el=>rect(el).width)),
      stageHeight:s.querySelector(".fl-stage").clientHeight,
      stageTop:rect(s.querySelector(".fl-stage")).top,toolbarBottom:r.bottom,
      viewport:[s.querySelector("iframe").clientWidth,s.querySelector("iframe").clientHeight]};
  })()`);
  for (const width of [1920,1440,1200,1024,960,900,760,560,480,360,320]) {
    await page.send("Emulation.setDeviceMetricsOverride",{width,height:1100,deviceScaleFactor:1,mobile:false});
    await delay(250);
    const layout=await toolbarLayout();
    assert.deepEqual(layout.outside,[],`toolbar ${width}px clipped content`);
    assert.deepEqual(layout.pairs,[],`toolbar ${width}px overlapping actions`);
    assert.equal(layout.overflow,false);
    assert.equal(layout.buttonCount,8);
    assert.ok(layout.pullAligned,`pull tab alignment at ${width}px`);
    assert.ok(layout.minButtonWidth>=34);
    assert.ok(layout.fonts.name>=16 && layout.fonts.size>=13 && layout.fonts.sync>=13 && layout.fonts.zoom>=14);
    assert.ok(layout.family.includes("ui-sans-serif"));
    assert.deepEqual(layout.metrics,["430 × 932 CSS px","DPR 3×","1290 × 2796 px"]);
    assert.deepEqual(layout.viewport,[430,932]);
    assert.ok(layout.stageHeight>0 && layout.stageTop>=layout.toolbarBottom-1);
    if ([1440,760,360].includes(width)) {
      const clip=await page.eval(`(() => {const s=${shadow}, r=s.querySelector(".fl-toolbar").getBoundingClientRect(), pull=s.querySelector(".fl-toolbar-pull").getBoundingClientRect();return {x:0,y:0,width:Math.ceil(r.width),height:Math.ceil(pull.bottom)+6,scale:1}})()`);
      const shot=await page.send("Page.captureScreenshot",{format:"png",clip});
      fs.writeFileSync(path.join(screenshots,`FrameLens-toolbar-${width}-v${releaseVersion}.png`),Buffer.from(shot.data,"base64"));
    }
  }
  // 长自定义名称保留完整悬停文本，且不能挤掉右侧操作。
  const longName="用于窄窗口检查的自定义设备名称".repeat(3);
  await worker.eval(`chrome.tabs.sendMessage(${tabId},{type:"FRAMELENS_OPEN",config:{name:${JSON.stringify(longName)}}})`);
  await ready();
  assert.deepEqual((await toolbarLayout()).outside,[]);
  assert.equal(await page.eval(`${shadow}.querySelector(".fl-device-name").title`),longName);
  await page.send("Emulation.setDeviceMetricsOverride",{width:1200,height:1100,deviceScaleFactor:1,mobile:false});
  await worker.eval(`chrome.tabs.sendMessage(${tabId},{type:"FRAMELENS_OPEN",config:{name:"iPhone 15 Pro Max"}})`);
  await ready();
  checks.push("顶部工具栏 320–1920px 保留正常字号、设备参数与全部 8 个按钮，无遮挡；长名称可查看完整文本，视口尺寸不变");

  // 验证模型机状态栏配色，不改变侧栏或被预览网页。
  const apply = (config) => worker.eval(`chrome.tabs.sendMessage(${tabId}, {type:"FRAMELENS_OPEN",config:${JSON.stringify(config)}})`);
  await apply({width:430,height:932,frame:"iphone",scale:"fit"});
  await ready();
  const toolbarState = () => page.eval(`(() => {
    const s = ${shadow}, frame = s.querySelector("iframe");
    const button = s.querySelector(".fl-toolbar-pull");
    const restore = button.getBoundingClientRect();
    return {
      headerHeight: s.querySelector(".fl-toolbar-dock").getBoundingClientRect().height,
      collapsed: s.querySelector(".fl-toolbar").inert,
      stageHeight: s.querySelector(".fl-stage").clientHeight,
      restoreVisible: restore.width >= 44 && restore.left >= 0 && restore.right <= innerWidth && restore.bottom <= innerHeight &&
        button.contains(s.elementFromPoint(restore.x+restore.width/2,restore.y+restore.height/2)),
      scale: parseInt(s.querySelector(".fl-zoom-value").textContent),
      focus: s.activeElement?.dataset.action, sameDocument: frame.contentDocument === window.__toolbarDoc,
      statusHeight: s.querySelector(".fl-status-bar").clientHeight
    };
  })()`);
  // 切换为自动适配后，等本轮布局提交再记录原始缩放值。
  await page.eval(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__toolbarDoc = ${shadow}.querySelector("iframe").contentDocument;
    resolve(true);
  })))`);
  const expanded = await toolbarState();
  assert.ok(expanded.headerHeight > 0 && expanded.restoreVisible && !expanded.collapsed);
  await click("hide-toolbar");
  await until(async () => {const x=await toolbarState(); return x.headerHeight===0 && x.scale>expanded.scale;}, "toolbar slid up");
  const hidden = await toolbarState();
  assert.equal(hidden.headerHeight,0);
  assert.equal(hidden.stageHeight,expanded.stageHeight + expanded.headerHeight);
  assert.ok(hidden.restoreVisible && hidden.sameDocument && hidden.scale > expanded.scale);
  assert.equal(hidden.statusHeight,expanded.statusHeight);
  assert.equal(hidden.focus,"toggle-toolbar");
  const pullClip=await page.eval(`(() => {const r=${shadow}.querySelector(".fl-toolbar-pull").getBoundingClientRect();return {x:Math.max(0,Math.floor(r.left)-32),y:0,width:108,height:52,scale:2}})()`);
  const pullShot=await page.send("Page.captureScreenshot",{format:"png",clip:pullClip});
  fs.writeFileSync(path.join(screenshots,`FrameLens-pull-collapsed-v${releaseVersion}.png`),Buffer.from(pullShot.data,"base64"));
  const positionGeometry = () => page.eval(`(() => {
    const s = ${shadow}, stage = s.querySelector(".fl-stage"), box = s.querySelector(".fl-scale-box");
    const canvas = s.querySelector(".fl-canvas"), frame = s.querySelector("iframe");
    const rect = box.getBoundingClientRect(), area = stage.getBoundingClientRect();
    return {
      left:rect.left-area.left, right:area.left+stage.clientWidth-rect.right,
      inset:parseFloat(getComputedStyle(canvas).paddingLeft),
      scrollWidth:stage.scrollWidth, width:stage.clientWidth, position:stage.dataset.position,
      frameWidth:frame.clientWidth, sameDocument:window.__toolbarDoc === frame.contentDocument
    };
  })()`);
  const choosePosition = async (position) => {
    await panel.eval(`document.querySelector('#modelPosition input[value="${position}"]').click()`);
    await until(async () => (await stored())?.config.modelPosition === position &&
      await panel.eval(`!document.querySelector("#modelPosition").disabled`), "position applied and saved");
  };
  assert.equal((await positionGeometry()).position,"center");
  for (const position of ["left","center","right"]) {
    await choosePosition(position);
    const rect = await positionGeometry();
    assert.equal(rect.position,position);
    assert.ok(rect.sameDocument);
    assert.equal(rect.frameWidth,430);
    if (position === "center") assert.ok(Math.abs(rect.left - rect.right) <= 1);
    else assert.ok(Math.abs(rect[position] - rect.inset) <= 1);
  }
  await page.send("Page.bringToFront");
  await page.eval(`${shadow}.querySelector(".fl-toolbar-pull").focus()`);
  await page.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Enter",code:"Enter",text:"\r",windowsVirtualKeyCode:13});
  await page.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
  await until(async () => {const x=await toolbarState();return x.headerHeight===expanded.headerHeight && x.scale===expanded.scale;}, "keyboard unfolds toolbar").catch(async error => {
    console.error({before:expanded,after:await toolbarState()});
    throw error;
  });
  const shown = await toolbarState();
  assert.ok(shown.sameDocument && shown.restoreVisible && !shown.collapsed);
  assert.equal(shown.focus,"toggle-toolbar");
  assert.equal(shown.scale,expanded.scale);
  await page.send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
  const pullPoint = await page.eval(`(() => {
    const s=${shadow}, dock=s.querySelector(".fl-toolbar-dock"), r=s.querySelector(".fl-toolbar-pull").getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2,duration:parseFloat(getComputedStyle(dock).transitionDuration)};
  })()`);
  assert.ok(pullPoint.duration<0.001);
  await page.send("Input.dispatchMouseEvent",{type:"mousePressed",x:pullPoint.x,y:pullPoint.y,button:"left",clickCount:1});
  await page.send("Input.dispatchMouseEvent",{type:"mouseReleased",x:pullPoint.x,y:pullPoint.y,button:"left",clickCount:1});
  await until(async () => (await stored())?.config.toolbarHidden === true,"hidden toolbar saved");
  await reload(); await ready();
  assert.equal((await toolbarState()).headerHeight,0);
  assert.equal((await positionGeometry()).position,"right");
  await page.send("Emulation.setDeviceMetricsOverride",{width:320,height:700,deviceScaleFactor:1,mobile:false});
  assert.equal((await toolbarState()).restoreVisible,true);
  await apply({width:900,height:500,scale:1});
  await ready(); await delay(250);
  const oversized = await positionGeometry();
  assert.equal(oversized.position,"right");
  assert.ok(oversized.scrollWidth > oversized.width && oversized.left >= 0);
  await choosePosition("center");
  checks.push("模型实时靠左、居中、靠右，隐藏工具栏及刷新后位置正确；保留网页和设备分辨率，窄窗口中的超宽模型可滚动");
  await page.send("Emulation.setEmulatedMedia",{features:[]});
  await page.eval(`${shadow}.querySelector(".fl-toolbar-pull").focus()`);
  await page.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
  await page.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
  await until(async () => !(await stored()) && !(await snapshot()),"Esc closes hidden preview");
  await page.send("Emulation.setDeviceMetricsOverride",{width:1200,height:1100,deviceScaleFactor:1,mobile:false});
  await apply({width:430,height:932,frame:"iphone",scale:"fit"});
  await ready();
  assert.ok((await toolbarState()).headerHeight > 0);
  checks.push("隐藏/显示工具栏保留网页文档、状态栏和键盘焦点，释放高度并重新适配；刷新后仍隐藏，窄屏可展开，Esc 退出后重开默认显示");
  for (const frame of ["iphone", "android", "tablet", "browser", "none"]) {
    await apply({width:430,height:932,frame,scale:0.75,liveSync:true});
    await ready();
    const appearance = await page.eval(`(() => {
      const s = ${shadow}, f = s.querySelector("iframe");
      const bar = getComputedStyle(s.querySelector(".fl-status-bar"));
      const bottom = f.contentDocument.querySelector("#testBottomBar").getBoundingClientRect();
      return {
        color:getComputedStyle(s.querySelector(".fl-status-time")).color,
        background:bar.backgroundColor, display:bar.display,
        signal:getComputedStyle(s.querySelector(".fl-signal-icon")).fill,
        battery:getComputedStyle(s.querySelector(".fl-battery-level")).fill,
        pageColor:f.contentWindow.getComputedStyle(f.contentDocument.body).color,
        width:f.clientWidth, height:f.clientHeight, bottom:bottom.bottom,
        screenRadius:getComputedStyle(s.querySelector(".fl-viewport")).borderTopLeftRadius
      };
    })()`);
    assert.equal(appearance.width,430); assert.equal(appearance.height,932);
    assert.equal(appearance.bottom,932);
    assert.equal(appearance.pageColor,"rgb(23, 32, 51)");
    if (["iphone", "android", "tablet"].includes(frame)) {
      assert.equal(appearance.color,"rgb(17, 20, 26)");
      assert.equal(appearance.signal,"rgb(17, 20, 26)");
      assert.equal(appearance.battery,"rgb(17, 20, 26)");
      assert.equal(appearance.background,"rgb(255, 255, 255)");
    } else assert.equal(appearance.display,"none");
    if (frame === "iphone") {
      assert.equal(appearance.screenRadius,"52px");
      await delay(250);
      const clip = await page.eval(`(() => {const r=${shadow}.querySelector(".fl-device").getBoundingClientRect();return {x:r.x-20,y:r.y-20,width:r.width+40,height:r.height+40,scale:1};})()`);
      const shot = await page.send("Page.captureScreenshot", {format:"png",clip});
      fs.writeFileSync(path.join(screenshots,`FrameLens-statusbar-v${releaseVersion}.png`), Buffer.from(shot.data,"base64"));
      if (!process.env.FRAMELENS_REPRO_TEXT) {
        const toolbarClip = await page.eval(`(() => {const r=${shadow}.querySelector(".fl-toolbar").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()`);
        for (const theme of ["dark", "light"]) {
          if (theme === "light") await click("theme");
          await delay(250);
          const toolbarShot = await page.send("Page.captureScreenshot", {format:"png",clip:toolbarClip});
          fs.writeFileSync(path.join(screenshots,`FrameLens-toolbar-${theme}-v${releaseVersion}.png`), Buffer.from(toolbarShot.data,"base64"));
        }
        await click("theme");
      }
      await click("theme");
      assert.equal(await page.eval(`getComputedStyle(${shadow}.querySelector(".fl-status-time")).color`),"rgb(17, 20, 26)");
      assert.equal(await page.eval(`getComputedStyle(${shadow}.querySelector(".fl-status-bar")).backgroundColor`),"rgb(255, 255, 255)");
      await click("theme");
    }
  }
  // 状态栏外观独立跟随 iframe 顶部；任何主题/DOM/滚动变化都不能重载页面。
  await apply({width:430,height:932,frame:"iphone",scale:0.75,liveSync:true});
  await ready();
  const statusColors = () => page.eval(`(() => {
    const s=${shadow}, bar=getComputedStyle(s.querySelector(".fl-status-bar"));
    return {background:bar.backgroundColor,foreground:bar.color,
      signal:getComputedStyle(s.querySelector(".fl-signal-icon")).fill,
      wifi:getComputedStyle(s.querySelector(".fl-wifi-icon")).stroke,
      battery:getComputedStyle(s.querySelector(".fl-battery-level")).fill};
  })()`);
  const frameEval = (code) => page.eval(`(() => {
    const f=${shadow}.querySelector("iframe"), d=f.contentDocument, w=f.contentWindow;
    const h=d.querySelector("header"); ${code}
  })()`);
  const expectStatus = async (background, foreground) => {
    await until(async () => {
      const color=await statusColors();
      return color.background===background && color.foreground===foreground &&
        color.signal===foreground && color.wifi===foreground && color.battery===foreground;
    }, `status palette ${background} / ${foreground}`);
  };
  const saveStatus = async (name) => {
    const clip=await page.eval(`(() => {const r=${shadow}.querySelector(".fl-device").getBoundingClientRect(),x=Math.floor(r.x-20),y=Math.floor(r.y-20);return {x,y,width:Math.ceil(r.right+20)-x,height:Math.ceil(r.bottom+20)-y,scale:1};})()`);
    const shot=await page.send("Page.captureScreenshot", {format:"png",clip});
    fs.writeFileSync(path.join(screenshots,`FrameLens-statusbar-${name}-v${releaseVersion}.png`),Buffer.from(shot.data,"base64"));
    const seam=await page.eval(`(() => {const r=${shadow}.querySelector(".fl-status-bar").getBoundingClientRect();return {x:r.x+r.width/2,y:r.bottom};})()`);
    const pixels=readPngPixels(Buffer.from(shot.data,"base64"));
    const expected=(await statusColors()).background.match(/\d+/g).map(Number);
    for(let dy=-2;dy<=2;dy++) {
      assert.deepEqual(pixels.pixel(Math.floor(seam.x-clip.x),Math.floor(seam.y-clip.y)+dy),expected,"关闭分隔线时不应残留缩放白缝");
    }
  };
  await page.eval(`window.__statusLoads=0; ${shadow}.querySelector("iframe").addEventListener("load",()=>window.__statusLoads++);`);
  for (const [background,foreground,label] of [
    ["rgb(23, 37, 84)","rgb(255, 255, 255)","dark"],
    ["rgb(37, 99, 235)","rgb(255, 255, 255)","blue"],
    ["rgb(232, 243, 255)","rgb(17, 20, 26)","light"]
  ]) {
    await frameEval(`h.style.background=${JSON.stringify(background)}; h.style.color=${JSON.stringify(foreground)};`);
    await expectStatus(background,foreground);
    await saveStatus(label);
  }
  await frameEval('d.body.style.background="#14283c"; h.style.background="transparent";');
  await expectStatus("rgb(20, 40, 60)","rgb(255, 255, 255)");
  await frameEval('h.style.background="rgba(255,255,255,.5)";');
  await expectStatus("rgb(138, 148, 158)","rgb(17, 20, 26)");
  await frameEval('h.style.background="color(srgb 0 0 1)";');
  await expectStatus("rgb(0, 0, 255)","rgb(255, 255, 255)");
  await frameEval(`
    h.style.background="linear-gradient(blue, purple)";
    for (const [media,content] of [["(prefers-color-scheme: light)","#f8fafc"],["(prefers-color-scheme: dark)","#1e293b"]]) {
      const meta=d.createElement("meta"); meta.name="theme-color"; meta.media=media; meta.content=content; d.head.append(meta);
    }
  `);
  await page.send("Emulation.setEmulatedMedia", {features:[{name:"prefers-color-scheme",value:"dark"}]});
  await expectStatus("rgb(30, 41, 59)","rgb(255, 255, 255)");
  await page.send("Emulation.setEmulatedMedia", {features:[{name:"prefers-color-scheme",value:"light"}]});
  await expectStatus("rgb(248, 250, 252)","rgb(17, 20, 26)");
  await page.send("Emulation.setEmulatedMedia", {features:[]});
  await frameEval(`
    d.querySelectorAll('meta[name="theme-color"]').forEach(el=>el.remove());
    h.style.background="#172554";
    const style=d.createElement("style"); style.id="status-test-style";
    style.textContent='body[data-route="next"] header { background: #fde047 !important; }'; d.head.append(style);
    w.location.hash="theme-route";
    w.setTimeout(()=>d.body.dataset.route="next",20);
  `);
  await expectStatus("rgb(253, 224, 71)","rgb(17, 20, 26)");
  // CSSOM insertRule 不触发 MutationObserver，仍应在低频校验时发现。
  await frameEval('d.getElementById("status-test-style").sheet.insertRule("body[data-route] header { background: #1e293b !important; }",1);');
  await expectStatus("rgb(30, 41, 59)","rgb(255, 255, 255)");
  await frameEval(`
    d.getElementById("status-test-style").remove();
    h.style.cssText="background:#172554;color:white;position:fixed;top:0;left:0;right:0";
    d.body.style.cssText="background:#f5f7fb;min-height:2400px";
    d.querySelector("main").style.display="none";
    w.scrollTo(0,300);
  `);
  await expectStatus("rgb(23, 37, 84)","rgb(255, 255, 255)");
  await frameEval('h.style.position="static";');
  await expectStatus("rgb(245, 247, 251)","rgb(17, 20, 26)");
  assert.equal(await page.eval("window.__statusLoads"),0,"配色变化不能重新加载页面");
  await click("reload");
  await until(() => page.eval("window.__statusLoads === 1"),"manual reload for status lifecycle");
  await ready();
  await frameEval('h.style.background="#2563eb";');
  await expectStatus("rgb(37, 99, 235)","rgb(255, 255, 255)");
  await page.eval(`(() => { const f=${shadow}.querySelector("iframe"); f.src=${JSON.stringify(pageUrl.replace("127.0.0.1","localhost"))}; })()`);
  await until(() => page.eval(`window.__statusLoads === 2 && ${shadow}.querySelector("iframe").contentDocument===null`),"cross-origin status fallback");
  await expectStatus("rgb(255, 255, 255)","rgb(17, 20, 26)");
  await page.eval(`(() => { const f=${shadow}.querySelector("iframe"); f.src=${JSON.stringify(pageUrl)}; })()`);
  await until(() => page.eval("window.__statusLoads === 3"),"return to readable document");
  await ready();
  await frameEval('h.style.background="#172554";');
  await expectStatus("rgb(23, 37, 84)","rgb(255, 255, 255)");
  checks.push("状态栏深浅蓝/透明合成/现代颜色/主题媒体条件/异步路由/CSSOM/滚动自动取色，期间零重载；刷新重绑及跨域保底正常");
  await apply({width:412,height:915,frame:"android",scale:0.75,liveSync:true});
  await ready();
  assert.equal(await panel.eval('getComputedStyle(document.querySelector("h1")).color'), "rgb(22, 32, 52)");
  // 直接重复注入所有模块也不能创建第二层模型机或重复监听。
  await worker.eval(`chrome.scripting.executeScript({target:{tabId:${tabId}},files:chrome.runtime.getManifest().content_scripts[0].js})`);
  assert.equal(await page.eval('document.querySelectorAll("#__framelens_preview_host__").length'),1);
  assert.equal(await worker.eval('(async () => "url" in (await chrome.storage.local.get("frameLensSettings")).frameLensSettings)()'),false);
  checks.push("五种外框视口与底栏完整；白色页头自动使用白底深字，网页及侧栏配色未改");
  checks.push("重复注入不重复创建预览；默认设备偏好不混入标签页网址");

  // 记录真正的 iframe load，区分“原标签页刷新”和预览自行重载。
  await page.eval(`(() => {
    window.previewLoads = 0;
    window.previewMasks = 0;
    window.outerTimeOrigin = performance.timeOrigin;
    ${shadow}.querySelector("iframe").addEventListener("load", () => window.previewLoads++);
    new MutationObserver(() => {
      if (!${shadow}.querySelector(".fl-loader").classList.contains("hidden")) window.previewMasks++;
    }).observe(${shadow}.querySelector(".fl-loader"), {attributes:true, attributeFilter:["class"]});
    const input = ${shadow}.querySelector("iframe").contentDocument.createElement("input");
    input.id = "unsaved-draft"; input.value = "未提交的表单内容";
    ${shadow}.querySelector("iframe").contentDocument.body.append(input);
    const text = document.createElement("span"); text.id = "dynamic-label";
    document.body.append(text);
    window.noiseTimer = setInterval(() => {
      text.textContent = String(Date.now());
      const hint = document.createElement("div"); hint.textContent = "后台检查完成";
      document.body.append(hint); setTimeout(() => hint.remove(), 80);
    }, 200);
  })()`);
  await delay(3400);
  const passiveLoads = await page.eval("window.previewLoads");
  const draft = await page.eval(`${shadow}.querySelector("iframe").contentDocument.querySelector("#unsaved-draft")?.value`);
  await page.eval('clearInterval(window.noiseTimer); document.querySelector("#dynamic-label").remove()');
  await delay(2200);

  // 每次预览启动写入访问时间，旧版会将自己的写入再反馈为一次刷新。
  writeOnFrameLoad = true;
  await click("reload"); await ready(); await delay(500);
  const bootBaseline = await page.eval("window.previewLoads");
  await delay(4200);
  const feedbackLoads = await page.eval(`window.previewLoads - ${bootBaseline}`);
  writeOnFrameLoad = false;
  console.log(JSON.stringify({passiveLoads, feedbackLoads, draftPreserved:draft === "未提交的表单内容", outerPageReloaded:await page.eval("performance.timeOrigin !== window.outerTimeOrigin")}));
  if (!process.env.FRAMELENS_REPRO_BLINK) {
    assert.equal(passiveLoads, 0, "后台文字、通知及定时渲染不应刷新预览");
    assert.equal(draft, "未提交的表单内容");
    assert.equal(feedbackLoads, 0, "预览自己的存储写入不应形成刷新循环");
    checks.push("后台动态文字/提示不重载、不丢表单；预览启动写存储不形成刷新循环");

    const loads = () => page.eval("window.previewLoads");
    const frameData = () => page.eval(`${shadow}.querySelector("iframe").contentDocument?.querySelector("#externalDataValue")?.textContent`);
    const beforeData = await loads();
    const beforeMasks = await page.eval("window.previewMasks");
    writeOnFrameLoad = true;
    await page.eval(`(() => {
      const f = ${shadow}.querySelector("iframe");
      f.contentDocument.body.style.minHeight = "3000px";
      f.contentWindow.scrollTo(0, 100);
      for (let i = 0; i < 12; i++) localStorage.setItem("framelens-test-value", "数据版本 " + i);
    })()`);
    await until(async () => (await frameData()) === "数据版本 11", "external persisted data synchronized");
    await ready(); await delay(2200);
    assert.equal(await loads(), beforeData + 1, "外部连续写入应只同步一次，预览启动写入不回触");
    assert.equal(await page.eval("window.previewMasks"), beforeMasks, "数据同步不能盖上整屏加载层");
    assert.equal(await page.eval(`${shadow}.querySelector(".fl-loader").classList.contains("hidden")`), true);
    writeOnFrameLoad = false;
    checks.push("原页面连续写入数据自动同步一次，没有加载层反复闪动或回触循环");

    const beforeOwnWrite = await loads();
    await page.eval(`${shadow}.querySelector("iframe").contentWindow.localStorage.setItem("preview-last-visit", String(Date.now()))`);
    await delay(2100);
    assert.equal(await loads(), beforeOwnWrite, "预览运行中的存储写入不应刷新自己");

    await click("live-sync");
    await page.eval('localStorage.setItem("framelens-test-value", "暂停期间更新")');
    await delay(1800);
    assert.equal(await loads(), beforeOwnWrite);
    await click("live-sync");
    await until(async () => (await frameData()) === "暂停期间更新", "resume sync");
    await ready(); await delay(1800);
    assert.equal(await loads(), beforeOwnWrite + 1);
    checks.push("暂停时不自动重载，重新开启后同步一次最新数据");

    const dataTab = await worker.eval(`chrome.tabs.create({url:${JSON.stringify(`${origin}/writer`)},active:false})`);
    const dataTarget = await until(async () => (await targets()).find((t) => t.url === `${origin}/writer`), "external writer tab");
    const dataPage = await connect(dataTarget);
    await until(() => dataPage.eval('document.readyState === "complete"'), "external writer ready");
    await dataPage.eval('localStorage.setItem("framelens-test-value", "其他标签页更新")');
    await until(async () => (await frameData()) === "其他标签页更新", "other tab data synchronized");
    await ready();
    await dataPage.eval('localStorage.clear()');
    await until(async () => (await frameData()) === "数据版本 1", "storage clear synchronized");
    await ready();
    await worker.eval(`chrome.tabs.remove(${dataTab.id})`);
    checks.push("其他同源标签页写入及清空存储仍能同步");

    await page.eval('history.pushState({}, "", "/route-check?new=1"); localStorage.setItem("framelens-test-value", "路由同时更新数据")');
    await until(() => page.eval(`${shadow}.querySelector("iframe").contentWindow.location.pathname === "/route-check"`), "route takes priority over storage");
    await ready(); await delay(1700);
    assert.equal(await frameData(), "路由同时更新数据");
    await page.eval('location.hash = "details"');
    await until(() => page.eval(`${shadow}.querySelector("iframe").contentWindow.location.hash === "#details"`), "hash route synchronized");
    await ready();
    await page.eval('localStorage.setItem("framelens-test-value", "路由后继续同步")');
    await until(async () => (await frameData()) === "路由后继续同步", "data sync after hash route");
    await ready();
    await page.eval('location.hash = "data-and-route"; localStorage.setItem("framelens-test-value", "Hash 与数据同时更新")');
    await until(async () => (await frameData()) === "Hash 与数据同时更新", "data update alongside hash navigation");
    await ready();
    assert.equal(await page.eval(`${shadow}.querySelector("iframe").contentWindow.location.hash`), "#data-and-route");
    await until(async () => {
      const entry = await stored(), outer = await page.eval("location.href");
      return entry?.outerUrl === outer && entry.config.url === outer;
    },"external route checkpoint contains both committed addresses");
    const beforeManual = await loads();
    await click("reload");
    await until(async () => (await loads()) === beforeManual + 1, "explicit preview reload");
    await ready();
    await worker.eval(`chrome.tabs.sendMessage(${tabId}, {type:"FRAMELENS_OPEN",config:{width:412,height:915,frame:"android",scale:0.75,liveSync:true}})`);
    await until(async () => (await loads()) === beforeManual + 2, "reapply same hash URL");
    await ready();
    checks.push("路由与数据同时变化不丢路由；Hash 路由之后仍可同步，手动刷新有效");
  }

  await reload(); await ready();
  assert.deepEqual(await snapshot(), initial);
  await reload(true); await ready();
  assert.deepEqual(await snapshot(), initial);
  checks.push("普通刷新、强制刷新完整恢复预览，iframe 无嵌套预览");

  await click("rotate"); await click("zoom-out"); await click("theme"); await click("live-sync");
  await until(async () => {
    const value = await stored();
    return value?.config.width === 915 && value.config.scale === 0.65 && value.config.theme === "light" && value.config.liveSync === false;
  }, "toolbar state saved");
  await reload(true); await ready();
  const adjusted = await snapshot();
  assert.equal(adjusted.width, 915); assert.equal(adjusted.height, 412);
  assert.equal(adjusted.scale, "65%"); assert.equal(adjusted.theme, "light");
  assert.equal(adjusted.liveSync, "false");
  checks.push("旋转、缩放、明暗背景、暂停同步在刷新后保留");

  const second = await worker.eval(`chrome.tabs.create({url:${JSON.stringify(pageUrl)},active:false})`);
  await until(() => ping(second.id), "second tab");
  await delay(300);
  assert.equal((await ping(second.id)).open, false);
  checks.push("同网址新标签页不会自动开启预览");

  await page.send("Page.navigate", { url: `${origin}/next?test=1` });
  await until(() => page.eval(`location.pathname === '/next' && ${host} != null`), "same-site navigation");
  await ready();
  assert.equal((await snapshot()).width, 915);
  checks.push("同站点页面跳转保留预览");

  // 三个关闭入口分别验证：工具栏、Esc、侧栏按钮。
  for (const method of ["toolbar", "escape", "panel"]) {
    if (method !== "toolbar") {
      const opened = await worker.eval(`chrome.tabs.sendMessage(${tabId}, {type:"FRAMELENS_OPEN",config:${JSON.stringify({width:412,height:915,frame:"android",scale:"fit",liveSync:false})}})`);
      assert.equal(opened.ok, true); await ready();
    }
    if (method === "toolbar") await click("close");
    else if (method === "escape") {
      await page.send("Input.dispatchKeyEvent", {type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
      await page.send("Input.dispatchKeyEvent", {type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
    } else {
      await worker.eval(`chrome.tabs.update(${tabId},{active:true})`);
      await panel.eval('document.querySelector("#closeBtn").click()');
      await until(() => panel.eval('document.querySelector("#status").textContent === "预览已关闭"'), "panel close");
    }
    await until(async () => !(await stored()), `${method} state removed`);
    await reload(); await delay(400);
    assert.equal((await ping()).open, false);
  }
  checks.push("工具栏关闭、Esc、设置栏关闭后刷新均保持关闭");

  // 登录只发生在 iframe 内，外层仍是登录页：退出时必须接续真实页面。
  for (const method of ["toolbar", "panel", "escape"]) {
    const loginUrl = `${origin}/close-flow/login?method=${method}`;
    const homeUrl = `${origin}/close-flow/home?from=login#feed`;
    await page.send("Page.navigate", {url:loginUrl});
    await until(() => page.eval(`location.href === ${JSON.stringify(loginUrl)} && document.readyState === "complete"`), "outer login page");
    await until(() => ping(), "login content script");
    await worker.eval(`chrome.tabs.update(${tabId},{active:true})`);
    await panel.eval('document.querySelector("#openBtn").click()');
    await ready();
    await page.eval(`${shadow}.querySelector("iframe").contentDocument.querySelector("#testLoginBtn").click()`);
    assert.equal(await page.eval(`${shadow}.querySelector("iframe").contentWindow.location.href`),homeUrl);
    assert.equal(await page.eval("location.href"),loginUrl);
    if (method === "toolbar") await click("close");
    else if (method === "panel") {
      await panel.eval('document.querySelector("#closeBtn").click()');
      await until(() => panel.eval('document.querySelector("#status").textContent === "预览已关闭"'), "sidebar close acknowledgement before navigation");
    } else {
      await page.eval(`${shadow}.querySelector("iframe").contentDocument.querySelector("#routeFocus").focus()`);
      await page.send("Input.dispatchKeyEvent", {type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
      await page.send("Input.dispatchKeyEvent", {type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
    }
    await until(() => page.eval(`location.href === ${JSON.stringify(homeUrl)} && !${host} && document.querySelector("#routeTitle")?.textContent === "登录后的首页"`), `${method} continues preview login route`);
    assert.equal(await stored(),undefined);
    assert.equal(await page.eval('sessionStorage.getItem("framelens-close-test-login")'),"yes");
    await reload(); await delay(300);
    assert.equal((await ping()).open,false);
    assert.equal(await page.eval("location.href"),homeUrl);
    const shot = await page.send("Page.captureScreenshot",{format:"png"});
    fs.writeFileSync(path.join(screenshots,`FrameLens-close-${method}-v${releaseVersion}.png`),Buffer.from(shot.data,"base64"));
  }
  checks.push("iframe 内登录后：顶部关闭、侧栏关闭、输入框聚焦后的真实 Esc 均接续首页，保留查询/Hash/会话，刷新不重开预览");

  // History 路由、普通整页跳转、后退到的页面，以及同地址关闭。
  for (const scenario of ["hash", "query", "document", "back", "unchanged"]) {
    const before = await page.eval("location.href");
    await worker.eval(`chrome.tabs.sendMessage(${tabId},{type:"FRAMELENS_OPEN",config:{width:430,height:932,frame:"iphone",liveSync:true}})`);
    await ready();
    const target = new URL(before);
    if (scenario === "hash") target.hash = "detail/12";
    if (scenario === "query") target.search = "?filter=待处理&item=12";
    if (["document","back"].includes(scenario)) target.pathname = `/close-flow/${scenario}`;
    if (scenario === "document") {
      await page.eval(`${shadow}.querySelector("iframe").contentWindow.location.assign(${JSON.stringify(target.href)})`);
      await until(() => page.eval(`${shadow}.querySelector("iframe").contentDocument?.querySelector("#routeTitle") && ${shadow}.querySelector("iframe").contentWindow.location.href === ${JSON.stringify(target.href)}`),"iframe full navigation");
    } else if (scenario !== "unchanged") {
      await page.eval(`${shadow}.querySelector("iframe").contentWindow.history.pushState({},"",${JSON.stringify(target.href)})`);
      if (scenario === "back") {
        await page.eval(`(() => {const w=${shadow}.querySelector("iframe").contentWindow; w.history.pushState({},"","/close-flow/later"); w.history.back();})()`);
        await until(() => page.eval(`${shadow}.querySelector("iframe").contentWindow.location.href === ${JSON.stringify(target.href)}`),"iframe history back");
      }
    }
    await page.eval("window.__closeDocumentMarker = true");
    await click("close");
    await until(() => page.eval(`location.href === ${JSON.stringify(target.href)} && !${host}`),`${scenario} exit destination`);
    await delay(300);
    assert.equal(await stored(),undefined);
    assert.equal((await ping()).open,false);
    if (scenario === "unchanged") assert.equal(await page.eval("window.__closeDocumentMarker"),true,"same URL close must not reload");
  }
  checks.push("关闭接续 Hash、查询参数、整页跳转和后退后的真实路由；同地址关闭不多刷新");

  assert.equal((await worker.eval(`chrome.tabs.sendMessage(${tabId},{type:"FRAMELENS_TOGGLE"})`)).open, true);
  await ready(); await reload(); await ready();
  assert.equal((await ping()).open, true);
  assert.equal((await worker.eval(`chrome.tabs.sendMessage(${tabId},{type:"FRAMELENS_TOGGLE"})`)).open, false);
  await reload(); await delay(300);
  assert.equal((await ping()).open, false);
  checks.push("快捷键开关对应消息路径也支持刷新记忆与关闭清理");

  await worker.eval(`chrome.tabs.sendMessage(${tabId},{type:"FRAMELENS_OPEN",config:{width:412,height:915,frame:"android",scale:"fit"}})`);
  await ready();
  await page.send("Page.navigate", {url:`http://localhost:${server.address().port}/verify.html`});
  await until(() => page.eval("location.hostname === 'localhost' && document.readyState === 'complete'"), "other site");
  await until(async () => !(await stored()), "different site state cleared");
  assert.equal((await ping()).open, false);
  checks.push("切换到其他站点不套用原站点的预览");

  await worker.eval(`chrome.tabs.sendMessage(${tabId},{type:"FRAMELENS_OPEN",config:{width:412,height:915,frame:"android",scale:"fit"}})`);
  await until(() => stored(), "tab state present");
  await worker.eval(`chrome.tabs.remove(${tabId})`);
  await until(async () => !(await stored()), "closed tab cleaned");
  checks.push("关闭标签页清理临时状态");

  assert.deepEqual(worker.errors, []);
  assert.deepEqual(panel.errors, []);
  assert.deepEqual(page.errors, []);
  console.log(JSON.stringify({ok:true, browser:version.Browser, version:JSON.parse(fs.readFileSync(path.join(extension,"manifest.json"))).version, checks}, null, 2));
} catch (error) {
  console.error(stderr.slice(-2000));
  throw error;
} finally {
  for (const session of sessions) session.close();
  if (browser) { await browser.send("Browser.close").catch(() => {}); browser.close(); }
  browserProcess.kill("SIGTERM");
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
