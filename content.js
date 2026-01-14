const DEFAULTS = {
  windowMinutes: 120,
  matchMode: "either",
  showMode: "all",
  onlyWithinWindow: true,
  language: "auto" // auto, en, zh
};

// 多语言文本
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

// key -> { firstAddr, firstAgeMs, firstChain }
let firstIndex = new Map();
let dupKeys = new Set();
let processedCache = new Map();
let hiddenSlots = new Map();

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

function extractTokenFromRow(rowEl) {
  const href = rowEl.getAttribute("href") || "";
  const parsed = parseTokenHref(href);
  if (!parsed) return null;

  const ageText = extractAge(rowEl);
  const ageMs = parseAgeToMs(ageText);
  const { symbol, name } = extractSymbolAndName(rowEl);

  return {
    chain: parsed.chain,
    address: parsed.address,
    symbol,
    name,
    ageMs
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

/** 直接跳转到首发 token 页面 */
function gotoFirstToken(chain, address) {
  const url = `https://gmgn.ai/${chain}/token/${address}`;
  window.open(url, "_blank");
}

/**
 * 创建标记容器
 * - container pointer-events:none，不影响行点击
 * - button pointer-events:auto，按钮可点
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
        // 关键：不触发行点击
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

function updateMarker(rowEl, isFirst, keys) {
  let container = rowEl.querySelector(".gmgn-marker-container");
  const currentType = container?.getAttribute("data-type");
  const currentLangAttr = container?.getAttribute("data-lang");
  const newType = isFirst ? "first" : "dup";

  if (container && currentType === newType && currentLangAttr === currentLang) return;

  if (container) container.remove();

  container = createMarkerContainer(isFirst, keys);
  container.setAttribute("data-type", newType);
  container.setAttribute("data-lang", currentLang);

  const computedStyle = window.getComputedStyle(rowEl);
  if (computedStyle.position === "static") rowEl.style.position = "relative";

  rowEl.appendChild(container);
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
  if (innerContainer && visibleTop > 0) innerContainer.style.height = `${visibleTop}px`;
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

function processSlot(slot, body) {
  const rowEl = slot.querySelector('div[href^="/"][href*="/token/"]');
  if (!rowEl) return { processed: false };

  const token = extractTokenFromRow(rowEl);
  if (!token) {
    removeMarker(rowEl);
    slot.classList.remove("gmgn-slot-hidden");
    return { processed: false };
  }

  const addrKey = `${token.chain}:${token.address}`;
  const keys = buildKeys(token);

  if (!keys.length) {
    removeMarker(rowEl);
    slot.classList.remove("gmgn-slot-hidden");
    return { processed: false };
  }

  const canCompare = token.ageMs != null && (!cfg.onlyWithinWindow || inWindowByAge(token.ageMs));
  let isFirst = true;

  if (canCompare) {
    for (const k of keys) {
      const rec = firstIndex.get(k);

      if (rec && rec.firstAddr !== addrKey) dupKeys.add(k);

      if (!rec || token.ageMs > rec.firstAgeMs) {
        firstIndex.set(k, {
          firstAddr: addrKey,
          firstAgeMs: token.ageMs,
          firstChain: token.chain
        });
      }
    }

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
    slot.classList.add("gmgn-slot-hidden");
    removeMarker(rowEl);
    return { processed: true, hidden: true };
  }

  slot.classList.remove("gmgn-slot-hidden");

  const cached = processedCache.get(addrKey);
  if (cached && cached.isFirst === isFirst && cached.rowEl === rowEl && cached.lang === currentLang) {
    return { processed: true, hidden: false };
  }

  processedCache.set(addrKey, { isFirst, rowEl, timestamp: Date.now(), lang: currentLang });

  updateMarker(rowEl, isFirst, keys);
  return { processed: true, hidden: false };
}

function scanBody(body) {
  const scrollTop = body.scrollTop || 0;
  const viewH = body.clientHeight || 0;
  const PAD = 800;

  const slots = body.querySelectorAll("div[data-index]");
  let needsRelayout = false;

  for (const slot of slots) {
    const originalTop = parseFloat(slot.getAttribute("data-original-top") || slot.style.top || "0");

    if (!slot.hasAttribute("data-original-top")) {
      slot.setAttribute("data-original-top", slot.style.top || "0");
    }

    const h = 144;
    const bottom = originalTop + h;

    if (bottom < scrollTop - PAD * 2) continue;
    if (originalTop > scrollTop + viewH + PAD * 2) continue;

    const result = processSlot(slot, body);
    if (result.hidden) needsRelayout = true;
  }

  if (needsRelayout || cfg.showMode !== "all") relayoutBody(body);
}

function scanAllColumns() {
  document.querySelectorAll(".g-table-body").forEach((body) => scanBody(body));
}

function resetAll() {
  firstIndex = new Map();
  dupKeys = new Set();
  processedCache = new Map();
  hiddenSlots = new Map();

  document.querySelectorAll(".gmgn-marker-container").forEach((el) => el.remove());

  document.querySelectorAll(".gmgn-slot-hidden").forEach((slot) => {
    slot.classList.remove("gmgn-slot-hidden");
    const originalTop = slot.getAttribute("data-original-top");
    if (originalTop) slot.style.top = originalTop;
    slot.style.height = "144px";
    slot.style.visibility = "";
    slot.style.pointerEvents = "";
  });

  document.querySelectorAll("[data-original-top]").forEach((el) => el.removeAttribute("data-original-top"));
}

async function loadCfg() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  cfg = { ...DEFAULTS, ...data };
  currentLang = getCurrentLang();
}

/* ===================== 扫描调度器 ===================== */
let scanScheduled = false;
let lastScanTime = 0;
const MIN_INTERVAL = 150;

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

let scrollTimer = null;
function onScroll(e) {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => scheduleScan(), 50);
}

function initObserver() {
  const bodies = document.querySelectorAll(".g-table-body");
  if (!bodies.length) return setTimeout(initObserver, 300);

  const mo = new MutationObserver((mutations) => {
    let hasRelevantChange = false;

    for (const mutation of mutations) {
      if (mutation.target.closest?.(".gmgn-marker-container")) continue;
      if (mutation.target.classList?.contains("gmgn-marker-container")) continue;

      if (mutation.type === "childList") {
        let isOurElement = false;
        for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
          if (node.nodeType === 1 && node.classList?.contains("gmgn-marker-container")) {
            isOurElement = true;
            break;
          }
        }
        if (!isOurElement) {
          hasRelevantChange = true;
          break;
        }
      }
    }

    if (hasRelevantChange) scheduleScan();
  });

  bodies.forEach((b) => {
    mo.observe(b, { childList: true, subtree: true });
    b.addEventListener("scroll", onScroll, { passive: true });
  });

  window.addEventListener("resize", scheduleScan, { passive: true });

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