const DEFAULTS = {
  windowMinutes: 120,
  matchMode: "either",
  showMode: "all",
  onlyWithinWindow: true,
  language: "auto"
};

const i18n = {
  en: {
    firstLaunch: "First",
    notFirst: "Not First",
    gotoFirst: "Open First"
  },
  zh: {
    firstLaunch: "首发",
    notFirst: "非首发",
    gotoFirst: "打开首发"
  }
};

let cfg = { ...DEFAULTS };
let currentLang = "en";

// key -> { firstAddr, firstAgeMs, firstSlotIndex, firstChain }
let firstIndex = new Map();
let dupKeys = new Set();
// 改进的缓存结构：addrKey -> { isFirst, markerType, lang, firstInfo }
let processedCache = new Map();
let hiddenSlots = new Map();

// 防抖/节流控制
let isProcessing = false;
let pendingScan = false;

function detectLanguage() {
  const browserLang = navigator.language || navigator.userLanguage || "en";
  if (browserLang.toLowerCase().startsWith("zh")) return "zh";
  return "en";
}

function getCurrentLang() {
  if (cfg.language === "auto") return detectLanguage();
  return cfg.language;
}

function t(key) {
  const lang = currentLang;
  return i18n[lang]?.[key] || i18n.en[key] || key;
}

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fa5 ]+/g, "");
}

