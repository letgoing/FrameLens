(() => {
  const { clamp, normalizePreview, statusBarHeight, frameMetrics } = globalThis.FrameLensConfig;
  const normalizeConfig = (config) => normalizePreview(config, location.href);
  const { settings } = globalThis.FrameLensRuntime;
  const logoUrl = chrome.runtime.getURL("icons/icon-128.png");
  const reportStateError = (error) => console.warn("FrameLens：预览操作失败", error.message);
  class FrameLensPreview {
    constructor(config, { onChange, onClose }) {
      this.onChange = onChange;
      this.onClose = onClose;
      this.config = normalizeConfig(config);
      this.outerUrl = location.href;
      this.currentScale = 1;
      this.theme = this.config.theme === "light" ? "light" : "dark";
      this.liveSyncEnabled = this.config.liveSync !== false;
      this.pendingScroll = null;
      this.sync = new globalThis.FrameLensSync.SyncController({
        enabled: this.liveSyncEnabled,
        getUrl: () => location.href,
        onState: (state) => this.setSyncState(state),
        onSync: (options) => {
          if (options.url) {
            this.outerUrl = options.url;
            this.config.url = options.url;
            this.addressLabel.textContent = options.url;
            this.addressLabel.title = options.url;
            if (this.getExitUrl() === options.url) this.recordCommittedUrl(options.url);
          }
          this.reload(options);
        }
      });
      this.destroyed = false;
      this.closing = false;
      this.closePromise = null;
      this.host = document.createElement("div");
      this.host.id = "__framelens_preview_host__";
      this.host.style.cssText =
        "all:initial;position:fixed;inset:0;z-index:2147483647;display:block;";
      this.host.tabIndex = -1;
      this.shadow = this.host.attachShadow({ mode: "open" });
      this.onKeydown = (event) => {
        if (event.key !== "Escape" || event.isComposing) return;
        event.preventDefault();
        this.close().catch(reportStateError);
      };
      this.onPageInput = (event) => {
        if (event.target === this.host || this.host.contains(event.target)) return;
        this.sync.schedule("form");
      };
      this.onRouteEvent = () => {
        this.sync.checkRoute();
        if (!this.sync.loading) this.navigation.checkFallback();
      };

      this.mount();
    }

    mount() {
      this.shadow.innerHTML = globalThis.FrameLensTemplate.render({ logoUrl });

      this.overlay = this.shadow.querySelector(".fl-overlay");
      this.overlay.dataset.theme = this.theme;
      this.toolbar = this.shadow.querySelector(".fl-toolbar");
      this.toolbarDock = this.shadow.querySelector(".fl-toolbar-dock");
      this.hideToolbarButton = this.shadow.querySelector('[data-action="hide-toolbar"]');
      this.toolbarPull = this.shadow.querySelector(".fl-toolbar-pull");
      this.setToolbarHidden(this.config.toolbarHidden);
      this.stage = this.shadow.querySelector(".fl-stage");
      this.scaleBox = this.shadow.querySelector(".fl-scale-box");
      this.device = this.shadow.querySelector(".fl-device");
      this.viewport = this.shadow.querySelector(".fl-viewport");
      this.iframe = this.shadow.querySelector("iframe");
      this.loader = this.shadow.querySelector(".fl-loader");
      this.nameLabel = this.shadow.querySelector(".fl-device-name");
      this.sizeLabel = this.shadow.querySelector(".fl-device-size");
      this.zoomLabel = this.shadow.querySelector(".fl-zoom-value");
      this.addressLabel = this.shadow.querySelector(".fl-browser-address");
      this.navigation = new globalThis.FrameLensNavigation.FrameNavigation(this.iframe, url => this.recordCommittedUrl(url));
      this.statusTime = this.shadow.querySelector(".fl-status-time");
      this.statusBar = this.shadow.querySelector(".fl-status-bar");
      this.statusTheme = new globalThis.FrameLensStatusTheme.StatusThemeController({
        iframe: this.iframe,
        bar: this.statusBar
      });
      this.liveDot = this.shadow.querySelector(".fl-live-dot");
      this.syncLabel = this.shadow.querySelector(".fl-sync-status");
      this.liveSyncButton = this.shadow.querySelector('[data-action="live-sync"]');
      this.updateClock = () => {
        const time = new Intl.DateTimeFormat(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        })
          .format(new Date())
          .replace(/^24:/, "00:");
        this.statusTime.textContent = time;
      };

      this.shadow.querySelectorAll("[data-action]").forEach((button) => {
        button.addEventListener("click", () =>
          this.handleAction(button.dataset.action).catch(reportStateError)
        );
      });
      this.iframe.addEventListener("load", () => {
        if (this.destroyed || this.closing) return;
        this.bindPreviewKeyboard();
        this.navigation.bind();
        this.bindPreviewStorage();
        this.statusTheme.bind();
        if (this.pendingScroll) {
          const scroll = this.pendingScroll;
          this.pendingScroll = null;
          requestAnimationFrame(() => {
            try {
              this.iframe.contentWindow.scrollTo(scroll.x, scroll.y);
            } catch {
              // 跨域跳转时无法恢复滚动位置。
            }
          });
        }
        this.loader.classList.add("hidden");
        this.sync.finishNavigation();
      });

      document.documentElement.append(this.host);
      this.layoutObserver = new ResizeObserver((entries) => {
        if (this.destroyed) return;
        if (entries.some(entry => entry.target === this.toolbar)) {
          const anchor = this.hideToolbarButton.getBoundingClientRect();
          const right = this.toolbar.getBoundingClientRect().right - (anchor.left + anchor.width / 2);
          this.toolbarPull.style.right = `${right}px`;
        }
        this.updateScale();
      });
      this.layoutObserver.observe(this.toolbar);
      this.layoutObserver.observe(this.stage);
      window.addEventListener("hashchange", this.onRouteEvent);
      window.addEventListener("popstate", this.onRouteEvent);
      document.addEventListener("keydown", this.onKeydown, true);
      document.addEventListener("change", this.onPageInput, true);
      this.updateClock();
      this.clockTimer = window.setInterval(this.updateClock, 30_000);
      this.update(this.config, true);
      this.setLiveSync(this.config.liveSync !== false, false);
      // 普通 DOM 更新不是数据提交信号：时钟、提示、轮询渲染都可能持续变化。
      // 仅跟随原页面路由；数据变化由预览窗口接收的 storage 事件触发。
      this.locationTimer = window.setInterval(this.onRouteEvent, 500);
      this.host.focus();
    }

    update(config, forceNavigation = false) {
      if (this.destroyed || this.closing) return;
      const previousUrl = this.config?.url;
      this.config = normalizeConfig({ ...this.config, ...config });
      this.setStatusBarDivider(this.config.statusBarDivider);
      this.setModelPosition(this.config.modelPosition);
      const { width, height, frame, name, dpr, physical, url } = this.config;
      const metrics = frameMetrics(frame, width, height);

      this.device.className = `fl-device fl-frame-${frame}`;
      this.device.style.width = `${metrics.width}px`;
      this.device.style.height = `${metrics.height}px`;
      this.viewport.style.width = `${width}px`;
      this.viewport.style.height = `${height + statusBarHeight(frame)}px`;
      this.iframe.style.width = `${width}px`;
      this.iframe.style.height = `${height}px`;

      this.nameLabel.textContent = name;
      this.nameLabel.title = name;
      const metricsText = [`${width} × ${height} CSS px`];
      if (dpr) metricsText.push(`DPR ${dpr}×`);
      if (physical) metricsText.push(`${physical} px`);
      this.sizeLabel.replaceChildren(...metricsText.map((text) => {
        const part = document.createElement("span");
        part.className = "fl-device-metric";
        part.textContent = text;
        return part;
      }));
      this.sizeLabel.title = metricsText.join(" · ");
      this.addressLabel.textContent = url;
      this.addressLabel.title = url;
      if (
        this.liveSyncButton &&
        this.liveSyncEnabled !== (this.config.liveSync !== false)
      ) {
        this.setLiveSync(this.config.liveSync !== false, false);
      }

      if (forceNavigation || previousUrl !== url || !this.iframe.src) {
        this.outerUrl = location.href;
        this.sync.resetUrl();
        this.reload({ url });
      }

      requestAnimationFrame(() => this.updateScale());
    }

    updateScale(explicitScale) {
      const { width, height, frame } = this.config;
      const metrics = frameMetrics(frame, width, height);
      const availableWidth = Math.max(240, this.stage.clientWidth - 56);
      const availableHeight = Math.max(240, this.stage.clientHeight - 56);
      const fitScale = clamp(
        Math.min(availableWidth / metrics.width, availableHeight / metrics.height),
        0.25,
        1
      );

      if (Number.isFinite(explicitScale)) {
        this.config.scale = clamp(explicitScale, 0.25, 1.5);
      }
      this.currentScale =
        this.config.scale === "fit"
          ? fitScale
          : clamp(Number(this.config.scale), 0.25, 1.5);

      this.device.style.transform = `scale(${this.currentScale})`;
      this.scaleBox.style.width = `${Math.round(metrics.width * this.currentScale)}px`;
      this.scaleBox.style.height = `${Math.round(metrics.height * this.currentScale)}px`;
      this.zoomLabel.textContent = `${Math.round(this.currentScale * 100)}%`;
    }

    rotate() {
      const { width, height } = this.config;
      this.update({
        width: height,
        height: width,
        orientation: width <= height ? "landscape" : "portrait"
      });
      settings.patch({width:height, height:width}, {presetId:this.config.presetId, width, height}).catch(reportStateError);
    }

    setToolbarHidden(hidden) {
      this.toolbarDock.dataset.collapsed = String(hidden);
      this.toolbar.inert = hidden;
      this.toolbarPull.setAttribute("aria-expanded", String(!hidden));
      this.toolbarPull.title = hidden ? "展开顶部工具栏" : "收起顶部工具栏";
      this.toolbarPull.setAttribute("aria-label", this.toolbarPull.title);
    }

    setModelPosition(position) {
      this.config.modelPosition = globalThis.FrameLensConfig.normalizePosition(position);
      this.stage.dataset.position = this.config.modelPosition;
    }

    setStatusBarDivider(enabled) {
      this.config.statusBarDivider = enabled === true;
      this.statusBar.dataset.divider = String(this.config.statusBarDivider);
    }

    setSyncState(state) {
      if (!this.syncLabel || !this.liveDot) return;
      const labels = {
        ready: "实时同步",
        pending: "待同步",
        syncing: "正在同步",
        paused: "已暂停"
      };
      this.syncLabel.dataset.state = state;
      this.liveDot.dataset.state = state;
      this.syncLabel.textContent = labels[state] || labels.ready;
    }

    setLiveSync(enabled, persist = true) {
      this.liveSyncEnabled = Boolean(enabled);
      this.config.liveSync = this.liveSyncEnabled;
      if (this.liveSyncButton) {
        this.liveSyncButton.setAttribute(
          "aria-pressed",
          String(this.liveSyncEnabled)
        );
        this.liveSyncButton.title = this.liveSyncEnabled
          ? "暂停实时同步"
          : "开启实时同步";
        this.liveSyncButton.setAttribute(
          "aria-label",
          this.liveSyncButton.title
        );
      }

      this.sync.setEnabled(this.liveSyncEnabled);
      if (persist) settings.patch({ liveSync: this.liveSyncEnabled }).catch(reportStateError);
    }

    bindPreviewStorage() {
      this.sync.unbindStorage();
      try {
        if (this.iframe.contentDocument) this.sync.bindStorage(this.iframe.contentWindow);
      } catch {
        // 预览跨域后不再接管其存储。
      }
    }

    bindPreviewKeyboard() {
      this.unbindPreviewKeyboard();
      try {
        const doc = this.iframe.contentDocument;
        if (!doc) return;
        doc.addEventListener("keydown", this.onKeydown, true);
        this.previewKeyboardDocument = doc;
      } catch { /* 跨域文档不能由父页面直接监听键盘。 */ }
    }

    unbindPreviewKeyboard() {
      try {
        this.previewKeyboardDocument?.removeEventListener("keydown", this.onKeydown, true);
      } catch { /* 旧文档已销毁或跨域。 */ }
      this.previewKeyboardDocument = null;
    }

    getExitUrl() {
      return globalThis.FrameLensNavigation.readFrameUrl(this.iframe);
    }

    recordCommittedUrl(url) {
      const next = url || this.outerUrl;
      if (this.closing || this.destroyed ||
          (this.committedOuter === this.outerUrl && this.committedInner === next)) return;
      this.committedOuter = this.outerUrl;
      this.committedInner = this.config.url = next;
      this.addressLabel.textContent = this.addressLabel.title = next;
      this.saveState().catch(reportStateError);
    }

    captureIframeScroll() {
      try {
        return {
          x: this.iframe.contentWindow.scrollX,
          y: this.iframe.contentWindow.scrollY
        };
      } catch {
        return null;
      }
    }

    reload({ source = "manual", url, refreshDocument = true } = {}) {
      if (this.destroyed || this.closing) return;
      this.sync.clear();
      if (url) {
        try {
          const current = new URL(this.iframe.contentWindow.location.href);
          const next = new URL(url);
          current.hash = "";
          next.hash = "";
          if (current.href === next.href) {
            // Hash 路由不会触发 iframe 的 load；不能因此一直盖着加载层。
            this.iframe.contentWindow.location.hash = new URL(url).hash;
            if (source === "route" && !refreshDocument) {
              this.sync.finishNavigation();
              this.loader.classList.add("hidden");
              return;
            }
            // 同 URL 重新应用，或 Hash 与数据同时改变，仍需真正重新加载。
            url = undefined;
          }
        } catch {
          // 跨域时继续使用 iframe.src 导航。
        }
      }
      this.sync.startNavigation();
      this.statusTheme.unbind();
      // 数据同步只更新顶部状态，不重复盖上整块白色加载层。
      if (source !== "auto") this.loader.classList.remove("hidden");
      if (source === "auto") {
        this.pendingScroll = this.captureIframeScroll();
      } else {
        this.pendingScroll = null;
      }
      if (url) {
        this.iframe.src = url;
        return;
      }
      try {
        this.iframe.contentWindow.location.reload();
      } catch {
        this.iframe.src = this.iframe.src;
      }
    }

    saveState() {
      if (this.destroyed || this.closing) return Promise.resolve();
      return this.onChange({ ...this.config, theme: this.theme, toolbarHidden: this.toolbar.inert }, this.outerUrl);
    }

    async handleAction(action) {
      if (this.destroyed || this.closing) return;
      if (action === "close") {
        await this.close();
        return;
      } else if (action === "hide-toolbar" || action === "toggle-toolbar") {
        this.setToolbarHidden(action === "hide-toolbar" || !this.toolbar.inert);
        this.toolbarPull.focus({ preventScroll: true });
      } else if (action === "rotate") {
        this.rotate();
      } else if (action === "reload") {
        this.reload();
      } else if (action === "live-sync") {
        this.setLiveSync(!this.liveSyncEnabled);
      } else if (action === "theme") {
        this.theme = this.theme === "dark" ? "light" : "dark";
        this.overlay.dataset.theme = this.theme;
      } else if (action === "zoom-out") {
        this.updateScale(this.currentScale - 0.1);
      } else if (action === "zoom-in") {
        this.updateScale(this.currentScale + 0.1);
      }
      await this.saveState();
    }

    close() {
      if (this.destroyed) return Promise.resolve();
      if (this.closePromise) return this.closePromise;
      this.closing = true;
      this.closePromise = (async () => {
        const url = this.getExitUrl();
        // 必须等后台清除完成再移除浮层/导航，否则新文档会恢复旧预览。
        await this.onClose(this);
        if (this.destroyed) return;
        this.destroy();
        if (url && url !== location.href) {
          // 让右侧栏的消息应答先发出，避免导航销毁消息端口而误报失败。
          window.setTimeout(() => location.replace(url), 0);
        }
      })().catch((error) => {
        this.closing = false;
        this.closePromise = null;
        this.syncLabel.textContent = "关闭失败";
        this.syncLabel.title = error.message;
        throw error;
      });
      return this.closePromise;
    }

    // 只做资源清理；扩展升级/重复注入不能触发用户关闭导航。
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.layoutObserver?.disconnect();
      this.sync.destroy();
      this.statusTheme.destroy();
      this.navigation?.unbind();
      this.unbindPreviewKeyboard();
      window.removeEventListener("hashchange", this.onRouteEvent);
      window.removeEventListener("popstate", this.onRouteEvent);
      document.removeEventListener("keydown", this.onKeydown, true);
      document.removeEventListener("change", this.onPageInput, true);
      window.clearInterval(this.locationTimer);
      window.clearInterval(this.clockTimer);
      this.host.remove();
    }
  }


  globalThis.FrameLensView = Object.freeze({ FrameLensPreview });
})();
