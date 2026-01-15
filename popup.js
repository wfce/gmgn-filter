const DEFAULTS = {
  enabled: true,
  windowMinutes: 120,
  matchMode: "symbol",
  showMode: "all",
  onlyWithinWindow: true,
  language: "auto",
  // Auto Buy Settings
  autoBuyEnabled: false,
  autoBuyTimeWindow: 10,
  autoBuyMinDuplicates: 2,
  // Stats
  stats: {
    autoBuys: 0,
    detections: 0,
    todayBuys: 0,
    lastResetDate: null
  }
};

const i18nUI = {
  en: {
    pageTitle: "GMGN Sniper",
    enableLabel: "Enable",
    languageLabel: "Language",
    langAuto: "Auto",
    langEn: "English",
    langZh: "中文",
    
    // Auto Buy
    autoBuyTitle: "Auto Snipe Settings",
    autoBuyEnabledLabel: "Enable Auto Snipe",
    autoBuyTimeWindowLabel: "Time Window (sec)",
    autoBuyMinDuplicatesLabel: "Min Duplicates",
    autoBuyHint: "Auto buy first token when X duplicates appear within Y seconds",
    autoBuyColumnHint: "※ Only monitors the first column (New Created)",
    autoBuyWarning: "⚠️ Warning: Auto buy will use GMGN's internal buy button. Make sure you have set the buy amount in GMGN settings first!",
    
    // Filter
    filterTitle: "Filter Settings",
    timeWindowLabel: "Time Window (min)",
    timeWindowHint: "Compare tokens within this time range",
    matchModeLabel: "Filter Mode",
    matchSymbol: "Symbol only",
    matchEither: "Symbol or Name",
    matchName: "Name only",
    matchBoth: "Both Symbol & Name",
    showModeLabel: "Display Mode",
    showAll: "Show all (mark only)",
    showOnlyFirst: "First only (In development)",
    showOnlyDup: "Not First only (In development)",
    hideNonSameNameFirst: "Duplicates only (In development)",
    onlyWithinWindowLabel: "Compare only within time window",
    
    // Stats
    statAutoBuysLabel: "Auto Buys",
    statDetectionsLabel: "Detections",
    statTodayLabel: "Today",
    
    save: "Save",
    reset: "Reset",
    saved: "✓ Saved",
    resetDone: "✓ Reset complete"
  },
  zh: {
    pageTitle: "GMGN 狙击器",
    enableLabel: "启用",
    languageLabel: "语言",
    langAuto: "自动",
    langEn: "English",
    langZh: "中文",
    
    // Auto Buy
    autoBuyTitle: "自动狙击设置",
    autoBuyEnabledLabel: "启用自动狙击",
    autoBuyTimeWindowLabel: "时间窗口（秒）",
    autoBuyMinDuplicatesLabel: "最少重复数",
    autoBuyHint: "当Y秒内出现X个同名代币时，自动购买首发",
    autoBuyColumnHint: "※ 仅监控第一列（新创建）",
    autoBuyWarning: "⚠️ 警告：自动购买将使用GMGN内置的购买按钮。请确保您已在GMGN设置中设置好购买金额！",
    
    // Filter
    filterTitle: "过滤设置",
    timeWindowLabel: "时间窗口（分钟）",
    timeWindowHint: "仅比较该时间范围内的代币",
    matchModeLabel: "过滤模式",
    matchSymbol: "仅 Symbol 相同",
    matchEither: "Symbol 或 Name 任一相同",
    matchName: "仅 Name 相同",
    matchBoth: "Symbol 和 Name 都相同",
    showModeLabel: "显示模式",
    showAll: "显示全部（仅标记）",
    showOnlyFirst: "仅显示首发（开发中）",
    showOnlyDup: "仅显示非首发（开发中）",
    hideNonSameNameFirst: "仅显示重复组（开发中）",
    onlyWithinWindowLabel: "仅在时间窗口内比较",
    
    // Stats
    statAutoBuysLabel: "自动购买",
    statDetectionsLabel: "检测次数",
    statTodayLabel: "今日",
    
    save: "保存",
    reset: "重置",
    saved: "✓ 已保存",
    resetDone: "✓ 重置完成"
  }
};

let currentLang = "en";

