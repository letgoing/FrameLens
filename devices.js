(() => {
  const presets = [
    {
      id: "iphone-17-pro",
      name: "iPhone 17 Pro",
      shortName: "17 Pro",
      family: "iPhone",
      width: 402,
      height: 874,
      dpr: 3,
      physical: "1206 × 2622",
      frame: "iphone"
    },
    {
      id: "iphone-17-pro-max",
      name: "iPhone 17 Pro Max",
      shortName: "17 Pro Max",
      family: "iPhone",
      width: 440,
      height: 956,
      dpr: 3,
      physical: "1320 × 2868",
      frame: "iphone"
    },
    {
      id: "iphone-16-pro",
      name: "iPhone 16 Pro",
      shortName: "16 Pro",
      family: "iPhone",
      width: 402,
      height: 874,
      dpr: 3,
      physical: "1206 × 2622",
      frame: "iphone"
    },
    {
      id: "iphone-16-pro-max",
      name: "iPhone 16 Pro Max",
      shortName: "16 Pro Max",
      family: "iPhone",
      width: 440,
      height: 956,
      dpr: 3,
      physical: "1320 × 2868",
      frame: "iphone"
    },
    {
      id: "iphone-15-pro",
      name: "iPhone 15 Pro",
      shortName: "15 Pro",
      family: "iPhone",
      width: 393,
      height: 852,
      dpr: 3,
      physical: "1179 × 2556",
      frame: "iphone"
    },
    {
      id: "iphone-15-pro-max",
      name: "iPhone 15 Pro Max",
      shortName: "15 Pro Max",
      family: "iPhone",
      width: 430,
      height: 932,
      dpr: 3,
      physical: "1290 × 2796",
      frame: "iphone"
    },
    {
      id: "iphone-14",
      name: "iPhone 14 / 13 / 12",
      shortName: "iPhone 14",
      family: "iPhone",
      width: 390,
      height: 844,
      dpr: 3,
      physical: "1170 × 2532",
      frame: "iphone"
    },
    {
      id: "iphone-se",
      name: "iPhone SE",
      shortName: "iPhone SE",
      family: "iPhone",
      width: 375,
      height: 667,
      dpr: 2,
      physical: "750 × 1334",
      frame: "iphone"
    },
    {
      id: "pixel-9-pro",
      name: "Google Pixel 9 Pro",
      shortName: "Pixel 9 Pro",
      family: "Android",
      width: 412,
      height: 915,
      dpr: 3,
      physical: "1280 × 2856",
      frame: "android"
    },
    {
      id: "galaxy-s24-ultra",
      name: "Samsung Galaxy S24 Ultra",
      shortName: "S24 Ultra",
      family: "Android",
      width: 412,
      height: 915,
      dpr: 3,
      physical: "1440 × 3120",
      frame: "android"
    },
    {
      id: "android-compact",
      name: "Android 小屏基准",
      shortName: "360 基准",
      family: "Android",
      width: 360,
      height: 800,
      dpr: 3,
      physical: "1080 × 2400",
      frame: "android"
    },
    {
      id: "ipad-mini",
      name: "iPad mini",
      shortName: "iPad mini",
      family: "iPad",
      width: 744,
      height: 1133,
      dpr: 2,
      physical: "1488 × 2266",
      frame: "tablet"
    },
    {
      id: "ipad-pro-11",
      name: "iPad Pro 11 英寸",
      shortName: "iPad Pro 11",
      family: "iPad",
      width: 834,
      height: 1194,
      dpr: 2,
      physical: "1668 × 2388",
      frame: "tablet"
    },
    {
      id: "desktop-1440",
      name: "桌面端 1440",
      shortName: "1440 桌面",
      family: "桌面端",
      width: 1440,
      height: 900,
      dpr: 1,
      physical: "1440 × 900",
      frame: "browser"
    }
  ];

  const defaultConfig = {
    presetId: "iphone-15-pro-max",
    name: "iPhone 15 Pro Max",
    width: 430,
    height: 932,
    dpr: 3,
    physical: "1290 × 2796",
    frame: "iphone",
    scale: "fit",
    modelPosition: "center",
    orientation: "portrait",
    liveSync: true,
    statusBarDivider: false
  };

  globalThis.FrameLensDevices = Object.freeze({
    presets: Object.freeze(presets.map((preset) => Object.freeze(preset))),
    defaultConfig: Object.freeze(defaultConfig)
  });
})();
