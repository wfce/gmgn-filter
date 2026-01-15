// content.js - GMGN狙击器 (GMGN Sniper) - 自动购买首发代币

const DEFAULTS = {
  enabled: true,
  windowMinutes: 120,
  matchMode: "symbol",
  showMode: "all",
  onlyWithinWindow: true,
  language: "auto",
  autoBuyEnabled: false,
  autoBuyTimeWindow: 10,
  autoBuyMinDuplicates: 2,
  stats: {
    autoBuys: 0,
    detections: 0,
    todayBuys: 0,
    lastResetDate: null
  }
};

const i18n = {
  en: {
    firstLaunch: "First",
    notFirst: "Not First",
    gotoFirst: "Open First",
    autoBought: "Auto Bought First Token!",
    sniperActive: "Sniper Active"
  },
  zh: {
    firstLaunch: "首发",
    notFirst: "非首发",
    gotoFirst: "打开首发",
    autoBought: "已自动购买首发代币!",
    sniperActive: "狙击器已激活"
  }
};

let cfg = { ...DEFAULTS };
let currentLang = "en";

// ========== 双缓冲索引系统 ==========
let renderIndex = new Map();
let renderDupKeys = new Set();
let buildIndex = new Map();
let buildDupKeys = new Set();

// ========== 状态锁定系统 ==========
let confirmedStates = new Map();
const STATE_LOCK_DURATION = 2000;

// ========== 缓存 ==========
let elementStateCache = new WeakMap();
let knownAddresses = new Set();

// ========== 处理控制 ==========
let isProcessing = false;
let pendingScan = false;
let scanGeneration = 0;

// ========== 自动购买系统 ==========
let autoBuyTokenHistory = new Map();
let autoBuyPurchasedTokens = new Set();
let autoBuyTriggeredKeys = new Set();
let autoBuyLock = false;

// ========== 第一列专用索引 ==========
let firstColumnIndex = new Map();

// ========== 统计更新系统（防抖+批量）==========
let pendingStatsUpdate = { autoBuys: 0, detections: 0 };
let statsUpdateTimer = null;
const STATS_UPDATE_DELAY = 5000; // 5秒批量更新一次

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

function isFirstColumn(body) {
  const column = body.closest('.flex.flex-col.flex-1');
  if (column) {
    const header = column.querySelector('.px-\\[12px\\].relative');
    if (header) {
      const titleEl = header.querySelector('.flex.items-center.gap-2');
      if (titleEl) {
        const text = titleEl.textContent || "";
        if (text.includes('新创建') || text.toLowerCase().includes('new') || text.includes('Created')) {
          return true;
        }
      }
    }
  }
  
  const allBodies = document.querySelectorAll('.g-table-body');
  if (allBodies.length > 0 && allBodies[0] === body) {
    return true;
  }
  
  return false;
}

function getFirstColumnBody() {
  const allBodies = document.querySelectorAll('.g-table-body');
  if (allBodies.length > 0) {
    return allBodies[0];
  }
  return null;
}

function getFirstTokenInfo(keys) {
  for (const k of keys) {
    const rec = renderIndex.get(k);
    if (rec) {
      return { 
        chain: rec.firstChain, 
        address: rec.firstAddr.split(":")[1],
        ageMs: rec.firstAgeMs
      };
    }
  }
  
  for (const k of keys) {
    const rec = buildIndex.get(k);
    if (rec) {
      return { 
        chain: rec.firstChain, 
        address: rec.firstAddr.split(":")[1],
        ageMs: rec.firstAgeMs
      };
    }
  }
  
  return null;
}

