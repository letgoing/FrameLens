(() => {
  const readFrameUrl = (frame) => {
    try {
      const url = new URL(frame.contentWindow.location.href);
      return /^(https?:|file:)$/.test(url.protocol) ? url.href : null;
    } catch { return null; }
  };

  // 只观察已经提交的地址，不改网页的 history，也不触发同步或刷新。
  class FrameNavigation {
    constructor(frame, onCommit) {
      this.frame = frame;
      this.capture = () => onCommit(readFrameUrl(frame));
    }
    bind() {
      this.unbind();
      if (!this.frame.hasAttribute("src")) return; // 初次挂载时的 about:blank
      try {
        this.entries = this.frame.contentWindow.navigation;
        this.entries?.addEventListener("currententrychange", this.capture);
        this.poll = !this.entries && Boolean(this.frame.contentDocument);
      } catch { /* 跨域文档不能监听，清除旧的同源恢复地址。 */ }
      this.capture();
    }
    checkFallback() {
      if (this.poll) this.capture();
    }
    unbind() {
      try { this.entries?.removeEventListener("currententrychange", this.capture); } catch {}
      this.entries = null;
      this.poll = false;
    }
  }
  globalThis.FrameLensNavigation = Object.freeze({FrameNavigation, readFrameUrl});
})();
