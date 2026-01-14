const DEFAULTS = {
  windowMinutes: 120,
  matchMode: "symbol",
  showMode: "all",
  onlyWithinWindow: true,
  language: "auto"
};

// 多语言文本
const i18n = {
  en: {
    title: "GMGN Same-Name First Launch Filter",
    timeWindow: "Time Window (minutes)",
    timeWindowHint: "Only compare tokens within this time range (ageMs ≤ this value)",
    matchMode: "Match Mode",
    matchEither: "Symbol or Name matches",
    matchSymbol: "Symbol only",
    matchName: "Name only",
    matchBoth: "Both Symbol and Name match",
    showMode: "Display Mode",
    showAll: "Show all (mark First/Not First)",
    showOnlyFirst: "Show First only (In development)",
    showOnlyDup: "Show Not First only (In development)",
    hideNonSameNameFirst: "Hide non-duplicate groups (In development)",
    showModeHint: "The oldest token (largest ageMs) is considered First",
    onlyWithinWindow: "Compare only within time window",
    language: "Language",
    langAuto: "Auto (Browser Language)",
    langEn: "English",
    langZh: "中文",
    save: "Save",
    reset: "Reset Data"
  },
  zh: {
    title: "GMGN 同名首发过滤器",
    timeWindow: "时间窗口（分钟）",
    timeWindowHint: "仅比较此时间范围内的代币（ageMs ≤ 此值）",
    matchMode: "匹配模式",
    matchEither: "Symbol 或 Name 任一相同",
    matchSymbol: "仅 Symbol 相同",
    matchName: "仅 Name 相同",
    matchBoth: "Symbol 和 Name 都相同",
    showMode: "显示模式",
    showAll: "显示所有（标记首发/非首发）",
    showOnlyFirst: "只显示首发（开发中）",
    showOnlyDup: "只显示非首发（开发中）",
    hideNonSameNameFirst: "隐藏非同名组（开发中）",
    showModeHint: "最老创建的代币（ageMs 最大）是首发",
    onlyWithinWindow: "仅在时间窗口内比较",
    language: "语言",
    langAuto: "自动（浏览器语言）",
    langEn: "English",
    langZh: "中文",
    save: "保存",
    reset: "重置数据"
  }
};

let currentLang = "en";

const $ = (id) => document.getElementById(id);

/**
 * 检测用户语言
 */
function detectLanguage() {
  const browserLang = navigator.language || navigator.userLanguage || "en";
  if (browserLang.toLowerCase().startsWith("zh")) {
    return "zh";
  }
  return "en";
}

/**
 * 获取翻译文本
 */
function t(key) {
  return i18n[currentLang]?.[key] || i18n.en[key] || key;
}

/**
 * 更新页面文本
 */
function updateTexts() {
  $("title").textContent = t("title");
  $("pageTitle").textContent = t("title");
  
  $("timeWindowLabel").textContent = t("timeWindow");
  $("timeWindowHint").textContent = t("timeWindowHint");
  
  $("matchModeLabel").textContent = t("matchMode");
  $("matchEither").textContent = t("matchEither");
  $("matchSymbol").textContent = t("matchSymbol");
  $("matchName").textContent = t("matchName");
  $("matchBoth").textContent = t("matchBoth");
  
  $("showModeLabel").textContent = t("showMode");
  $("showAll").textContent = t("showAll");
  $("showOnlyFirst").textContent = t("showOnlyFirst");
  $("showOnlyDup").textContent = t("showOnlyDup");
  $("hideNonSameNameFirst").textContent = t("hideNonSameNameFirst");
  $("showModeHint").textContent = t("showModeHint");
  
  $("onlyWithinWindowLabel").textContent = t("onlyWithinWindow");
  
  $("languageLabel").textContent = t("language");
  $("langAuto").textContent = t("langAuto");
  $("langEn").textContent = t("langEn");
  $("langZh").textContent = t("langZh");
  
  $("save").textContent = t("save");
  $("reset").textContent = t("reset");
}

async function load() {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  
  // 确定当前语言
  if (cfg.language === "auto") {
    currentLang = detectLanguage();
  } else {
    currentLang = cfg.language;
  }
  
  // 填充表单
  $("windowMinutes").value = cfg.windowMinutes;
  $("matchMode").value = cfg.matchMode;
  $("showMode").value = cfg.showMode;
  $("onlyWithinWindow").checked = cfg.onlyWithinWindow;
  $("language").value = cfg.language;
  
  // 更新页面文本
  updateTexts();
}

// 语言切换时实时更新
$("language").addEventListener("change", () => {
  const langValue = $("language").value;
  if (langValue === "auto") {
    currentLang = detectLanguage();
  } else {
    currentLang = langValue;
  }
  updateTexts();
});

$("save").onclick = async () => {
  await chrome.storage.sync.set({
    windowMinutes: Number($("windowMinutes").value),
    matchMode: $("matchMode").value,
    showMode: $("showMode").value,
    onlyWithinWindow: $("onlyWithinWindow").checked,
    language: $("language").value
  });
  window.close();
};

$("reset").onclick = async () => {
  await chrome.storage.sync.set({ __gmgn_cmd: { type: "reset", t: Date.now() } });
  window.close();
};

load();