function detectLanguage() {
  const browserLang = navigator.language || navigator.userLanguage || "en";
  return browserLang.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function t(key) {
  return i18nUI[currentLang]?.[key] || i18nUI.en[key] || key;
}

function updateUILanguage() {
  document.getElementById("pageTitle").textContent = t("pageTitle");
  document.getElementById("enableLabel").textContent = t("enableLabel");
  document.getElementById("languageLabel").textContent = t("languageLabel");
  document.getElementById("langAuto").textContent = t("langAuto");
  
  // Auto Buy
  document.getElementById("autoBuyTitle").textContent = t("autoBuyTitle");
  document.getElementById("autoBuyEnabledLabel").textContent = t("autoBuyEnabledLabel");
  document.getElementById("autoBuyTimeWindowLabel").textContent = t("autoBuyTimeWindowLabel");
  document.getElementById("autoBuyMinDuplicatesLabel").textContent = t("autoBuyMinDuplicatesLabel");
  document.getElementById("autoBuyHint").textContent = t("autoBuyHint");
  document.getElementById("autoBuyColumnHint").textContent = t("autoBuyColumnHint");
  document.getElementById("autoBuyWarning").textContent = t("autoBuyWarning");
  
  // Filter
  document.getElementById("filterTitle").textContent = t("filterTitle");
  document.getElementById("timeWindowLabel").textContent = t("timeWindowLabel");
  document.getElementById("timeWindowHint").textContent = t("timeWindowHint");
  document.getElementById("matchModeLabel").textContent = t("matchModeLabel");
  document.getElementById("matchSymbol").textContent = t("matchSymbol");
  document.getElementById("matchEither").textContent = t("matchEither");
  document.getElementById("matchName").textContent = t("matchName");
  document.getElementById("matchBoth").textContent = t("matchBoth");
  document.getElementById("showModeLabel").textContent = t("showModeLabel");
  document.getElementById("showAll").textContent = t("showAll");
  document.getElementById("showOnlyFirst").textContent = t("showOnlyFirst");
  document.getElementById("showOnlyDup").textContent = t("showOnlyDup");
  document.getElementById("hideNonSameNameFirst").textContent = t("hideNonSameNameFirst");
  document.getElementById("onlyWithinWindowLabel").textContent = t("onlyWithinWindowLabel");
  
  // Stats
  document.getElementById("statAutoBuysLabel").textContent = t("statAutoBuysLabel");
  document.getElementById("statDetectionsLabel").textContent = t("statDetectionsLabel");
  document.getElementById("statTodayLabel").textContent = t("statTodayLabel");
  
  document.getElementById("save").textContent = t("save");
  document.getElementById("reset").textContent = t("reset");
}

function updateSettingsState(enabled) {
  const container = document.getElementById("settingsContainer");
  if (enabled) {
    container.classList.remove("disabled-overlay");
  } else {
    container.classList.add("disabled-overlay");
  }
  
  const inputs = container.querySelectorAll("input, select");
  inputs.forEach(input => {
    input.disabled = !enabled;
  });
}

function updateAutoBuySectionStyle(enabled) {
  const section = document.getElementById("autoBuySection");
  if (enabled) {
    section.classList.add("active");
  } else {
    section.classList.remove("active");
  }
}

function updateStats(stats) {
  const today = new Date().toDateString();
  if (stats.lastResetDate !== today) {
    stats.todayBuys = 0;
    stats.lastResetDate = today;
  }
  
  document.getElementById("statAutoBuys").textContent = stats.autoBuys || 0;
  document.getElementById("statDetections").textContent = stats.detections || 0;
  document.getElementById("statToday").textContent = stats.todayBuys || 0;
}

async function loadSettings() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  
  document.getElementById("enabled").checked = data.enabled !== false;
  document.getElementById("language").value = data.language || "auto";
  document.getElementById("windowMinutes").value = data.windowMinutes || 120;
  document.getElementById("matchMode").value = data.matchMode || "symbol";
  document.getElementById("showMode").value = data.showMode || "all";
  document.getElementById("onlyWithinWindow").checked = data.onlyWithinWindow !== false;
  
  // Auto Buy Settings
  document.getElementById("autoBuyEnabled").checked = data.autoBuyEnabled || false;
  document.getElementById("autoBuyTimeWindow").value = data.autoBuyTimeWindow || 10;
  document.getElementById("autoBuyMinDuplicates").value = data.autoBuyMinDuplicates || 2;
  
  // Stats
  const stats = data.stats || DEFAULTS.stats;
  updateStats(stats);
  
  // Set current language
  if (data.language === "auto") {
    currentLang = detectLanguage();
  } else {
    currentLang = data.language || "en";
  }
  
  updateUILanguage();
  updateSettingsState(data.enabled !== false);
  updateAutoBuySectionStyle(data.autoBuyEnabled || false);
}

async function saveSettings() {
  const currentData = await chrome.storage.sync.get(DEFAULTS);
  
  const settings = {
    enabled: document.getElementById("enabled").checked,
    language: document.getElementById("language").value,
    windowMinutes: parseInt(document.getElementById("windowMinutes").value, 10) || 120,
    matchMode: document.getElementById("matchMode").value,
    showMode: document.getElementById("showMode").value,
    onlyWithinWindow: document.getElementById("onlyWithinWindow").checked,
    // Auto Buy
    autoBuyEnabled: document.getElementById("autoBuyEnabled").checked,
    autoBuyTimeWindow: parseInt(document.getElementById("autoBuyTimeWindow").value, 10) || 10,
    autoBuyMinDuplicates: parseInt(document.getElementById("autoBuyMinDuplicates").value, 10) || 2,
    // Preserve stats
    stats: currentData.stats || DEFAULTS.stats
  };
  
  await chrome.storage.sync.set(settings);
  
  // Update language
  if (settings.language === "auto") {
    currentLang = detectLanguage();
  } else {
    currentLang = settings.language;
  }
  updateUILanguage();
  updateAutoBuySectionStyle(settings.autoBuyEnabled);
  
  showStatus(t("saved"));
}

async function resetData() {
  await chrome.storage.sync.set({
    ...DEFAULTS,
    __gmgn_cmd: { type: "reset", ts: Date.now() }
  });
  await loadSettings();
  showStatus(t("resetDone"));
}

function showStatus(msg) {
  const status = document.getElementById("status");
  status.textContent = msg;
  setTimeout(() => {
    status.textContent = "";
  }, 2000);
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  
  document.getElementById("save").addEventListener("click", saveSettings);
  document.getElementById("reset").addEventListener("click", resetData);
  
  // Enable switch
  document.getElementById("enabled").addEventListener("change", async (e) => {
    updateSettingsState(e.target.checked);
    await saveSettings();
  });
  
  // Auto Buy Enable switch
  document.getElementById("autoBuyEnabled").addEventListener("change", (e) => {
    updateAutoBuySectionStyle(e.target.checked);
  });
  
  // Language switch
  document.getElementById("language").addEventListener("change", (e) => {
    if (e.target.value === "auto") {
      currentLang = detectLanguage();
    } else {
      currentLang = e.target.value;
    }
    updateUILanguage();
  });
  
  // Listen for stats updates
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.stats) {
      updateStats(changes.stats.newValue || DEFAULTS.stats);
    }
  });
});