function getFirstColumnFirstTokenInfo(keys) {
  for (const k of keys) {
    const rec = firstColumnIndex.get(k);
    if (rec) {
      return { 
        chain: rec.firstChain, 
        address: rec.firstAddr.split(":")[1],
        ageMs: rec.firstAgeMs
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

// ========== 统计更新（防抖批量写入）==========

function queueStatsUpdate(type) {
  if (type === 'autoBuy') {
    pendingStatsUpdate.autoBuys++;
  } else if (type === 'detection') {
    pendingStatsUpdate.detections++;
  }
  
  if (statsUpdateTimer) {
    clearTimeout(statsUpdateTimer);
  }
  
  statsUpdateTimer = setTimeout(flushStatsUpdate, STATS_UPDATE_DELAY);
}

async function flushStatsUpdate() {
  if (pendingStatsUpdate.autoBuys === 0 && pendingStatsUpdate.detections === 0) {
    return;
  }
  
  const toUpdate = { ...pendingStatsUpdate };
  pendingStatsUpdate = { autoBuys: 0, detections: 0 };
  
  try {
    const data = await chrome.storage.sync.get({ stats: DEFAULTS.stats });
    const stats = data.stats || { ...DEFAULTS.stats };
    
    const today = new Date().toDateString();
    if (stats.lastResetDate !== today) {
      stats.todayBuys = 0;
      stats.lastResetDate = today;
    }
    
    stats.autoBuys = (stats.autoBuys || 0) + toUpdate.autoBuys;
    stats.detections = (stats.detections || 0) + toUpdate.detections;
    stats.todayBuys = (stats.todayBuys || 0) + toUpdate.autoBuys;
    
    await chrome.storage.sync.set({ stats });
  } catch (e) {
    console.warn('[GMGN狙击器] 统计更新失败:', e.message);
    // 恢复未保存的数据
    pendingStatsUpdate.autoBuys += toUpdate.autoBuys;
    pendingStatsUpdate.detections += toUpdate.detections;
  }
}

// ========== 自动购买功能 ==========

function findFirstTokenFromHistory(history) {
  if (!history || history.length === 0) return null;
  
  let firstToken = history[0];
  for (const token of history) {
    if (token.ageMs > firstToken.ageMs) {
      firstToken = token;
    } else if (token.ageMs === firstToken.ageMs && token.slotIndex > firstToken.slotIndex) {
      firstToken = token;
    }
  }
  return firstToken;
}

function findTokenRowInFirstColumn(address) {
  const firstBody = getFirstColumnBody();
  if (!firstBody) {
    console.log('[GMGN狙击器] 未找到第一列');
    return null;
  }
  
  const slots = firstBody.querySelectorAll('div[data-index]');
  
  for (const slot of slots) {
    const rowEl = getRowElement(slot);
    if (!rowEl) continue;
    
    const href = rowEl.getAttribute("href") || rowEl.getAttribute("data-token-href") || "";
    const linkEl = rowEl.querySelector('a[href*="/token/"]');
    const linkHref = linkEl ? linkEl.getAttribute("href") : "";
    
    if ((href && href.includes(address)) || (linkHref && linkHref.includes(address))) {
      console.log('[GMGN狙击器] 找到目标代币行:', address.slice(0, 8) + '...');
      return rowEl;
    }
  }
  
  console.log('[GMGN狙击器] 目标代币不在可见区域:', address.slice(0, 8) + '...');
  return null;
}

function findAndClickBuyButton(rowEl) {
  if (!rowEl) return Promise.resolve(false);
  
  const mouseEnterEvent = new MouseEvent('mouseenter', {
    bubbles: true,
    cancelable: true,
    view: window
  });
  rowEl.dispatchEvent(mouseEnterEvent);
  
  return new Promise((resolve) => {
    setTimeout(() => {
      const buyButtonSelectors = [
        '.BuyButton-continer .QuickBuy_btnForLoading__GcvLL',
        '.BuyButton-continer div[class*="QuickBuy"]',
        'div.pointer-events-auto.BuyButton-continer div[class*="rounded-"][class*="cursor-pointer"]',
        'div[class*="BuyButton"] div[class*="cursor-pointer"]',
        'div.button-content div[class*="cursor-pointer"][class*="text-primary"]',
        'div[class*="bg-btn-secondary-buy"]',
        'div[class*="QuickBuy"]',
        'div[id="6666666"] div.BuyButton-continer div',
        'div.pointer-events-auto div[class*="rounded-"][class*="bg-"]'
      ];
      
      let buyButton = null;
      const slot = rowEl.closest('div[data-index]') || rowEl;
      
      for (const selector of buyButtonSelectors) {
        buyButton = rowEl.querySelector(selector) || slot.querySelector(selector);
        if (buyButton) break;
      }
      
      if (!buyButton) {
        const allDivs = slot.querySelectorAll('div[class*="cursor-pointer"]');
        for (const div of allDivs) {
          const text = div.textContent || "";
          if (text.includes('买入') || text.toLowerCase().includes('buy')) {
            buyButton = div;
            break;
          }
        }
      }
      
      if (buyButton) {
        console.log('[GMGN狙击器] 找到购买按钮，正在点击...');
        
        const buttonContainer = buyButton.closest('div[id="6666666"]');
        if (buttonContainer) {
          buttonContainer.style.display = 'flex';
          buttonContainer.classList.remove('hidden');
        }
        
        buyButton.click();
        
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        buyButton.dispatchEvent(clickEvent);
        
        setTimeout(() => buyButton.click(), 100);
        
        resolve(true);
      } else {
        console.log('[GMGN狙击器] 未找到购买按钮');
        resolve(false);
      }
    }, 100);
  });
}

async function findAndBuyTokenInFirstColumn(address) {
  const rowEl = findTokenRowInFirstColumn(address);
  
  if (rowEl) {
    return await findAndClickBuyButton(rowEl);
  }
  
  return false;
}

async function executeAutoBuy(firstTokenInfo, triggerKey) {
  if (autoBuyLock) {
    console.log('[GMGN狙击器] 自动购买已锁定，跳过...');
    return false;
  }
  
  const addrKey = `${firstTokenInfo.chain}:${firstTokenInfo.address}`;
  
  if (autoBuyPurchasedTokens.has(addrKey)) {
    console.log('[GMGN狙击器] 该代币已购买过:', addrKey);
    return false;
  }
  
  autoBuyLock = true;
  
  try {
    console.log('[GMGN狙击器] 执行自动购买首发代币:', firstTokenInfo.address.slice(0, 12) + '...');
    console.log('[GMGN狙击器] 代币年龄:', firstTokenInfo.ageMs, 'ms');
    
    const success = await findAndBuyTokenInFirstColumn(firstTokenInfo.address);
    
    if (success) {
      autoBuyPurchasedTokens.add(addrKey);
      
      // 使用防抖批量更新
      queueStatsUpdate('autoBuy');
      
      showAutoBuyNotification(firstTokenInfo, triggerKey);
      
      console.log('[GMGN狙击器] 自动购买首发代币成功!');
      return true;
    } else {
      console.log('[GMGN狙击器] 未能完成购买');
    }
    
    return false;
  } finally {
    setTimeout(() => {
      autoBuyLock = false;
    }, 1000);
  }
}

function showAutoBuyNotification(tokenInfo, triggerKey) {
  const notification = document.createElement('div');
  notification.className = 'gmgn-sniper-notification';
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 20px;">⚡</span>
      <div>
        <div style="font-weight: bold;">${t('autoBought')}</div>
        <div style="font-size: 12px; opacity: 0.8;">${tokenInfo.address.slice(0, 12)}...</div>
      </div>
    </div>
  `;
  
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 99999;
    background: linear-gradient(135deg, #00c853, #00e676);
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 200, 83, 0.4);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: gmgnSlideIn 0.3s ease-out;
  `;
  
  if (!document.getElementById('gmgn-sniper-styles')) {
    const style = document.createElement('style');
    style.id = 'gmgn-sniper-styles';
    style.textContent = `
      @keyframes gmgnSlideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.5s';
    setTimeout(() => notification.remove(), 500);
  }, 3000);
}

function checkAutoBuyCondition(keys, token, isInFirstColumn) {
  if (!cfg.autoBuyEnabled || !cfg.enabled) return;
  if (!isInFirstColumn) return;
  
  const now = Date.now();
  const timeWindowMs = cfg.autoBuyTimeWindow * 1000;
  
  for (const key of keys) {
    if (autoBuyTriggeredKeys.has(key)) {
      continue;
    }
    
    if (!autoBuyTokenHistory.has(key)) {
      autoBuyTokenHistory.set(key, []);
    }
    
    const history = autoBuyTokenHistory.get(key);
    
    history.push({
      timestamp: now,
      address: token.address,
      chain: token.chain,
      ageMs: token.ageMs,
      slotIndex: token.slotIndex
    });
    
    const validHistory = history.filter(h => now - h.timestamp <= timeWindowMs);
    autoBuyTokenHistory.set(key, validHistory);
    
    const uniqueAddresses = new Set(validHistory.map(h => h.address));
    
    console.log(`[GMGN狙击器] 同名组 ${key}: ${uniqueAddresses.size}/${cfg.autoBuyMinDuplicates} 个代币在 ${cfg.autoBuyTimeWindow}s 内`);
    
    if (uniqueAddresses.size >= cfg.autoBuyMinDuplicates) {
      console.log(`[GMGN狙击器] ⚡ 触发自动购买! 同名组: ${key}`);
      
      // 使用防抖批量更新
      queueStatsUpdate('detection');
      
      const firstToken = findFirstTokenFromHistory(validHistory);
      
      if (firstToken) {
        console.log(`[GMGN狙击器] 首发代币: ${firstToken.address.slice(0, 12)}..., 年龄: ${firstToken.ageMs}ms`);
        executeAutoBuy(firstToken, key);
      }
      
      autoBuyTriggeredKeys.add(key);
      autoBuyTokenHistory.delete(key);
      break;
    }
  }
}

function cleanAutoBuyHistory() {
  const now = Date.now();
  const maxAge = 300000;
  
  for (const [key, history] of autoBuyTokenHistory) {
    if (autoBuyTriggeredKeys.has(key)) {
      autoBuyTokenHistory.delete(key);
      continue;
    }
    
    const validHistory = history.filter(h => now - h.timestamp <= maxAge);
    if (validHistory.length === 0) {
      autoBuyTokenHistory.delete(key);
    } else {
      autoBuyTokenHistory.set(key, validHistory);
    }
  }
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
      
      gotoBtn.title = `${t("gotoFirst")}: ${firstInfo.chain}/${firstInfo.address.slice(0, 8)}...`;
      
      gotoBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const chain = gotoBtn.getAttribute("data-first-chain");
        const address = gotoBtn.getAttribute("data-first-address");
        
        if (chain && address) {
          gotoFirstToken(chain, address);
        }
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
    addrKey,
    timestamp: Date.now()
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

function getLockedState(addrKey) {
  const state = confirmedStates.get(addrKey);
  if (!state) return null;
  if ((Date.now() - state.confirmedAt) >= STATE_LOCK_DURATION) {
    return null;
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

function computeFirstColumnIndex(tokens) {
  firstColumnIndex.clear();

  for (const { token, addrKey, keys, canCompare } of tokens) {
    if (!canCompare) continue;

    for (const k of keys) {
      const rec = firstColumnIndex.get(k);

      if (!rec || isEarlierThan(token.ageMs, token.slotIndex, rec.firstAgeMs, rec.firstSlotIndex)) {
        firstColumnIndex.set(k, {
          firstAddr: addrKey,
          firstAgeMs: token.ageMs,
          firstSlotIndex: token.slotIndex,
          firstChain: token.chain
        });
      }
    }
  }
}

function isTokenFirstInIndex(addrKey, keys, index) {
  for (const k of keys) {
    const rec = index.get(k);
    if (rec && rec.firstAddr !== addrKey) {
      return false;
    }
  }
  return true;
}

function validateStateChange(addrKey, keys, newIsFirst) {
  const locked = getLockedState(addrKey);
  if (!locked) return true;
  
  if (locked.isFirst === newIsFirst) return true;
  
  if (locked.isFirst && !newIsFirst) {
    for (const k of keys) {
      const rec = buildIndex.get(k);
      if (rec && rec.firstAddr !== addrKey) {
        return true;
      }
    }
    return false;
  }
  
  return true;
}

function applyMarkersWithLock(tokens, isInFirstColumn) {
  let needsRelayout = false;
  const newKnownAddresses = new Set();
  const stateChanges = [];

  for (const { slot, rowEl, token, addrKey, keys, canCompare, isNew } of tokens) {
    newKnownAddresses.add(addrKey);

    let isFirst = true;
    if (canCompare) {
      isFirst = isTokenFirstInIndex(addrKey, keys, buildIndex);
    }

    if (isNew && cfg.autoBuyEnabled && isInFirstColumn) {
      checkAutoBuyCondition(keys, token, isInFirstColumn);
    }

    if (isNew) {
      stateChanges.push({ slot, rowEl, addrKey, keys, isFirst, isNew: true });
      continue;
    }

    const locked = getLockedState(addrKey);
    
    if (locked) {
      if (locked.isFirst === isFirst) {
        stateChanges.push({ slot, rowEl, addrKey, keys, isFirst, isNew: false });
      } else {
        if (validateStateChange(addrKey, keys, isFirst)) {
          stateChanges.push({ slot, rowEl, addrKey, keys, isFirst, isNew: false });
        } else {
          stateChanges.push({ slot, rowEl, addrKey, keys: locked.keys, isFirst: locked.isFirst, isNew: false });
        }
      }
    } else {
      stateChanges.push({ slot, rowEl, addrKey, keys, isFirst, isNew: false });
    }
  }

  for (const { slot, rowEl, addrKey, keys, isFirst } of stateChanges) {
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

  const isInFirstColumn = isFirstColumn(body);
  const tokens = collectTokens(body);
  
  computeFirstIndex(tokens);
  
  if (isInFirstColumn) {
    computeFirstColumnIndex(tokens);
  }
  
  const needsRelayout = applyMarkersWithLock(tokens, isInFirstColumn);
  
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
      
      if (Math.random() < 0.1) {
        cleanExpiredStates();
        cleanAutoBuyHistory();
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
  firstColumnIndex.clear();
  confirmedStates.clear();
  knownAddresses.clear();
  elementStateCache = new WeakMap();
  autoBuyTokenHistory.clear();
  autoBuyPurchasedTokens.clear();
  autoBuyTriggeredKeys.clear();

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
      if (m.target.classList?.contains("gmgn-sniper-notification")) continue;

      if (m.type === "childList") {
        let isOurs = false;
        for (const node of [...m.addedNodes, ...m.removedNodes]) {
          if (node.nodeType === 1 && 
              (node.classList?.contains("gmgn-marker-container") ||
               node.classList?.contains("gmgn-sniper-notification") ||
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

  if (cfg.enabled) {
    console.log('[GMGN狙击器] 已启动');
    if (cfg.autoBuyEnabled) {
      console.log(`[GMGN狙击器] ⚡ 自动购买已启用 - ${cfg.autoBuyTimeWindow}秒内出现${cfg.autoBuyMinDuplicates}个同名代币时自动购买首发`);
    }
  }

  if (cfg.enabled) scanAllColumns();
}

// 页面卸载时保存未完成的统计
window.addEventListener('beforeunload', () => {
  if (pendingStatsUpdate.autoBuys > 0 || pendingStatsUpdate.detections > 0) {
    // 使用 sendBeacon 尝试保存（不一定成功）
    flushStatsUpdate();
  }
});

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