function parseAgeToMs(t) {
  const s = (t || "").trim().toLowerCase();
  const m = s.match(/^(\d+)\s*([smhd])$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  const map = { s: 1000, m: 60e3, h: 3600e3, d: 86400e3 };
  return n * map[unit];
}

function parseTokenHref(href) {
  const m = (href || "").match(/^\/([^/]+)\/token\/([^/?#]+)/);
  if (!m) return null;
  return { chain: m[1], address: m[2] };
}

function buildKeys({ symbol, name }) {
  const S = normalize(symbol);
  const N = normalize(name);

  if (cfg.matchMode === "symbol") return S ? ["S:" + S] : [];
  if (cfg.matchMode === "name") return N ? ["N:" + N] : [];
  if (cfg.matchMode === "both") return (S && N) ? ["SN:" + S + "|" + N] : [];

  const keys = [];
  if (S) keys.push("S:" + S);
  if (N) keys.push("N:" + N);
  return keys;
}

function extractSymbolAndName(rowEl) {
  const symbolEl = rowEl.querySelector("span.whitespace-nowrap.font-medium");
  const symbol = (symbolEl?.textContent || "").trim();

  let name = "";
  const nameEl = rowEl.querySelector("div.text-text-300.font-medium");
  if (nameEl) name = (nameEl.textContent || "").trim();

  return { symbol, name };
}

function extractAge(rowEl) {
  const ageEl = rowEl.querySelector(
    '.text-green-50, .text-green-100, [class*="text-green-50"], [class*="text-green-100"]'
  );
  if (ageEl) {
    const text = (ageEl.textContent || "").trim();
    if (/^\d+\s*[smhd]$/i.test(text)) return text;
  }

  const candidates = rowEl.querySelectorAll("div, span, p");
  for (const el of candidates) {
    const txt = (el.textContent || "").trim();
    if (/^\d+\s*[smhd]$/i.test(txt)) return txt;
  }
  return null;
}

function extractTokenFromRow(rowEl, slot) {
  const href = rowEl.getAttribute("href") || "";
  const parsed = parseTokenHref(href);
  if (!parsed) return null;

  const ageText = extractAge(rowEl);
  const ageMs = parseAgeToMs(ageText);
  const { symbol, name } = extractSymbolAndName(rowEl);
  const slotIndex = parseInt(slot?.getAttribute("data-index") || "0", 10);

  return {
    chain: parsed.chain,
    address: parsed.address,
    symbol,
    name,
    ageMs,
    slotIndex
  };
}

function inWindowByAge(ageMs) {
  if (ageMs == null) return false;
  return ageMs <= cfg.windowMinutes * 60e3;
}

function getFirstTokenInfo(keys) {
  for (const k of keys) {
    const rec = firstIndex.get(k);
    if (rec) {
      return {
        chain: rec.firstChain,
        address: rec.firstAddr.split(":")[1]
      };
    }
  }
  return null;
}

function gotoFirstToken(chain, address) {
  const url = `https://gmgn.ai/${chain}/token/${address}`;
  window.open(url, "_blank");
}

function isEarlierThan(tokenAgeMs, tokenSlotIndex, recAgeMs, recSlotIndex) {
  if (tokenAgeMs > recAgeMs) return true;
  if (tokenAgeMs < recAgeMs) return false;
  return tokenSlotIndex > recSlotIndex;
}

/**
 * 创建或更新标记 - 优化版本，减少 DOM 操作
 */
function createMarkerContainer(isFirst, keys) {
  const container = document.createElement("div");
  container.className = "gmgn-marker-container";
  container.setAttribute("data-gmgn-marker", "true");

  const overlay = document.createElement("div");
  overlay.className = isFirst ? "gmgn-overlay gmgn-overlay-first" : "gmgn-overlay gmgn-overlay-dup";
  container.appendChild(overlay);

  const tag = document.createElement("div");
  tag.className = isFirst ? "gmgn-tag gmgn-tag-first" : "gmgn-tag gmgn-tag-dup";
  tag.textContent = isFirst ? t("firstLaunch") : t("notFirst");
  container.appendChild(tag);

  if (isFirst) {
    const sideBar = document.createElement("div");
    sideBar.className = "gmgn-side-bar";
    container.appendChild(sideBar);
  } else {
    const firstInfo = getFirstTokenInfo(keys);
    if (firstInfo) {
      const gotoBtn = document.createElement("button");
      gotoBtn.className = "gmgn-goto-first-btn";
      gotoBtn.type = "button";
      gotoBtn.textContent = t("gotoFirst");
      gotoBtn.setAttribute("data-first-chain", firstInfo.chain);
      gotoBtn.setAttribute("data-first-address", firstInfo.address);

      gotoBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const chain = gotoBtn.getAttribute("data-first-chain");
        const address = gotoBtn.getAttribute("data-first-address");
        gotoFirstToken(chain, address);
      });

      container.appendChild(gotoBtn);
    }
  }

  return container;
}

/**
 * 智能更新标记 - 只在必要时操作 DOM
 */
function updateMarker(rowEl, isFirst, keys, addrKey) {
  const container = rowEl.querySelector(".gmgn-marker-container");
  const newType = isFirst ? "first" : "dup";
  const firstInfo = isFirst ? null : getFirstTokenInfo(keys);
  const firstInfoKey = firstInfo ? `${firstInfo.chain}:${firstInfo.address}` : "";
  
  // 检查缓存，判断是否需要更新
  const cached = processedCache.get(addrKey);
  if (cached && 
      cached.markerType === newType && 
      cached.lang === currentLang &&
      cached.firstInfoKey === firstInfoKey &&
      container) {
    // 状态完全相同，无需更新
    return false;
  }

  // 需要更新
  if (container) {
    container.remove();
  }

  const newContainer = createMarkerContainer(isFirst, keys);
  newContainer.setAttribute("data-type", newType);
  newContainer.setAttribute("data-lang", currentLang);

  const computedStyle = window.getComputedStyle(rowEl);
  if (computedStyle.position === "static") {
    rowEl.style.position = "relative";
  }

  rowEl.appendChild(newContainer);

  // 更新缓存
  processedCache.set(addrKey, {
    isFirst,
    markerType: newType,
    lang: currentLang,
    firstInfoKey,
    timestamp: Date.now()
  });

  return true;
}

function removeMarker(rowEl) {
  const container = rowEl.querySelector(".gmgn-marker-container");
  if (container) container.remove();
}

function relayoutBody(body) {
  const slots = Array.from(body.querySelectorAll("div[data-index]"));
  if (!slots.length) return;

  const slotHeight = 124;
  let visibleTop = 0;

  slots.sort((a, b) => {
    const ai = parseInt(a.getAttribute("data-index") || "0", 10);
    const bi = parseInt(b.getAttribute("data-index") || "0", 10);
    return ai - bi;
  });

  for (const slot of slots) {
    const isHidden = slot.classList.contains("gmgn-slot-hidden");

    if (isHidden) {
      slot.style.top = "-9999px";
      slot.style.height = "0px";
      slot.style.visibility = "hidden";
      slot.style.pointerEvents = "none";
    } else {
      slot.style.top = `${visibleTop}px`;
      slot.style.height = `${slotHeight}px`;
      slot.style.visibility = "";
      slot.style.pointerEvents = "";
      slot.classList.remove("gmgn-slot-hidden");
      visibleTop += slotHeight;
    }
  }

  const innerContainer = body.querySelector('div[style*="height"]');
  if (innerContainer && visibleTop > 0) {
    innerContainer.style.height = `${visibleTop}px`;
  }
}

function shouldHideSlot(isFirst, keys) {
  const inDupGroup = keys.some((k) => dupKeys.has(k));

  switch (cfg.showMode) {
    case "all":
      return false;
    case "onlyFirst":
      return !isFirst;
    case "onlyDup":
      return isFirst;
    case "hideNonSameNameFirst":
      return !inDupGroup;
    default:
      return false;
  }
}

/**
 * 第一遍：收集所有 token 信息并建立首发索引
 */
function collectTokens(body) {
  const slots = body.querySelectorAll("div[data-index]");
  const tokens = [];

  for (const slot of slots) {
    const rowEl = slot.querySelector('div[href^="/"][href*="/token/"]');
    if (!rowEl) continue;

    const token = extractTokenFromRow(rowEl, slot);
    if (!token) continue;

    const addrKey = `${token.chain}:${token.address}`;
    const keys = buildKeys(token);
    if (!keys.length) continue;

    const canCompare = token.ageMs != null && (!cfg.onlyWithinWindow || inWindowByAge(token.ageMs));

    tokens.push({
      slot,
      rowEl,
      token,
      addrKey,
      keys,
      canCompare
    });
  }

  return tokens;
}

/**
 * 建立首发索引
 */
function buildFirstIndex(tokens) {
  // 清空当前索引
  firstIndex.clear();
  dupKeys.clear();

  for (const { token, addrKey, keys, canCompare } of tokens) {
    if (!canCompare) continue;

    for (const k of keys) {
      const rec = firstIndex.get(k);

      if (rec && rec.firstAddr !== addrKey) {
        dupKeys.add(k);
      }

      if (!rec || isEarlierThan(token.ageMs, token.slotIndex, rec.firstAgeMs, rec.firstSlotIndex)) {
        firstIndex.set(k, {
          firstAddr: addrKey,
          firstAgeMs: token.ageMs,
          firstSlotIndex: token.slotIndex,
          firstChain: token.chain
        });
      }
    }
  }
}

/**
 * 第二遍：应用标记
 */
function applyMarkers(tokens) {
  let needsRelayout = false;

  for (const { slot, rowEl, addrKey, keys, canCompare } of tokens) {
    let isFirst = true;

    if (canCompare) {
      for (const k of keys) {
        const rec = firstIndex.get(k);
        if (rec && rec.firstAddr !== addrKey) {
          isFirst = false;
          break;
        }
      }
    }

    const shouldHide = shouldHideSlot(isFirst, keys);
    
    if (shouldHide) {
      if (!slot.classList.contains("gmgn-slot-hidden")) {
        slot.classList.add("gmgn-slot-hidden");
        needsRelayout = true;
      }
      removeMarker(rowEl);
    } else {
      if (slot.classList.contains("gmgn-slot-hidden")) {
        slot.classList.remove("gmgn-slot-hidden");
        needsRelayout = true;
      }
      updateMarker(rowEl, isFirst, keys, addrKey);
    }
  }

  return needsRelayout;
}

/**
 * 优化后的扫描逻辑 - 两遍扫描避免闪烁
 */
function scanBody(body) {
  // 第一遍：收集所有 token
  const tokens = collectTokens(body);
  
  // 建立首发索引
  buildFirstIndex(tokens);
  
  // 第二遍：应用标记
  const needsRelayout = applyMarkers(tokens);

  if (needsRelayout || cfg.showMode !== "all") {
    relayoutBody(body);
  }
}

function scanAllColumns() {
  if (isProcessing) {
    pendingScan = true;
    return;
  }

  isProcessing = true;

  // 使用 requestAnimationFrame 确保在渲染帧内完成
  requestAnimationFrame(() => {
    try {
      document.querySelectorAll(".g-table-body").forEach((body) => scanBody(body));
    } finally {
      isProcessing = false;
      
      // 如果有待处理的扫描请求，延迟执行
      if (pendingScan) {
        pendingScan = false;
        setTimeout(scheduleScan, 100);
      }
    }
  });
}

function resetAll() {
  firstIndex.clear();
  dupKeys.clear();
  processedCache.clear();
  hiddenSlots.clear();

  document.querySelectorAll(".gmgn-marker-container").forEach((el) => el.remove());

  document.querySelectorAll(".gmgn-slot-hidden").forEach((slot) => {
    slot.classList.remove("gmgn-slot-hidden");
    const originalTop = slot.getAttribute("data-original-top");
    if (originalTop) slot.style.top = originalTop;
    slot.style.height = "144px";
    slot.style.visibility = "";
    slot.style.pointerEvents = "";
  });

  document.querySelectorAll("[data-original-top]").forEach((el) => {
    el.removeAttribute("data-original-top");
  });
}

async function loadCfg() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  cfg = { ...DEFAULTS, ...data };
  currentLang = getCurrentLang();
}

/* ===================== 扫描调度器 - 优化版 ===================== */
let scanScheduled = false;
let lastScanTime = 0;
const MIN_INTERVAL = 200; // 增加最小间隔，减少扫描频率

function scheduleScan() {
  if (scanScheduled) return;

  const now = Date.now();
  const elapsed = now - lastScanTime;

  if (elapsed >= MIN_INTERVAL) {
    scanScheduled = true;
    requestAnimationFrame(() => {
      lastScanTime = Date.now();
      scanScheduled = false;
      scanAllColumns();
    });
  } else {
    scanScheduled = true;
    setTimeout(() => {
      requestAnimationFrame(() => {
        lastScanTime = Date.now();
        scanScheduled = false;
        scanAllColumns();
      });
    }, MIN_INTERVAL - elapsed);
  }
}

// 滚动防抖 - 增加延迟
let scrollTimer = null;
function onScroll(e) {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => scheduleScan(), 100);
}

