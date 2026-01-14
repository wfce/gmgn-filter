// content.js - 解决批量闪烁问题

const DEFAULTS = {
  enabled: true,
  windowMinutes: 120,
  matchMode: "symbol",
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

// ========== 双缓冲索引系统 ==========
// 稳定索引 - 只用于渲染，不会被清空
let renderIndex = new Map();
let renderDupKeys = new Set();

// 构建索引 - 用于计算，计算完成后才替换 renderIndex
let buildIndex = new Map();
let buildDupKeys = new Set();

// ========== 状态锁定系统 ==========
// 已确认状态的元素 - 短时间内不会改变
// addrKey -> { isFirst, confirmedAt, keys }
let confirmedStates = new Map();
const STATE_LOCK_DURATION = 2000; // 状态锁定 2 秒

// 元素 DOM 缓存
let elementStateCache = new WeakMap();
let knownAddresses = new Set();

// 处理控制
let isProcessing = false;
let pendingScan = false;
let scanGeneration = 0;

function detectLanguage() {
  const browserLang = navigator.language || navigator.userLanguage || "en";
  return browserLang.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function getCurrentLang() {
  return cfg.language === "auto" ? detectLanguage() : cfg.language;
}

function t(key) {
  return i18n[currentLang]?.[key] || i18n.en[key] || key;
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
  let symbol = "";
  let name = "";

  const symbolEl = rowEl.querySelector("span.whitespace-nowrap.font-medium") ||
                   rowEl.querySelector('span.font-medium[class*="text-[16px]"]') ||
                   rowEl.querySelector('[class*="text-[16px]"][class*="font-medium"]');
  if (symbolEl) {
    symbol = (symbolEl.textContent || "").trim();
  }

  const nameEl = rowEl.querySelector("div.text-text-300.font-medium");
  if (nameEl) {
    name = (nameEl.textContent || "").trim();
  }

  if (!name) {
    const nameCandidates = rowEl.querySelectorAll('div[class*="text-text-300"]');
    for (const el of nameCandidates) {
      const text = (el.textContent || "").trim();
      if (text && text.length > 1 && text !== symbol && !/^[\d.%]+$/.test(text)) {
        name = text;
        break;
      }
    }
  }

  return { symbol, name };
}

function extractAge(rowEl) {
  const selectors = ['.text-green-50', '.text-green-100', '[class*="text-green-50"]', '[class*="text-green-100"]'];
  
  for (const selector of selectors) {
    const el = rowEl.querySelector(selector);
    if (el) {
      const text = (el.textContent || "").trim();
      if (/^\d+\s*[smhd]$/i.test(text)) return text;
    }
  }

  const all = rowEl.querySelectorAll("div, span, p");
  for (const el of all) {
    const txt = (el.textContent || "").trim();
    if (/^\d+\s*[smhd]$/i.test(txt)) return txt;
  }

  return null;
}

function getRowElement(slot) {
  let rowEl = slot.querySelector('div[href*="/token/"]');
  
  if (!rowEl) {
    rowEl = slot.querySelector('div[class*="cursor-pointer"][class*="group/a"]');
    if (rowEl) {
      const linkEl = rowEl.querySelector('a[href*="/token/"]');
      if (linkEl) {
        rowEl.setAttribute('data-token-href', linkEl.getAttribute('href'));
      }
    }
  }

  return rowEl;
}

function extractTokenFromRow(rowEl, slot) {
  let href = rowEl.getAttribute("href") || rowEl.getAttribute("data-token-href") || "";
  
  if (!href) {
    const linkEl = rowEl.querySelector('a[href*="/token/"]');
    if (linkEl) href = linkEl.getAttribute("href") || "";
  }

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
  return ageMs != null && ageMs <= cfg.windowMinutes * 60e3;
}

function getFirstTokenInfo(keys) {
  for (const k of keys) {
    const rec = renderIndex.get(k);
    if (rec) {
      return { chain: rec.firstChain, address: rec.firstAddr.split(":")[1] };
    }
  }
  return null;
}

function gotoFirstToken(chain, address) {
  window.open(`https://gmgn.ai/${chain}/token/${address}`, "_blank");
}

function isEarlierThan(tokenAgeMs, tokenSlotIndex, recAgeMs, recSlotIndex) {
  if (tokenAgeMs > recAgeMs) return true;
  if (tokenAgeMs < recAgeMs) return false;
  return tokenSlotIndex > recSlotIndex;
}

// ========== 标记管理 ==========

function createMarkerContainer(isFirst, keys) {
  const container = document.createElement("div");
  container.className = "gmgn-marker-container";
  container.setAttribute("data-gmgn-marker", "true");
  container.setAttribute("data-marker-type", isFirst ? "first" : "dup");

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
        gotoFirstToken(
          gotoBtn.getAttribute("data-first-chain"),
          gotoBtn.getAttribute("data-first-address")
        );
      });
      container.appendChild(gotoBtn);
    }
  }

  return container;
}

