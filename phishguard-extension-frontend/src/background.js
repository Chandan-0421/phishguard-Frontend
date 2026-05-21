// ============================================
// PhishGuard AI - Extension Background
// Only scans when user navigates/searches
// Skips trusted domains automatically
// ============================================

const BACKEND_URL = "https://phishguard-backend-wkaw.onrender.com";

// ---- Trusted domains — in pages ko scan nahi karna ----
const SKIP_DOMAINS = [
  "google.com", "google.co.in", "google.co.uk", "googleapis.com",
  "youtube.com", "youtu.be",
  "microsoft.com", "live.com", "outlook.com", "office.com",
  "apple.com", "icloud.com",
  "facebook.com", "instagram.com", "whatsapp.com",
  "twitter.com", "x.com",
  "linkedin.com",
  "amazon.com", "amazon.in",
  "wikipedia.org",
  "github.com", "stackoverflow.com",
  "netflix.com",
  "onrender.com",
  "newtab", "chrome.google.com"
];

function shouldSkip(url) {
  try {
    if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://") ||
        url.startsWith("about:") || url.startsWith("edge://") || url === "about:blank") return true;

    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return SKIP_DOMAINS.some(d => hostname === d || hostname.endsWith("." + d));
  } catch { return true; }
}

// ---- Badge updater ----
function updateBadge(tabId, verdict) {
  const config = {
    safe:       { text: "✓",   color: "#22c55e" },
    suspicious: { text: "!",   color: "#f59e0b" },
    phishing:   { text: "✕",   color: "#ef4444" },
    unknown:    { text: "?",   color: "#6b7280" },
    scanning:   { text: "...", color: "#3b82f6" },
    skipped:    { text: "",    color: "#1e293b" }
  };
  const { text, color } = config[verdict] || config.unknown;
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color });
}

// ---- Cache helpers (5 min) ----
async function getCachedResult(url) {
  const cache = await new Promise(resolve =>
    chrome.storage.local.get(["analysisCache"], r => resolve(r.analysisCache || {}))
  );
  const entry = cache[url];
  if (entry && (Date.now() - entry.timestamp) < 5 * 60 * 1000) return entry.result;
  return null;
}

async function cacheResult(url, result) {
  const cache = await new Promise(resolve =>
    chrome.storage.local.get(["analysisCache"], r => resolve(r.analysisCache || {}))
  );
  cache[url] = { result, timestamp: Date.now() };
  const keys = Object.keys(cache);
  if (keys.length > 100) delete cache[keys[0]];
  chrome.storage.local.set({ analysisCache: cache });
}

// ---- Get page data ----
async function getPageData(tabId) {
  try {
    const [response] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        title: document.title || "",
        bodyText: document.body ? document.body.innerText.substring(0, 800) : "",
        hasPasswordField: !!document.querySelector('input[type="password"]'),
        hasHiddenElements: document.querySelectorAll('input[type="hidden"]').length > 5,
        externalLinksCount: [...document.querySelectorAll("a[href]")]
          .filter(a => {
            try { return new URL(a.href).hostname !== window.location.hostname; }
            catch { return false; }
          }).length
      })
    });
    return response?.result || {};
  } catch (e) {
    return { title: "", bodyText: "", hasPasswordField: false, externalLinksCount: 0 };
  }
}

// ---- Main analysis ----
async function analyzeTab(tabId, url) {
  // Skip trusted/system pages
  if (shouldSkip(url)) {
    updateBadge(tabId, "skipped");
    chrome.storage.local.set({
      [`tab_${tabId}`]: {
        verdict: "safe",
        explanation: "Trusted website — scan skipped.",
        confidence: 100,
        risk_level: "low",
        warning_points: [],
        recommendation: "This is a well-known trusted website.",
        model: "Skipped",
        url,
        analyzedAt: new Date().toLocaleTimeString(),
        skipped: true
      }
    });
    return;
  }

  updateBadge(tabId, "scanning");

  // Cache check
  const cached = await getCachedResult(url);
  if (cached) {
    updateBadge(tabId, cached.verdict);
    chrome.storage.local.set({ [`tab_${tabId}`]: cached });
    return;
  }

  const pageData = await getPageData(tabId);

  try {
    const response = await fetch(`${BACKEND_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, pageData })
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const json = await response.json();
    const result = json.data;
    result.analyzedAt = new Date().toLocaleTimeString();

    await cacheResult(url, result);
    chrome.storage.local.set({ [`tab_${tabId}`]: result });
    updateBadge(tabId, result.verdict);

    if (result.verdict === "phishing" || result.verdict === "suspicious") {
      try {
        chrome.tabs.sendMessage(tabId, { type: "SHOW_WARNING", data: result });
      } catch (e) {}
    }

  } catch (err) {
    console.error("PhishGuard backend error:", err.message);
    const errorResult = {
      verdict: "unknown",
      explanation: "Could not reach analysis server.",
      confidence: 0,
      risk_level: "unknown",
      warning_points: ["Server unreachable"],
      recommendation: "Proceed with caution.",
      url,
      analyzedAt: new Date().toLocaleTimeString(),
      model: "Offline"
    };
    chrome.storage.local.set({ [`tab_${tabId}`]: errorResult });
    updateBadge(tabId, "unknown");
  }
}

// ---- Only trigger on real navigation (not every tab switch) ----
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Sirf jab page fully load ho aur URL change hua ho
  if (changeInfo.status === "complete" && tab.url && changeInfo.url !== undefined) {
    analyzeTab(tabId, tab.url);
  }
});

// Jab user manually koi naya URL type kare ya search kare
chrome.webNavigation?.onCommitted?.addListener((details) => {
  if (details.frameId === 0 &&
      (details.transitionType === "typed" ||
       details.transitionType === "generated" ||
       details.transitionType === "link")) {
    analyzeTab(details.tabId, details.url);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_RESULT") {
    chrome.storage.local.get([`tab_${msg.tabId}`], r => sendResponse(r[`tab_${msg.tabId}`] || null));
    return true;
  }
  if (msg.type === "RESCAN") {
    chrome.tabs.get(msg.tabId, (tab) => {
      if (tab?.url) {
        chrome.storage.local.get(["analysisCache"], r => {
          const cache = r.analysisCache || {};
          delete cache[tab.url];
          chrome.storage.local.set({ analysisCache: cache }, () => analyzeTab(msg.tabId, tab.url));
        });
      }
    });
    sendResponse({ ok: true });
    return true;
  }
});
