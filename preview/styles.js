globalThis.FrameLensStyles = `
    :host {
      all: initial;
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      color: #edf1f8;
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont,
        "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif;
      font-synthesis: none;
      line-height: 1.4;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    button {
      font: inherit;
    }

    .fl-overlay {
      position: fixed;
      inset: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) 32px;
      overflow: hidden;
      /* 宿主的行内 all:initial 会覆盖 :host 的继承色，内层需明确指定。 */
      color: #edf1f8;
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont,
        "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif;
      line-height: 1.4;
      background:
        radial-gradient(circle at 18% 12%, rgba(99, 102, 241, 0.2), transparent 28%),
        radial-gradient(circle at 82% 88%, rgba(45, 212, 191, 0.1), transparent 25%),
        rgba(8, 12, 22, 0.94);
      backdrop-filter: blur(18px) saturate(0.9);
    }

    .fl-overlay[data-theme="light"] {
      color: #20283a;
      background:
        radial-gradient(circle at 18% 12%, rgba(99, 102, 241, 0.11), transparent 28%),
        radial-gradient(circle at 82% 88%, rgba(45, 212, 191, 0.08), transparent 25%),
        rgba(237, 240, 247, 0.96);
    }

    .fl-toolbar-dock {
      position: relative;
      z-index: 5;
      display: grid;
      grid-template-rows: 1fr;
      min-width: 0;
      transition: grid-template-rows 220ms cubic-bezier(.22,.8,.28,1);
    }

    .fl-toolbar-dock[data-collapsed="true"] {
      grid-template-rows: 0fr;
    }

    .fl-toolbar-clip {
      min-height: 0;
      overflow: clip;
    }

    .fl-toolbar-dock[data-collapsed="true"] .fl-toolbar {
      transform: translateY(-100%);
    }

    .fl-toolbar {
      transition: transform 220ms cubic-bezier(.22,.8,.28,1);
      --fl-toolbar-primary: #f8fafc;
      --fl-toolbar-secondary: #c3ccdc;
      --fl-toolbar-muted: #b5c1d5;
      position: relative;
      z-index: 5;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 20px;
      min-width: 0;
      min-height: 76px;
      padding: 10px 20px;
      color: var(--fl-toolbar-primary);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(9, 13, 24, 0.66);
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
      backdrop-filter: blur(18px);
    }

    .fl-overlay[data-theme="light"] .fl-toolbar {
      --fl-toolbar-primary: #20283a;
      --fl-toolbar-secondary: #4f5b70;
      --fl-toolbar-muted: #566279;
      border-bottom-color: rgba(49, 57, 81, 0.12);
      color: var(--fl-toolbar-primary);
      background: rgba(255, 255, 255, 0.74);
    }

    .fl-brand,
    .fl-toolbar-main,
    .fl-device-heading,
    .fl-sync-badge,
    .fl-tools,
    .fl-tool-group,
    .fl-hint {
      display: flex;
      align-items: center;
    }

    .fl-toolbar-main {
      min-width: 0;
      gap: 20px;
    }

    .fl-brand {
      min-width: 0;
      flex: 0 0 auto;
      gap: 10px;
      padding-right: 20px;
      border-right: 1px solid rgba(255, 255, 255, 0.14);
    }

    .fl-overlay[data-theme="light"] .fl-brand {
      border-right-color: rgba(44, 53, 76, 0.15);
    }

    .fl-brand-mark {
      width: 36px;
      height: 36px;
      flex: 0 0 36px;
      border-radius: 9px;
      object-fit: cover;
      background: #07142e;
      box-shadow: 0 6px 16px rgba(4, 19, 52, 0.42);
    }

    .fl-brand-copy {
      min-width: 0;
    }

    .fl-brand-copy strong,
    .fl-brand-copy span {
      display: block;
    }

    .fl-brand-copy strong {
      color: var(--fl-toolbar-primary);
      font-size: 16px;
      font-weight: 780;
      letter-spacing: -0.1px;
    }

    .fl-brand-copy span {
      margin-top: 1px;
      color: var(--fl-toolbar-muted);
      font-size: 13px;
    }

    .fl-device-info {
      min-width: 0;
      flex: 1;
    }

    .fl-device-heading {
      min-width: 0;
      flex-wrap: wrap;
      gap: 4px 14px;
    }

    .fl-device-name {
      display: block;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .fl-device-name {
      color: var(--fl-toolbar-primary);
      max-width: 100%;
      font-size: 16px;
      font-weight: 720;
    }

    .fl-device-size {
      display: flex;
      flex-wrap: wrap;
      gap: 2px 12px;
      margin-top: 3px;
      color: var(--fl-toolbar-secondary);
      font-size: 13px;
    }

    .fl-device-metric {
      white-space: nowrap;
    }

    .fl-sync-badge {
      flex: 0 0 auto;
      gap: 8px;
    }

    .fl-live-dot {
      width: 7px;
      height: 7px;
      flex: 0 0 7px;
      border-radius: 50%;
      background: #54d1a4;
      box-shadow: 0 0 0 4px rgba(84, 209, 164, 0.13);
    }

    .fl-live-dot[data-state="pending"] {
      background: #f2b85c;
      box-shadow: 0 0 0 4px rgba(242, 184, 92, 0.13);
    }

    .fl-live-dot[data-state="syncing"] {
      background: #7e80ee;
      box-shadow: 0 0 0 4px rgba(126, 128, 238, 0.14);
      animation: fl-live-pulse 900ms ease-in-out infinite alternate;
    }

    .fl-live-dot[data-state="paused"] {
      background: #8f98aa;
      box-shadow: 0 0 0 4px rgba(143, 152, 170, 0.12);
    }

    .fl-sync-status {
      min-width: 52px;
      color: #62d3aa;
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
    }

    .fl-sync-status[data-state="pending"] {
      color: #f0bd6c;
    }

    .fl-sync-status[data-state="syncing"] {
      color: #aeb0ff;
    }

    .fl-sync-status[data-state="paused"] {
      color: var(--fl-toolbar-muted);
    }

    .fl-overlay[data-theme="light"] .fl-sync-status {
      color: #29936f;
    }

    .fl-overlay[data-theme="light"] .fl-sync-status[data-state="pending"] {
      color: #b57922;
    }

    .fl-overlay[data-theme="light"] .fl-sync-status[data-state="syncing"] {
      color: #5658d7;
    }

    .fl-overlay[data-theme="light"] .fl-sync-status[data-state="paused"] {
      color: #7d8697;
    }

    .fl-tools {
      flex: 0 0 auto;
      gap: 10px;
      justify-content: flex-end;
    }

    .fl-tool-group {
      gap: 4px;
      padding: 4px;
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 9px;
      background: rgba(255, 255, 255, 0.045);
    }

    .fl-overlay[data-theme="light"] .fl-tool-group {
      border-color: rgba(44, 53, 76, 0.1);
      background: rgba(255, 255, 255, 0.62);
    }

    .fl-tool-button {
      display: inline-grid;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 0;
      border-radius: 6px;
      color: var(--fl-toolbar-secondary);
      background: transparent;
      cursor: pointer;
      place-items: center;
      font-size: 14px;
      line-height: 1;
      transition:
        color 140ms ease,
        background 140ms ease;
    }

    .fl-tool-button:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
    }

    .fl-labeled-button {
      display: inline-flex;
      width: auto;
      padding: 0 10px;
      justify-content: center;
      align-items: center;
      gap: 6px;
    }

    .fl-tool-button:focus-visible {
      outline: 2px solid #9295f4;
      outline-offset: 2px;
    }

    .fl-tool-button[aria-pressed="true"] {
      color: #c6c7ff;
      background: rgba(106, 108, 226, 0.2);
    }

    .fl-overlay[data-theme="light"] .fl-tool-button[aria-pressed="true"] {
      color: #5153d4;
      background: rgba(92, 94, 220, 0.12);
    }

    .fl-overlay[data-theme="light"] .fl-tool-button {
      color: #677186;
    }

    .fl-overlay[data-theme="light"] .fl-tool-button:hover {
      color: #4e50cc;
      background: rgba(92, 94, 220, 0.09);
    }

    .fl-tool-button svg {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.6;
    }

    .fl-tool-button.fl-close:hover {
      color: #ffbbc5;
      background: rgba(226, 74, 96, 0.18);
    }

    .fl-zoom-value {
      min-width: 52px;
      color: var(--fl-toolbar-secondary);
      font-size: 14px;
      font-variant-numeric: tabular-nums;
      text-align: center;
    }

    .fl-stage {
      grid-row: 2;
      position: relative;
      min-width: 0;
      min-height: 0;
      overflow: auto;
      overscroll-behavior: contain;
      scrollbar-color: rgba(149, 158, 181, 0.35) transparent;
      scrollbar-width: thin;
    }

    .fl-stage::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    .fl-stage::-webkit-scrollbar-thumb {
      border: 2px solid transparent;
      border-radius: 999px;
      background: rgba(149, 158, 181, 0.32);
      background-clip: padding-box;
    }

    .fl-canvas {
      display: flex;
      width: max-content;
      min-width: 100%;
      min-height: 100%;
      align-items: center;
      justify-content: center;
      padding: 28px;
    }

    .fl-stage[data-position="left"] .fl-canvas {
      justify-content: left;
    }

    .fl-stage[data-position="right"] .fl-canvas {
      justify-content: right;
    }

    .fl-scale-box {
      position: relative;
      flex: 0 0 auto;
      transition:
        width 180ms ease,
        height 180ms ease;
    }

    .fl-device {
      position: absolute;
      top: 0;
      left: 0;
      overflow: hidden;
      background: #080a0d;
      box-shadow:
        0 42px 90px rgba(0, 0, 0, 0.42),
        0 14px 34px rgba(0, 0, 0, 0.33),
        inset 0 0 0 1px rgba(255, 255, 255, 0.12);
      transform-origin: top left;
      /* 保持模型整体合成，避免缩放后状态栏与 iframe 交界露出白缝。 */
      will-change: transform;
      transition:
        width 180ms ease,
        height 180ms ease,
        border-radius 180ms ease,
        transform 180ms ease;
    }

    .fl-frame-iphone,
    .fl-frame-android {
      padding: 12px;
      border: 1px solid #2b2f36;
      background: #0a0c0f;
    }

    .fl-frame-iphone {
      border-radius: 64px;
      box-shadow:
        0 42px 90px rgba(0, 0, 0, 0.42),
        0 14px 34px rgba(0, 0, 0, 0.33),
        inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    }

    .fl-frame-android {
      border-radius: 49px;
    }

    .fl-frame-iphone::after,
    .fl-frame-android::after {
      content: "";
      position: absolute;
      inset: 4px;
      z-index: 3;
      border: 1px solid rgba(255, 255, 255, 0.055);
      pointer-events: none;
    }

    .fl-frame-iphone::after {
      border-radius: 59px;
    }

    .fl-frame-android::after {
      border-radius: 44px;
    }

    .fl-frame-tablet {
      padding: 15px;
      border: 1px solid #343942;
      border-radius: 34px;
      background:
        linear-gradient(145deg, #2e333b, #0a0c10 34%, #1b1e24 78%, #050608);
    }

    .fl-frame-tablet::after {
      content: "";
      position: absolute;
      inset: 5px;
      z-index: 3;
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 29px;
      pointer-events: none;
    }

    .fl-frame-browser {
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 13px;
      background: #eff2f7;
      box-shadow:
        0 38px 80px rgba(0, 0, 0, 0.38),
        0 10px 28px rgba(0, 0, 0, 0.26);
    }

    .fl-frame-none {
      border: 1px solid rgba(255, 255, 255, 0.17);
      border-radius: 4px;
      background: #fff;
      box-shadow: 0 32px 75px rgba(0, 0, 0, 0.34);
    }

    .fl-device-side-button {
      position: absolute;
      top: 152px;
      right: -2px;
      z-index: 4;
      width: 3px;
      height: 72px;
      border-radius: 0 2px 2px 0;
      background: #3c4149;
    }

    .fl-frame-android .fl-device-side-button {
      top: 132px;
      height: 58px;
    }

    .fl-frame-tablet .fl-device-side-button,
    .fl-frame-browser .fl-device-side-button,
    .fl-frame-none .fl-device-side-button {
      display: none;
    }

    .fl-notch {
      position: absolute;
      top: 20px;
      left: 50%;
      z-index: 7;
      width: 102px;
      height: 28px;
      border-radius: 999px;
      background: #050608;
      box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.05);
      pointer-events: none;
      transform: translateX(-50%);
    }

    .fl-notch::after {
      content: "";
      position: absolute;
      top: 10px;
      right: 12px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: radial-gradient(circle at 38% 38%, #294266, #07090d 70%);
    }

    .fl-frame-android .fl-notch {
      top: 20px;
      width: 14px;
      height: 14px;
      border: 2px solid #16191e;
      box-shadow: none;
    }

    .fl-frame-android .fl-notch::after {
      inset: 2px;
      width: auto;
      height: auto;
    }

    .fl-frame-tablet .fl-notch {
      top: 5px;
      width: 5px;
      height: 5px;
      background: #08090b;
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06);
    }

    .fl-frame-tablet .fl-notch::after,
    .fl-frame-browser .fl-notch,
    .fl-frame-none .fl-notch {
      display: none;
    }

    .fl-browser-bar {
      display: none;
      height: 38px;
      padding: 0 11px;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid #d8dde6;
      background: linear-gradient(#f8f9fc, #ebeff5);
    }

    .fl-frame-browser .fl-browser-bar {
      display: flex;
    }

    .fl-browser-dots {
      display: flex;
      gap: 5px;
    }

    .fl-browser-dots i {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #bdc4d0;
    }

    .fl-browser-dots i:first-child {
      background: #ef6a6a;
    }

    .fl-browser-dots i:nth-child(2) {
      background: #e9bd57;
    }

    .fl-browser-dots i:nth-child(3) {
      background: #62c784;
    }

    .fl-browser-address {
      height: 22px;
      flex: 1;
      overflow: hidden;
      padding: 4px 10px;
      border: 1px solid #dce1e9;
      border-radius: 6px;
      color: #8992a2;
      background: rgba(255, 255, 255, 0.82);
      font-size: 8px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .fl-viewport {
      position: relative;
      isolation: isolate;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #fff;
    }

    .fl-frame-iphone .fl-viewport,
    .fl-frame-android .fl-viewport {
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);
    }

    .fl-frame-iphone .fl-viewport {
      border-radius: 52px;
    }

    .fl-frame-android .fl-viewport {
      border-radius: 37px;
    }

    .fl-frame-tablet .fl-viewport {
      border-radius: 21px;
    }

    .fl-frame-browser .fl-viewport {
      border-radius: 0 0 12px 12px;
    }

    .fl-frame-none .fl-viewport {
      border-radius: 3px;
    }

    .fl-viewport iframe {
      position: relative;
      z-index: 1;
      display: block;
      flex: 0 0 auto;
      border: 0;
      background: #fff;
    }

    .fl-status-bar {
      position: relative;
      z-index: 10;
      display: flex;
      width: 100%;
      height: 48px;
      flex: 0 0 48px;
      padding: 10px 24px 0;
      align-items: flex-start;
      justify-content: space-between;
      color: #11141a;
      background: #fff;
      box-shadow: none;
      font-size: 11px;
      font-weight: 760;
      letter-spacing: -0.15px;
      line-height: 15px;
      pointer-events: none;
      text-shadow: none;
    }

    .fl-status-bar[data-divider="true"]::after {
      content: "";
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
      height: 1px;
      background: currentColor;
      opacity: 0.16;
      pointer-events: none;
    }

    .fl-status-time {
      min-width: 54px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .fl-status-icons {
      display: flex;
      min-width: 64px;
      height: 15px;
      align-items: center;
      justify-content: flex-end;
      gap: 5px;
    }

    .fl-status-icons svg {
      display: block;
      flex: 0 0 auto;
      fill: currentColor;
      stroke: currentColor;
    }

    .fl-signal-icon {
      width: 14px;
      height: 11px;
    }

    .fl-wifi-icon {
      width: 14px;
      height: 11px;
      fill: none !important;
      stroke-linecap: round;
      stroke-width: 1.7;
    }

    .fl-battery-icon {
      width: 20px;
      height: 10px;
      fill: none !important;
      stroke-width: 1.2;
    }

    .fl-battery-icon .fl-battery-level {
      fill: currentColor;
      stroke: none;
    }

    .fl-frame-android .fl-status-bar {
      height: 40px;
      flex-basis: 40px;
      padding: 8px 17px 0;
      font-size: 10px;
    }

    .fl-frame-android .fl-status-time {
      min-width: auto;
      text-align: left;
    }

    .fl-frame-tablet .fl-status-bar {
      height: 34px;
      flex-basis: 34px;
      padding: 7px 18px 0;
      font-size: 9px;
    }

    .fl-frame-tablet .fl-status-time {
      min-width: auto;
      text-align: left;
    }

    .fl-frame-browser .fl-status-bar,
    .fl-frame-none .fl-status-bar {
      display: none;
    }

    .fl-loader {
      position: absolute;
      inset: 0;
      z-index: 2;
      display: grid;
      color: #737e91;
      background: #f7f8fb;
      font-size: 10px;
      place-items: center;
      transition:
        opacity 180ms ease,
        visibility 180ms ease;
    }

    .fl-loader.hidden {
      visibility: hidden;
      opacity: 0;
    }

    .fl-loader-inner {
      display: grid;
      justify-items: center;
      gap: 10px;
    }

    .fl-spinner {
      width: 22px;
      height: 22px;
      border: 2px solid #dfe3eb;
      border-top-color: #686ae3;
      border-radius: 50%;
      animation: fl-spin 700ms linear infinite;
    }

    .fl-footer {
      grid-row: 3;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.07);
      color: #7e899d;
      background: rgba(6, 9, 17, 0.7);
      font-size: 8px;
      letter-spacing: 0.1px;
    }

    .fl-overlay[data-theme="light"] .fl-footer {
      border-top-color: rgba(44, 53, 76, 0.08);
      color: #7a8496;
      background: rgba(255, 255, 255, 0.52);
    }

    .fl-toolbar-pull {
      position: absolute;
      top: 100%;
      right: 80px;
      transform: translateX(50%);
      display: grid;
      place-items: start center;
      width: 44px;
      height: 34px;
      border: 0;
      border-radius: 0 0 12px 12px;
      padding: 0;
      background: transparent;
      cursor: pointer;
      color: #c1cdf5;
      --fl-pull-surface: #7382ae;
    }

    .fl-overlay[data-theme="light"] .fl-toolbar-pull {
      color: #4e5d87;
      --fl-pull-surface: #c4cde4;
    }

    .fl-toolbar-pull svg {
      stroke: currentColor;
      stroke-linejoin: round;
      stroke-linecap: round;
      filter: drop-shadow(0 2px 2px rgb(6 12 28 / 30%));
      transform-origin: 50% 0;
      transition: transform 180ms ease-out;
    }

    .fl-toolbar-pull:hover svg { transform: scaleY(1.08); }
    .fl-toolbar-pull:active svg { transform: scaleY(1.16); }
    .fl-pull-stem { stroke-width: 3; }
    .fl-pull-loop { stroke-width: 1.4; fill: var(--fl-pull-surface); }
    .fl-pull-arrow {
      stroke-width: 2;
      transform-origin: 18px 18px;
      transition: transform 220ms ease;
    }
    .fl-toolbar-pull[aria-expanded="false"] .fl-pull-arrow { transform: rotate(180deg); }

    .fl-toolbar-pull:focus-visible {
      outline: 2px solid #9295f4;
      outline-offset: -2px;
    }

    .fl-footer kbd {
      display: inline-grid;
      min-width: 18px;
      height: 17px;
      padding: 0 4px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-bottom-width: 2px;
      border-radius: 4px;
      color: #aab3c4;
      background: rgba(255, 255, 255, 0.06);
      font-family: inherit;
      font-size: 8px;
      place-items: center;
    }

    .fl-overlay[data-theme="light"] .fl-footer kbd {
      border-color: #d4d9e3;
      color: #737d90;
      background: #fff;
    }

    @keyframes fl-spin {
      to { transform: rotate(360deg); }
    }

    @keyframes fl-live-pulse {
      to {
        opacity: 0.48;
        transform: scale(0.82);
      }
    }

    @media (max-width: 1199px) {
      .fl-button-label {
        display: none;
      }

      .fl-labeled-button {
        width: 36px;
        padding: 0;
      }
    }

    @media (max-width: 959px) {
      .fl-toolbar {
        grid-template-columns: minmax(0, 1fr);
        gap: 10px;
        padding: 10px 16px;
      }

      .fl-tools {
        justify-content: flex-end;
      }

      .fl-toolbar-main {
        gap: 16px;
      }

      .fl-brand {
        padding-right: 16px;
      }
    }

    @media (max-width: 559px) {
      .fl-toolbar {
        padding: 10px 12px;
      }

      .fl-brand-copy {
        display: none;
      }

      .fl-brand {
        padding-right: 12px;
      }

      .fl-toolbar-main {
        gap: 12px;
      }

      .fl-tools {
        gap: 6px;
        justify-content: space-between;
      }

      .fl-tool-group {
        gap: 2px;
        padding: 2px;
      }

      .fl-tool-button {
        width: 34px;
      }

      .fl-zoom-value {
        min-width: 44px;
      }

      .fl-canvas {
        padding: 16px;
      }
    }

    @media (max-width: 399px) {
      .fl-tools {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .fl-view-tools {
        grid-column: 1 / -1;
        justify-content: space-around;
      }

      .fl-zoom-tools {
        justify-content: center;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
      }
    }
  `;