// MutationObserver 防抖
let mutationTimer = null;
function onMutation() {
  clearTimeout(mutationTimer);
  mutationTimer = setTimeout(() => scheduleScan(), 150);
}

function initObserver() {
  const bodies = document.querySelectorAll(".g-table-body");
  if (!bodies.length) return setTimeout(initObserver, 300);

  const mo = new MutationObserver((mutations) => {
    let hasRelevantChange = false;

    for (const mutation of mutations) {
      // 跳过我们自己的标记元素
      if (mutation.target.closest?.(".gmgn-marker-container")) continue;
      if (mutation.target.classList?.contains("gmgn-marker-container")) continue;

      if (mutation.type === "childList") {
        let isOurElement = false;
        for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
          if (node.nodeType === 1) {
            if (node.classList?.contains("gmgn-marker-container") ||
                node.querySelector?.(".gmgn-marker-container")) {
              isOurElement = true;
              break;
            }
          }
        }
        if (!isOurElement) {
          hasRelevantChange = true;
          break;
        }
      }
    }

    if (hasRelevantChange) {
      onMutation();
    }
  });

  bodies.forEach((b) => {
    mo.observe(b, { childList: true, subtree: true });
    b.addEventListener("scroll", onScroll, { passive: true });
  });

  window.addEventListener("resize", () => scheduleScan(), { passive: true });

  // 初始扫描
  setTimeout(scanAllColumns, 100);
}

(async function init() {
  await loadCfg();
  initObserver();

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "sync") return;

    if (changes.__gmgn_cmd?.newValue?.type === "reset") {
      await loadCfg();
      resetAll();
      setTimeout(scanAllColumns, 100);
      return;
    }

    await loadCfg();
    resetAll();
    setTimeout(scanAllColumns, 100);
  });

  setInterval(scheduleScan, 1000);
})();