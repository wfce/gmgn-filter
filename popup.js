const DEFAULTS = {
  enabled: true,
  windowMinutes: 120,
  matchMode: "either",
  showMode: "all",
  onlyWithinWindow: true,
  language: "auto"
};

const i18nUI = {
  en: {
    pageTitle: "GMGN Same-Name First Launch Filter",
    enableLabel: "Enable",
    languageLabel: "Language",
    langAuto: "Auto",
    langEn: "English",
    langZh: "中文",
    timeWindowLabel: "Time Window (min)",
    timeWindowHint: "Compare tokens within this time range",
    matchModeLabel: "Filter Mode",
    matchSymbol: "Symbol only",
    matchEither: "Symbol or Name",
    matchName: "Name only",
    matchBoth: "Both Symbol & Name",
    showModeLabel: "Display Mode",
    showAll: "Show all (mark First/Not First)",
    showOnlyFirst: "Show First only (In development)",
    showOnlyDup: "Show Not First only (In development)",
    hideNonSameNameFirst: "Hide non-duplicate groups (In development)",
    onlyWithinWindowLabel: "Compare only within time window",
    save: "Save",
    reset: "Reset",
    saved: "✓ Saved",
    resetDone: "✓ Reset complete"
  },
  zh: {
    pageTitle: "GMGN 同名首发过滤器",
    enableLabel: "启用",
    languageLabel: "语言",
    langAuto: "自动",
    langEn: "English",
    langZh: "中文",
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
  
  // 禁用/启用所有输入控件
  const inputs = container.querySelectorAll("input, select");
  inputs.forEach(input => {
    input.disabled = !enabled;
  });
}

async function loadSettings() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  
  document.getElementById("enabled").checked = data.enabled !== false;
  document.getElementById("language").value = data.language || "auto";
  document.getElementById("windowMinutes").value = data.windowMinutes || 120;
  document.getElementById("matchMode").value = data.matchMode || "either";
  document.getElementById("showMode").value = data.showMode || "all";
  document.getElementById("onlyWithinWindow").checked = data.onlyWithinWindow !== false;
  
  // 设置当前语言
  if (data.language === "auto") {
    currentLang = detectLanguage();
  } else {
    currentLang = data.language || "en";
  }
  
  updateUILanguage();
  updateSettingsState(data.enabled !== false);
}

async function saveSettings() {
  const settings = {
    enabled: document.getElementById("enabled").checked,
    language: document.getElementById("language").value,
    windowMinutes: parseInt(document.getElementById("windowMinutes").value, 10) || 120,
    matchMode: document.getElementById("matchMode").value,
    showMode: document.getElementById("showMode").value,
    onlyWithinWindow: document.getElementById("onlyWithinWindow").checked
  };
  
  await chrome.storage.sync.set(settings);
  
  // 更新语言
  if (settings.language === "auto") {
    currentLang = detectLanguage();
  } else {
    currentLang = settings.language;
  }
  updateUILanguage();
  
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
  
  // 启用开关立即生效
  document.getElementById("enabled").addEventListener("change", async (e) => {
    updateSettingsState(e.target.checked);
    await saveSettings();
  });
  
  // 语言切换立即更新UI
  document.getElementById("language").addEventListener("change", (e) => {
    if (e.target.value === "auto") {
      currentLang = detectLanguage();
    } else {
      currentLang = e.target.value;
    }
    updateUILanguage();
  });
});