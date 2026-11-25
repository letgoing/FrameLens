(() => {
  const WHITE = [255, 255, 255, 1];
  const INK = [17, 20, 26, 1];
  const clamp = (value, max = 255) => Math.max(0, Math.min(max, value));
  const css = (color) => `rgb(${color.slice(0, 3).map(Math.round).join(", ")})`;

  function parseColor(value) {
    const text = String(value || "").trim().toLowerCase();
    if (text === "transparent") return [0, 0, 0, 0];
    if (text === "white") return [...WHITE];
    if (text === "black") return [0, 0, 0, 1];
    if (/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.test(text)) {
      let hex = text.slice(1);
      if (hex.length <= 4) hex = [...hex].map((v) => v + v).join("");
      const parts = hex.match(/../g).map((v) => parseInt(v, 16));
      return [...parts.slice(0, 3), parts.length === 4 ? parts[3] / 255 : 1];
    }
    if (!/^rgba?\(/.test(text)) return null;
    const parts = text.slice(text.indexOf("(") + 1, -1).split(/[\s,\/]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4 || parts.some((v) => !Number.isFinite(parseFloat(v)))) return null;
    return parts.slice(0, 3).map((v) => clamp(parseFloat(v) * (v.endsWith("%") ? 2.55 : 1)))
      .concat(parts[3] === undefined ? 1 : clamp(parseFloat(parts[3]) / (parts[3].endsWith("%") ? 100 : 1), 1));
  }

  // 合成透明背景后再计算对比度，避免透明导航误选白字。
  function over(front, back) {
    const alpha = front[3] ?? 1;
    return front.slice(0, 3).map((v, i) => v * alpha + back[i] * (1 - alpha)).concat(1);
  }
  function luminance(color) {
    return color.slice(0, 3).map((v) => {
      const channel = v / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i], 0);
  }
  function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function palette(background = WHITE) {
    const opaque = over(background, WHITE).map((v, i) => i < 3 ? Math.round(v) : v);
    // 常规浅底用柔和深色；中间亮度时必要可用纯黑，确保至少 4.5:1。
    const candidates = [INK, WHITE, [0, 0, 0, 1]];
    const foreground = candidates.find((color) => contrast(opaque, color) >= 4.5);
    return { background: css(opaque), foreground: css(foreground || INK) };
  }

  function createSampler(doc) {
    const win = doc.defaultView;
    let context;
    const resolve = (value) => {
      const simple = parseColor(value);
      if (simple) return simple;
      // 将 hsl/oklch/display-p3 等浏览器支持的颜色归一化为 sRGB；不读取页面图片。
      if (!win.CSS?.supports("color", value)) return null;
      context ||= doc.createElement("canvas").getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const themeColor = () => {
      for (const meta of doc.querySelectorAll('meta[name="theme-color" i]')) {
        if (meta.media && !win.matchMedia(meta.media).matches) continue;
        const color = resolve(meta.content);
        if (color?.[3] > 0) return over(color, WHITE);
      }
      return null;
    };
    return () => {
      const declared = themeColor();
      // 中点优先打破平票，多点多数色避免 logo、按钮或边缘空白影响。
      const samples = [0.5, 0.25, 0.75, 0.1, 0.9].map((fraction) => {
        const layers = [];
        let complex = false;
        for (const element of doc.elementsFromPoint(Math.max(1, win.innerWidth * fraction), 2)) {
          const style = win.getComputedStyle(element);
          if (Number(style.opacity) === 0 || style.visibility !== "visible") continue;
          complex ||= style.backgroundImage !== "none" || /^(IMG|VIDEO|CANVAS|SVG)$/i.test(element.tagName);
          const color = resolve(style.backgroundColor);
          if (!color || color[3] === 0) continue;
          color[3] *= Number(style.opacity);
          layers.push(color);
          if (color[3] >= 1) break;
        }
        // 图片/渐变不伪装成精确像素取色；优先站点声明，否则取可识别底色。
        if (complex && declared) return declared;
        if (!layers.length) return declared || WHITE;
        return layers.reverse().reduce((back, front) => over(front, back), WHITE);
      });
      const counts = new Map();
      for (const color of samples) {
        const key = color.slice(0, 3).map((v) => Math.round(v / 8)).join(",");
        const group = counts.get(key) || { color, count: 0 };
        group.count++;
        counts.set(key, group);
      }
      return palette([...counts.values()].sort((a, b) => b.count - a.count)[0]?.color);
    };
  }

  // 独立外观监听：绝不向数据同步模块发送事件，也不修改预览页面。
  class StatusThemeController {
    constructor({ iframe, bar, clock = globalThis }) {
      this.iframe = iframe;
      this.bar = bar;
      this.clock = clock;
      this.cleanups = [];
      this.disposed = false;
      this.schedule = () => {
        if (this.disposed || this.timer != null) return;
        this.timer = this.clock.setTimeout(() => {
          this.timer = null;
          this.update();
        }, 150);
      };
    }
    paint(colors) {
      if (this.disposed) return;
      if (this.bar.style.backgroundColor !== colors.background) this.bar.style.backgroundColor = colors.background;
      if (this.bar.style.color !== colors.foreground) this.bar.style.color = colors.foreground;
    }
    update() {
      if (this.disposed) return;
      try {
        this.paint(this.sample?.() || palette());
      } catch {
        // 无法读取跨域、受限或已销毁文档时回到白底深字。
        this.paint(palette());
      }
    }
    bind() {
      this.unbind();
      if (this.disposed) return;
      try {
        const doc = this.iframe.contentDocument;
        if (!doc?.documentElement) { this.update(); return; }
        this.sample = createSampler(doc);
        const listen = (target, event, options) => {
          target.addEventListener(event, this.schedule, options);
          this.cleanups.push(() => target.removeEventListener(event, this.schedule, options));
        };
        listen(doc, "scroll", { capture: true, passive: true });
        for (const event of ["load", "transitionend", "animationend", "visibilitychange"]) listen(doc, event, true);
        for (const event of ["resize", "hashchange", "popstate", "pageshow"]) listen(doc.defaultView, event);
        const observer = new doc.defaultView.MutationObserver(this.schedule);
        observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
        this.cleanups.push(() => observer.disconnect());
        // CSSOM、媒体查询及无 DOM 变更的主题变化也会被重新取色。
        this.poll = this.clock.setInterval(this.schedule, 1000);
      } catch {
        this.unbind();
      }
      this.update();
    }
    unbind() {
      this.clock.clearTimeout(this.timer);
      this.clock.clearInterval(this.poll);
      this.timer = this.poll = null;
      for (const cleanup of this.cleanups.splice(0)) {
        try { cleanup(); } catch { /* 旧文档可能已跨域或关闭。 */ }
      }
      this.sample = null;
    }
    destroy() {
      this.disposed = true;
      this.unbind();
    }
  }
  globalThis.FrameLensStatusTheme = Object.freeze({ parseColor, over, luminance, contrast, palette, createSampler, StatusThemeController });
})();
