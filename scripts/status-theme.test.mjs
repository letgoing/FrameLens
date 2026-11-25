import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL("../preview/status-theme.js", import.meta.url), "utf8"), context);
const { parseColor, over, contrast, palette, createSampler, StatusThemeController } = context.FrameLensStatusTheme;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("解析计算后的 RGB、透明度、百分比与十六进制颜色", () => {
  assert.deepEqual(plain(parseColor("rgb(17, 20, 26)")), [17, 20, 26, 1]);
  assert.deepEqual(plain(parseColor("rgb(100% 0% 0% / 50%)")).map((v) => Math.round(v * 100) / 100), [255, 0, 0, 0.5]);
  assert.deepEqual(plain(parseColor("#123")), [17, 34, 51, 1]);
  assert.deepEqual(plain(parseColor("#11223300")), [17, 34, 51, 0]);
  assert.equal(parseColor("invalid"), null);
});

test("透明背景正确合成；浅底深字、深底白字", () => {
  assert.deepEqual(plain(over([0, 0, 0, 0.5], [255, 255, 255, 1])), [127.5, 127.5, 127.5, 1]);
  assert.equal(palette([255, 255, 255, 1]).foreground, "rgb(17, 20, 26)");
  assert.equal(palette([10, 20, 30, 1]).foreground, "rgb(255, 255, 255)");
  assert.equal(palette([0, 0, 0, 0]).background, "rgb(255, 255, 255)");
});

test("4096 种背景颜色的文字对比度均至少为 4.5:1", () => {
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const colors = palette([r, g, b, 1]);
    assert.ok(contrast(parseColor(colors.background), parseColor(colors.foreground)) >= 4.5, JSON.stringify(colors));
  }
});

function fixture() {
  const make = (background, extra = {}) => ({ tagName: "DIV", style: {
    backgroundColor: background, backgroundImage: "none", opacity: "1", visibility: "visible", ...extra
  } });
  const top = make("transparent"), body = make("rgb(20, 40, 60)");
  const doc = {
    defaultView: { innerWidth: 400, getComputedStyle: (el) => el.style, matchMedia: (media) => ({ matches: media === "dark" }) },
    querySelectorAll: () => doc.metas,
    elementsFromPoint: () => [top, body],
    metas: []
  };
  return { doc, top, body, make };
}

test("透明页头跟随下层背景，半透明页头合成下层色", () => {
  const { doc, top } = fixture();
  const sample = createSampler(doc);
  assert.equal(sample().background, "rgb(20, 40, 60)");
  top.style.backgroundColor = "rgba(255, 255, 255, 0.5)";
  assert.equal(sample().background, "rgb(138, 148, 158)");
});

test("多点取多数色，不被单个 logo 或按钮带偏", () => {
  const { doc, body, make } = fixture();
  const logo = make("red");
  logo.style.backgroundColor = "rgb(255, 0, 0)";
  doc.elementsFromPoint = (x) => x === 200 ? [logo, body] : [body];
  assert.equal(createSampler(doc)().background, "rgb(20, 40, 60)");
});

test("实色优先于 theme-color；图片/渐变按匹配的媒体条件使用声明色", () => {
  const { doc, top } = fixture();
  doc.metas = [{ media: "light", content: "#fff" }, { media: "dark", content: "#123456" }];
  assert.equal(createSampler(doc)().background, "rgb(20, 40, 60)");
  top.style.backgroundImage = "linear-gradient(blue, red)";
  assert.equal(createSampler(doc)().background, "rgb(18, 52, 86)");
  doc.metas = [];
  assert.equal(createSampler(doc)().background, "rgb(20, 40, 60)");
});

test("空白文档安全回退，隐藏元素不参与背景选择", () => {
  const { doc, top } = fixture();
  top.style.backgroundColor = "#fff";
  top.style.opacity = "0";
  assert.equal(createSampler(doc)().background, "rgb(20, 40, 60)");
  doc.elementsFromPoint = () => [];
  assert.equal(createSampler(doc)().background, "rgb(255, 255, 255)");
});

test("外观更新限流；重绑、销毁清理监听与定时器，不再修改颜色", () => {
  const { doc } = fixture();
  const timers = new Map(), intervals = new Map(), listeners = new Set();
  let id = 0, observers = 0;
  const clock = {
    setTimeout: (fn) => { timers.set(++id, fn); return id; }, clearTimeout: (i) => timers.delete(i),
    setInterval: (fn) => { intervals.set(++id, fn); return id; }, clearInterval: (i) => intervals.delete(i)
  };
  const eventTarget = () => ({
    addEventListener: (name) => listeners.add(name), removeEventListener: (name) => listeners.delete(name)
  });
  Object.assign(doc, eventTarget(), { documentElement: {} });
  Object.assign(doc.defaultView, eventTarget(), {
    MutationObserver: class { observe() { observers++; } disconnect() { observers--; } }
  });
  const bar = { style: {} };
  const controller = new StatusThemeController({ iframe: { contentDocument: doc }, bar, clock });
  controller.bind();
  assert.equal(bar.style.backgroundColor, "rgb(20, 40, 60)");
  for (let i = 0; i < 100; i++) controller.schedule();
  assert.equal(timers.size, 1);
  controller.bind();
  assert.equal(timers.size, 0);
  assert.equal(intervals.size, 1);
  assert.equal(observers, 1);
  controller.schedule();
  const late = [...timers.values()][0];
  controller.destroy();
  assert.equal(timers.size + intervals.size + listeners.size + observers, 0);
  bar.style.color = "unchanged";
  late(); controller.bind(); controller.schedule(); controller.update();
  assert.equal(bar.style.color, "unchanged");
  assert.equal(timers.size + intervals.size + listeners.size + observers, 0);
});

test("跨域 null/异常文档使用白底深字，不抛异常且不留轮询", () => {
  const bar = { style: {} };
  const clock = { clearTimeout() {}, clearInterval() {}, setInterval() { assert.fail("must not poll"); } };
  const iframe = { contentDocument: null };
  const controller = new StatusThemeController({ iframe, bar, clock });
  controller.bind();
  assert.equal(bar.style.backgroundColor, "rgb(255, 255, 255)");
  Object.defineProperty(iframe, "contentDocument", { get() { throw new Error("SecurityError"); } });
  assert.doesNotThrow(() => controller.bind());
  assert.equal(bar.style.color, "rgb(17, 20, 26)");
});
