(() => {
  const { normalizeSettings, normalizePreview } = globalThis.FrameLensConfig;
  const settingsKey = "frameLensSettings";
  const tabKey = (id) => `frameLensPreview:${id}`;
  const scopeOf = (url) => {
    try {
      const page = new URL(url);
      if (page.protocol === "file:") return `${page.origin}${page.pathname}`;
      return /^https?:$/.test(page.protocol) ? page.origin : null;
    } catch { return null; }
  };
  // 只在后台创建一个写入器。侧栏、工具栏和升级迁移都走同一条队列。
  const createSettingsStore = (storage) => {
    let tail = Promise.resolve();
    const read = async () => normalizeSettings((await storage.get(settingsKey))[settingsKey]);
    return {
      load: () => tail.then(read),
      patch(changes, expected) {
        const task = tail.then(async () => {
          const current = await read();
          if (expected && !Object.entries(expected).every(([key,value]) => current[key] === value)) return current;
          const settings = normalizeSettings({ ...current, ...changes });
          await storage.set({ [settingsKey]: settings });
          return settings;
        });
        tail = task.catch(() => {});
        return task;
      }
    };
  };
  const restoreUrl = (entry, current, type) => {
    const inner = entry?.config?.url;
    return type === "reload" && entry?.outerUrl === current && scopeOf(current) && scopeOf(inner) === scopeOf(current)
      ? inner : current;
  };
  const createTabStateStore = (storage) => {
    const tasks = new Map();
    const enqueue = (id, operation) => {
      const task = (tasks.get(id) || Promise.resolve()).catch(() => {}).then(operation);
      tasks.set(id, task);
      const release = () => { if (tasks.get(id) === task) tasks.delete(id); };
      task.then(release, release);
      return task;
    };
    return {
      remove(id) { return enqueue(id, () => storage.remove(tabKey(id))); },
      handle(message, sender) {
        const id = sender.tab?.id;
        const scope = scopeOf(sender.url);
        if (!Number.isInteger(id) || sender.frameId !== 0 || !scope) {
          return Promise.reject(new Error("无法识别当前预览标签页"));
        }
        return enqueue(id, async () => {
          const key = tabKey(id);
          if (message.type === "FRAMELENS_SAVE_TAB_STATE") {
            if (!message.config || typeof message.config !== "object") throw new Error("缺少预览配置");
            const outerUrl = scopeOf(message.outerUrl) === scope ? message.outerUrl : sender.url;
            await storage.set({ [key]: { scope, outerUrl, config: normalizePreview(message.config, outerUrl) } });
            return { ok: true };
          }
          if (message.type === "FRAMELENS_CLEAR_TAB_STATE") {
            await storage.remove(key);
            return { ok: true };
          }
          const stored = (await storage.get(key))[key];
          if (stored && stored.scope !== scope) {
            await storage.remove(key);
            return { ok: true, config: null };
          }
          return { ok: true, outerUrl: stored?.outerUrl, config: stored?.config ? normalizePreview(stored.config, sender.url) : null };
        });
      }
    };
  };
  globalThis.FrameLensState = Object.freeze({ createSettingsStore, createTabStateStore, scopeOf, tabKey, restoreUrl });
})();
