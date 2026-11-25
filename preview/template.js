(() => {
  const icons = {
    rotate: `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M15.5 7A6 6 0 1 0 16 12"></path>
        <path d="m12.5 4.5 3 2.5L18 4"></path>
      </svg>
    `,
    reload: `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M16 6.5A7 7 0 1 0 16.3 13"></path>
        <path d="M16 3v3.5h-3.5"></path>
      </svg>
    `,
    sync: `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M15.5 7A6 6 0 0 0 5.1 5.4L3.5 7"></path>
        <path d="M3.5 3.8V7h3.2"></path>
        <path d="M4.5 13a6 6 0 0 0 10.4 1.6l1.6-1.6"></path>
        <path d="M16.5 16.2V13h-3.2"></path>
      </svg>
    `,
    minus: `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M4 10h12"></path>
      </svg>
    `,
    plus: `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 4v12M4 10h12"></path>
      </svg>
    `,
    theme: `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 3v2M10 15v2M3 10h2M15 10h2"></path>
        <circle cx="10" cy="10" r="3"></circle>
        <path d="m5 5 1.3 1.3M13.7 13.7 15 15M15 5l-1.3 1.3M6.3 13.7 5 15"></path>
      </svg>
    `,
    collapse: `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="m5 12 5-5 5 5"></path>
      </svg>
    `,
    close: `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="m5 5 10 10M15 5 5 15"></path>
      </svg>
    `
  };


  const render = ({ logoUrl }) => {
    const styles = globalThis.FrameLensStyles;
    return `
        <style>${styles}</style>
        <div class="fl-overlay" data-theme="dark" role="dialog" aria-modal="true" aria-label="FrameLens 终端预览">
          <div class="fl-toolbar-dock">
            <div class="fl-toolbar-clip">
              <header class="fl-toolbar" id="fl-preview-toolbar">
                <div class="fl-toolbar-main">
                  <div class="fl-brand">
                    <img class="fl-brand-mark" src="${logoUrl}" alt="" aria-hidden="true" />
                    <span class="fl-brand-copy">
                      <strong>FrameLens</strong>
                      <span>终端预览</span>
                    </span>
                  </div>

                  <div class="fl-device-info">
                    <div class="fl-device-heading">
                      <strong class="fl-device-name"></strong>
                      <span class="fl-sync-badge">
                        <span class="fl-live-dot" data-state="ready" aria-hidden="true"></span>
                        <span class="fl-sync-status" data-state="ready">实时同步</span>
                      </span>
                    </div>
                    <span class="fl-device-size"></span>
                  </div>
                </div>

                <div class="fl-tools">
                  <div class="fl-tool-group fl-view-tools" role="group" aria-label="预览操作">
                    <button class="fl-tool-button fl-labeled-button" type="button" data-action="rotate" title="旋转屏幕" aria-label="旋转屏幕">${icons.rotate}<span class="fl-button-label">旋转</span></button>
                    <button class="fl-tool-button fl-labeled-button" type="button" data-action="reload" title="重新加载页面" aria-label="重新加载页面">${icons.reload}<span class="fl-button-label">刷新</span></button>
                    <button class="fl-tool-button" type="button" data-action="live-sync" title="暂停实时同步" aria-label="暂停实时同步" aria-pressed="true">${icons.sync}</button>
                    <button class="fl-tool-button" type="button" data-action="theme" title="切换背景" aria-label="切换背景">${icons.theme}</button>
                  </div>
                  <div class="fl-tool-group fl-zoom-tools" role="group" aria-label="预览缩放">
                    <button class="fl-tool-button" type="button" data-action="zoom-out" title="缩小" aria-label="缩小">${icons.minus}</button>
                    <span class="fl-zoom-value">100%</span>
                    <button class="fl-tool-button" type="button" data-action="zoom-in" title="放大" aria-label="放大">${icons.plus}</button>
                  </div>
                  <div class="fl-tool-group">
                    <button class="fl-tool-button fl-labeled-button" type="button" data-action="hide-toolbar" title="隐藏顶部工具栏" aria-label="隐藏顶部工具栏" aria-controls="fl-preview-toolbar" aria-expanded="true">${icons.collapse}<span class="fl-button-label">隐藏</span></button>
                    <button class="fl-tool-button fl-close" type="button" data-action="close" title="关闭预览" aria-label="关闭预览">${icons.close}</button>
                  </div>
                </div>
              </header>
            </div>
            <button class="fl-toolbar-pull" type="button" data-action="toggle-toolbar" aria-controls="fl-preview-toolbar" aria-expanded="true" aria-label="收起顶部工具栏" title="收起顶部工具栏">
              <svg viewBox="0 0 36 32" width="36" height="32" fill="none" aria-hidden="true">
                <path class="fl-pull-stem" d="M14 1h8m-4 0v9"/>
                <path class="fl-pull-loop" fill-rule="evenodd" d="M12 8h12c3 0 5 2 5 5l-1 7c-.6 5-4.4 8-10 8s-9.4-3-10-8l-1-7c0-3 2-5 5-5Z M13 12h10q2 0 2 2l-1 6q-1 4-6 4t-6-4l-1-6q0-2 2-2Z"/>
                <path class="fl-pull-arrow" d="m14.5 19.5 3.5-3.5 3.5 3.5"/>
              </svg>
            </button>
          </div>

          <main class="fl-stage">
            <div class="fl-canvas">
              <div class="fl-scale-box">
                <div class="fl-device">
                  <span class="fl-device-side-button" aria-hidden="true"></span>
                  <span class="fl-notch" aria-hidden="true"></span>
                  <div class="fl-browser-bar" aria-hidden="true">
                    <span class="fl-browser-dots"><i></i><i></i><i></i></span>
                    <span class="fl-browser-address"></span>
                  </div>
                  <div class="fl-viewport">
                    <div class="fl-status-bar" aria-hidden="true">
                      <span class="fl-status-time">9:41</span>
                      <span class="fl-status-icons">
                        <svg class="fl-signal-icon" viewBox="0 0 14 11">
                          <rect x="0" y="7.5" width="2.2" height="3.5" rx="0.8"></rect>
                          <rect x="3.9" y="5.2" width="2.2" height="5.8" rx="0.8"></rect>
                          <rect x="7.8" y="2.7" width="2.2" height="8.3" rx="0.8"></rect>
                          <rect x="11.7" y="0" width="2.2" height="11" rx="0.8"></rect>
                        </svg>
                        <svg class="fl-wifi-icon" viewBox="0 0 14 11">
                          <path d="M1 3.7a9.2 9.2 0 0 1 12 0"></path>
                          <path d="M3.3 6.2a5.8 5.8 0 0 1 7.4 0"></path>
                          <path d="M5.8 8.7a2 2 0 0 1 2.4 0"></path>
                        </svg>
                        <svg class="fl-battery-icon" viewBox="0 0 22 11">
                          <rect x="0.6" y="0.6" width="18.2" height="9.8" rx="2.6"></rect>
                          <path d="M20.1 3.4v4.2"></path>
                          <rect class="fl-battery-level" x="2.3" y="2.3" width="13.7" height="6.4" rx="1.4"></rect>
                        </svg>
                      </span>
                    </div>
                    <iframe title="当前页面终端预览" allow="clipboard-read; clipboard-write; fullscreen"></iframe>
                    <div class="fl-loader">
                      <span class="fl-loader-inner">
                        <span class="fl-spinner" aria-hidden="true"></span>
                        <span>正在加载当前页面…</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>

          <footer class="fl-footer">
            <span class="fl-hint"><kbd>Esc</kbd>&nbsp;关闭预览</span>
            <span>布局模拟基于 CSS 视口，不替代真机测试</span>
          </footer>
        </div>
      `;

  };
  globalThis.FrameLensTemplate = Object.freeze({ render });
})();
