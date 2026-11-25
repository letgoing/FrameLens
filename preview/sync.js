(() => {
  const browserClock = {
    now: () => Date.now(),
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: (id) => globalThis.clearTimeout(id)
  };
  // 只管理同步状态与生命周期，不依赖 DOM、Chrome API 或模型机样式。
  class SyncController {
    constructor({ enabled = true, getUrl, onSync, onState, clock = browserClock }) {
      this.enabled = enabled;
      this.getUrl = getUrl;
      this.onSync = onSync;
      this.onState = onState;
      this.clock = clock;
      this.now = () => clock.now?.() ?? Date.now();
      this.lastUrl = getUrl();
      this.observedUrl = this.lastUrl;
      this.lastSyncAt = 0;
      this.pendingSince = null;
      this.sources = new Set();
      this.timer = null;
      this.loading = false;
      this.disposed = false;
      this.storageWindow = null;
      this.state = enabled ? "ready" : "paused";
      this.onStorage = (event) => {
        if (String(event.key || "").startsWith("frameLens")) return;
        if (event.key !== null && event.oldValue === event.newValue) return;
        this.schedule("storage");
      };
    }
    setState(state) {
      if (this.disposed) return;
      this.state = state;
      this.onState(state);
    }
    clear() {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
      this.pendingSince = null;
      this.sources.clear();
    }
    resetUrl() { this.lastUrl = this.observedUrl = this.getUrl(); }
    checkRoute() {
      if (this.getUrl() === this.observedUrl) return;
      this.observedUrl = this.getUrl();
      this.schedule("route");
    }
    setEnabled(enabled) {
      if (this.disposed) return;
      const wasEnabled = this.enabled;
      this.enabled = Boolean(enabled);
      if (!this.enabled) {
        this.clear();
        this.setState("paused");
      } else if (this.lastUrl !== this.getUrl()) {
        this.schedule("route");
      } else if (!wasEnabled) {
        this.schedule("resume");
      } else {
        this.setState(this.loading ? "syncing" : this.sources.size ? "pending" : "ready");
      }
    }
    startNavigation() {
      this.clear();
      this.loading = true;
      this.setState(this.enabled ? "syncing" : "paused");
    }
    finishNavigation() {
      if (this.disposed) return;
      this.loading = false;
      this.setState(this.enabled ? "ready" : "paused");
      if (this.sources.size) this.schedule();
    }
    bindStorage(target) {
      this.unbindStorage();
      if (this.disposed || !target) return;
      try {
        target.addEventListener("storage", this.onStorage);
        this.storageWindow = target;
      } catch { /* 跨域导航后不接管其他站点的存储。 */ }
    }
    unbindStorage() {
      try { this.storageWindow?.removeEventListener("storage", this.onStorage); } catch { /* 旧文档已跨域。 */ }
      this.storageWindow = null;
    }
    schedule(source) {
      if (!this.enabled || this.disposed) return;
      if (source) this.sources.add(source);
      if (!this.sources.size) return;
      if (this.pendingSince === null) this.pendingSince = this.now();
      const pendingFor = this.now() - this.pendingSince;
      this.clock.clearTimeout(this.timer);
      this.setState("pending");
      if (this.loading) return;
      this.timer = this.clock.setTimeout(() => this.flush(), Math.max(80, Math.min(650, 2000 - pendingFor)));
    }
    flush() {
      this.timer = null;
      if (!this.enabled || this.disposed || this.loading || !this.sources.size) return;
      const url = this.getUrl();
      const routeChanged = url !== this.lastUrl;
      const refreshDocument = [...this.sources].some((source) => source !== "route");
      if (!routeChanged && !refreshDocument) {
        this.clear();
        this.setState("ready");
        return;
      }
      const elapsed = this.now() - this.lastSyncAt;
      if (elapsed < 1500) {
        this.timer = this.clock.setTimeout(() => this.flush(), 1500 - elapsed);
        return;
      }
      this.lastSyncAt = this.now();
      this.lastUrl = url;
      this.clear();
      this.onSync({ source: routeChanged ? "route" : "auto", url: routeChanged ? url : undefined, refreshDocument });
    }
    destroy() {
      this.clear();
      this.unbindStorage();
      this.disposed = true;
      this.state = "closed";
    }
  }
  globalThis.FrameLensSync = Object.freeze({ SyncController });
})();