function updateMarker(rowEl, isFirst, keys, addrKey) {
  const cached = elementStateCache.get(rowEl);
  const newType = isFirst ? "first" : "dup";
  const firstInfo = isFirst ? null : getFirstTokenInfo(keys);
  const firstInfoKey = firstInfo ? `${firstInfo.chain}:${firstInfo.address}` : "";
  
  // 完全相同则跳过
  if (cached && 
      cached.type === newType && 
      cached.lang === currentLang &&
      cached.firstInfoKey === firstInfoKey) {
    return false;
  }

  const existing = rowEl.querySelector(".gmgn-marker-container");
  if (existing) existing.remove();

  const container = createMarkerContainer(isFirst, keys);

  if (window.getComputedStyle(rowEl).position === "static") {
    rowEl.style.position = "relative";
  }

  rowEl.appendChild(container);

  elementStateCache.set(rowEl, {
    type: newType,
    lang: currentLang,
    firstInfoKey,
    addrKey
  });

  return true;
}

function removeMarker(rowEl) {
  const container = rowEl.querySelector(".gmgn-marker-container");
  if (container) {
    container.remove();
    elementStateCache.delete(rowEl);
  }
}

// ========== 状态锁定管理 ==========

function isStateLocked(addrKey) {
  const state = confirmedStates.get(addrKey);
  if (!state) return false;
  return (Date.now() - state.confirmedAt) < STATE_LOCK_DURATION;
}

function getLockedState(addrKey) {
  const state = confirmedStates.get(addrKey);
  if (!state) return null;
  if ((Date.now() - state.confirmedAt) >= STATE_LOCK_DURATION) {
    return null; // 已过期
  }
  return state;
}

function lockState(addrKey, isFirst, keys) {
  confirmedStates.set(addrKey, {
    isFirst,
    confirmedAt: Date.now(),
    keys: [...keys]
  });
}

function cleanExpiredStates() {
  const now = Date.now();
  for (const [key, state] of confirmedStates) {
    if (now - state.confirmedAt >= STATE_LOCK_DURATION * 2) {
      confirmedStates.delete(key);
    }
  }
}

// ========== 索引构建 ==========

function collectTokens(body) {
  const slots = body.querySelectorAll("div[data-index]");
  const tokens = [];

  for (const slot of slots) {
    const rowEl = getRowElement(slot);
    if (!rowEl) continue;

    const token = extractTokenFromRow(rowEl, slot);
    if (!token) continue;

    const addrKey = `${token.chain}:${token.address}`;
    const keys = buildKeys(token);
    if (!keys.length) continue;

    const canCompare = token.ageMs != null && (!cfg.onlyWithinWindow || inWindowByAge(token.ageMs));
    const isNew = !knownAddresses.has(addrKey);

    tokens.push({ slot, rowEl, token, addrKey, keys, canCompare, isNew });
  }

  return tokens;
}

/**
 * 在 buildIndex 中计算首发状态（不影响 renderIndex）
 */
