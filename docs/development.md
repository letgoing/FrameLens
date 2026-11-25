# 开发与验证

仓库根目录就是可直接加载的扩展。修改代码后，到 `chrome://extensions/` 重新加载 FrameLens，再在普通网页上打开预览即可。日常使用不需要 Node.js；以下测试命令以 **Node.js 24** 为例，不依赖 npm 包。

## 检查扩展和运行单元测试

在仓库根目录执行：

```sh
node scripts/validate.mjs
node --test
```

第一条校验 Manifest、图标、预设尺寸和脚本接线；第二条验证配置保存、标签页状态、消息处理、同步、状态栏取色以及关闭导航。1.5.0 包含 47 项单元测试。

## 真实浏览器回归

准备支持以命令行加载未打包扩展的 **Chrome for Testing** 或 **Chromium**。将环境变量 `FRAMELENS_CHROME` 指向**可执行文件**，不是应用目录。在 macOS / Linux 中，例如：

```sh
FRAMELENS_CHROME="/absolute/path/to/chrome" node scripts/browser/verify-refresh.mjs
```

Windows PowerShell 对应写法：

```powershell
$env:FRAMELENS_CHROME = 'C:\path\to\chrome.exe'
node scripts/browser/verify-refresh.mjs
```

脚本以随机端口启动本地测试页，在独立临时配置中加载本仓库的扩展，不使用日常浏览器的账号。成功时输出浏览器版本、扩展版本、`"ok": true` 和逐项检查结果；回归截图目录在运行开始时打印。测试不需要访问业务网站或输入登录凭据。

回归覆盖侧栏实际应用和草稿隔离、两个入口同时保存、刷新后恢复同源内页、跨域回退、三个关闭入口、重复注入、自动同步不循环，以及模型外观和窄屏布局。

## 维护入口

| 文件 | 职责 |
| --- | --- |
| [manifest.json](../manifest.json)、[devices.js](../devices.js) | 发布版本、权限、加载顺序、快捷键；设备预设与默认值 |
| [popup.js](../popup.js)、[popup.html](../popup.html)、[popup.css](../popup.css) | 右侧面板、未应用的设备草稿、自定义尺寸、即时开关 |
| [background.js](../background.js)、[core/state.js](../core/state.js) | 默认偏好由后台按字段串行保存；当前标签页的预览会话单独存储 |
| [core/config.js](../core/config.js)、[core/runtime.js](../core/runtime.js) | 参数归一化、外框尺寸、脚本版本握手和消息通信 |
| [content.js](../content.js)、[preview/view.js](../preview/view.js) | 打开、恢复、关闭和销毁模型；布局、缩放和工具栏 |
| [preview/navigation.js](../preview/navigation.js)、[preview/sync.js](../preview/sync.js) | 监听已提交的内页地址；处理路由与数据同步，两者互不触发无关重载 |
| [preview/status-theme.js](../preview/status-theme.js) | 自适应状态栏的颜色、对比度和监听清理 |
| [preview/template.js](../preview/template.js)、[preview/styles.js](../preview/styles.js) | Shadow DOM 内的模板、模型机与工具栏样式 |

回到[安装与使用说明](../README.md)。