function computeFirstIndex(tokens) {
  buildIndex.clear();
  buildDupKeys.clear();

  for (const { token, addrKey, keys, canCompare } of tokens) {
    if (!canCompare) continue;

    for (const k of keys) {
      const rec = buildIndex.get(k);

      if (rec && rec.firstAddr !== addrKey) {
        buildDupKeys.add(k);
      }

      if (!rec || isEarlierThan(token.ageMs, token.slotIndex, rec.firstAgeMs, rec.firstSlotIndex)) {
        buildIndex.set(k, {
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
 * 判断 token 在指定索引中是否为首发
 */
function isTokenFirstInIndex(addrKey, keys, index) {
  for (const k of keys) {
    const rec = index.get(k);
    if (rec && rec.firstAddr !== addrKey) {
      return false;
    }
  }
  return true;
}

/**
 * 验证新计算的状态与锁定状态是否一致
 */
function validateStateChange(addrKey, keys, newIsFirst) {
  const locked = getLockedState(addrKey);
  if (!locked) return true; // 无锁定，允许任何状态
  
  // 如果新状态与锁定状态相同，允许
  if (locked.isFirst === newIsFirst) return true;
  
  // 状态变化，但仍在锁定期内 - 需要验证
  // 只有当新数据明确推翻旧状态时才允许变化
  // 例如：发现了更早创建的同名代币
  
  // 对于 "首发 -> 非首发" 的变化：需要确认确实有更早的代币
  if (locked.isFirst && !newIsFirst) {
    for (const k of keys) {
      const rec = buildIndex.get(k);
      if (rec && rec.firstAddr !== addrKey) {
        // 确认有不同地址的记录，允许变化
        return true;
      }
    }
    // 没有充分证据，拒绝变化
    return false;
  }
  
  // 对于 "非首发 -> 首发" 的变化：比较少见，可能是旧首发消失
  // 这种变化相对安全，允许
  return true;
}

/**
 * 应用标记 - 带状态锁定保护
 */
function applyMarkersWithLock(tokens) {
  let needsRelayout = false;
  const newKnownAddresses = new Set();
  const stateChanges = []; // 收集需要变更的状态

  // 第一遍：计算新状态，收集变更
  for (const { slot, rowEl, addrKey, keys, canCompare, isNew } of tokens) {
    newKnownAddresses.add(addrKey);

    let isFirst = true;
    if (canCompare) {
      isFirst = isTokenFirstInIndex(addrKey, keys, buildIndex);
    }

    // 新元素：直接使用计算状态
    if (isNew) {
      stateChanges.push({ slot, rowEl, addrKey, keys, isFirst, isNew: true });
      continue;
    }

    // 已有元素：检查状态锁定
    const locked = getLockedState(addrKey);
    
    if (locked) {
      // 有锁定状态
      if (locked.isFirst === isFirst) {
        // 状态一致，延续锁定
        stateChanges.push({ slot, rowEl, addrKey, keys, isFirst, isNew: false });
      } else {
        // 状态不一致，验证变化是否合理
        if (validateStateChange(addrKey, keys, isFirst)) {
          stateChanges.push({ slot, rowEl, addrKey, keys, isFirst, isNew: false });
        } else {
          // 拒绝变化，使用锁定状态
          stateChanges.push({ slot, rowEl, addrKey, keys: locked.keys, isFirst: locked.isFirst, isNew: false });
        }
      }
    } else {
      // 无锁定，使用计算状态
      stateChanges.push({ slot, rowEl, addrKey, keys, isFirst, isNew: false });
    }
  }

  // 第二遍：批量应用变更
  for (const { slot, rowEl, addrKey, keys, isFirst, isNew } of stateChanges) {
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

    // 锁定状态
    lockState(addrKey, isFirst, keys);
  }

  knownAddresses = newKnownAddresses;
  return needsRelayout;
}

function shouldHideSlot(isFirst, keys) {
  const inDupGroup = keys.some((k) => renderDupKeys.has(k));

  switch (cfg.showMode) {
    case "all": return false;
    case "onlyFirst": return !isFirst;
    case "onlyDup": return isFirst;
    case "hideNonSameNameFirst": return !inDupGroup;
    default: return false;
  }
}

function relayoutBody(body) {
  const slots = Array.from(body.querySelectorAll("div[data-index]"));
  if (!slots.length) return;

  const slotHeight = 144;
  let visibleTop = 0;

  slots.sort((a, b) => {
    const ai = parseInt(a.getAttribute("data-index") || "0", 10);
    const bi = parseInt(b.getAttribute("data-index") || "0", 10);
    return ai - bi;
  });

  for (const slot of slots) {
    if (slot.classList.contains("gmgn-slot-hidden")) {
      slot.style.cssText = "top: -9999px; height: 0; visibility: hidden; pointer-events: none;";
    } else {
      slot.style.cssText = `top: ${visibleTop}px; height: ${slotHeight}px;`;
      visibleTop += slotHeight;
    }
  }

  const inner = body.querySelector('div[style*="height"]');
  if (inner && visibleTop > 0) {
    inner.style.height = `${visibleTop}px`;
  }
}

// ========== 扫描流程 ==========

function scanBody(body, generation) {
  if (generation !== scanGeneration) return;

  // 1. 收集所有 token
  const tokens = collectTokens(body);
  
  // 2. 在 buildIndex 中计算首发状态
  computeFirstIndex(tokens);
  
  // 3. 应用标记（带锁定保护）
  const needsRelayout = applyMarkersWithLock(tokens);
  
  // 4. 提交：将 buildIndex 复制到 renderIndex
  renderIndex = new Map(buildIndex);
  renderDupKeys = new Set(buildDupKeys);

  if (needsRelayout || cfg.showMode !== "all") {
    relayoutBody(body);
  }
}

function scanAllColumns() {
  if (!cfg.enabled) return;
  
  if (isProcessing) {
    pendingScan = true;
    return;
  }

  isProcessing = true;
  scanGeneration++;
  const gen = scanGeneration;

  requestAnimationFrame(() => {
    try {
      document.querySelectorAll(".g-table-body").forEach((body) => scanBody(body, gen));
      
      // 定期清理过期状态
      if (Math.random() < 0.1) {
        cleanExpiredStates();
      }
    } finally {
      isProcessing = false;
      
      if (pendingScan) {
        pendingScan = false;
        setTimeout(scheduleScan, 80);
      }
    }
  });
}

function resetAll() {
  renderIndex.clear();
  renderDupKeys.clear();
  buildIndex.clear();
  buildDupKeys.clear();
  confirmedStates.clear();
  knownAddresses.clear();
  elementStateCache = new WeakMap();

  document.querySelectorAll(".gmgn-marker-container").forEach((el) => el.remove());
  document.querySelectorAll(".gmgn-slot-hidden").forEach((slot) => {
    slot.classList.remove("gmgn-slot-hidden");
    slot.style.cssText = "height: 144px;";
  });
}

async function loadCfg() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  cfg = { ...DEFAULTS, ...data };
  currentLang = getCurrentLang();
}

// ========== 调度器 ==========

let scanScheduled = false;
let lastScanTime = 0;
const MIN_INTERVAL = 80;

function scheduleScan() {
  if (!cfg.enabled || scanScheduled) return;

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

let scrollTimer = null;
function onScroll() {
  if (!cfg.enabled) return;
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(scheduleScan, 60);
}

let mutationTimer = null;
let mutationBatch = 0;

function onMutation() {
  if (!cfg.enabled) return;
  
  mutationBatch++;
  clearTimeout(mutationTimer);
  
  // 批量变更时稍微延迟
  const delay = mutationBatch > 3 ? 120 : 40;
  mutationTimer = setTimeout(() => {
    mutationBatch = 0;
    scheduleScan();
  }, delay);
}

function initObserver() {
  const bodies = document.querySelectorAll(".g-table-body");
  if (!bodies.length) return setTimeout(initObserver, 300);

  const mo = new MutationObserver((mutations) => {
    if (!cfg.enabled) return;
    
    for (const m of mutations) {
      if (m.target.closest?.(".gmgn-marker-container")) continue;
      if (m.target.classList?.contains("gmgn-marker-container")) continue;

      if (m.type === "childList") {
        let isOurs = false;
        for (const node of [...m.addedNodes, ...m.removedNodes]) {
          if (node.nodeType === 1 && 
              (node.classList?.contains("gmgn-marker-container") ||
               node.querySelector?.(".gmgn-marker-container"))) {
            isOurs = true;
            break;
          }
        }
        if (!isOurs) {
          onMutation();
          return;
        }
      }
    }
  });

  bodies.forEach((b) => {
    mo.observe(b, { childList: true, subtree: true });
    b.addEventListener("scroll", onScroll, { passive: true });
  });

  window.addEventListener("resize", () => cfg.enabled && scheduleScan(), { passive: true });

  if (cfg.enabled) scanAllColumns();
}

(async function init() {
  await loadCfg();
  initObserver();

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "sync") return;

    const wasEnabled = cfg.enabled;
    
    if (changes.__gmgn_cmd?.newValue?.type === "reset") {
      await loadCfg();
      resetAll();
      if (cfg.enabled) scanAllColumns();
      return;
    }

    await loadCfg();
    
    if (wasEnabled && !cfg.enabled) {
      resetAll();
      return;
    }
    
    if (cfg.enabled) {
      resetAll();
      scanAllColumns();
    }
  });

  setInterval(() => cfg.enabled && scheduleScan(), 800);
})();