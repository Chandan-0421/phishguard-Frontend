// PhishGuard AI - Popup Logic (No API key needed!)

const VERDICT_CONFIG = {
  safe:       { emoji: "✅", label: "Safe",       title: "This Page is Safe",            cls: "safe" },
  suspicious: { emoji: "⚠️", label: "Suspicious", title: "Suspicious Page Detected",     cls: "suspicious" },
  phishing:   { emoji: "🚨", label: "Phishing",   title: "Phishing Website Detected!",   cls: "phishing" },
  unknown:    { emoji: "❓", label: "Unknown",    title: "Analysis Incomplete",           cls: "unknown" }
};

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadResult(tabId) {
  return new Promise(resolve =>
    chrome.runtime.sendMessage({ type: "GET_RESULT", tabId }, resolve)
  );
}

function renderResult(data) {
  document.getElementById("scanning-view").style.display = "none";
  document.getElementById("result-view").style.display = "block";

  const verdict = data?.verdict || "unknown";
  const cfg = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.unknown;

  // Banner
  document.getElementById("verdict-banner").className = `verdict-banner ${cfg.cls}`;
  document.getElementById("verdict-emoji").textContent = cfg.emoji;

  const chip = document.getElementById("verdict-chip");
  chip.className = `verdict-chip ${cfg.cls}`;
  chip.textContent = `● ${cfg.label}`;

  const titleEl = document.getElementById("verdict-title");
  titleEl.className = `verdict-title ${cfg.cls}`;
  titleEl.textContent = cfg.title;

  document.getElementById("verdict-explain").textContent = data?.explanation || "Analyzing...";

  // Confidence bar
  const conf = data?.confidence || 0;
  document.getElementById("conf-val").textContent = `${conf}%`;
  const fill = document.getElementById("conf-fill");
  fill.className = `conf-fill ${cfg.cls}`;
  setTimeout(() => fill.style.width = `${conf}%`, 80);

  // Warnings
  const warnings = data?.warning_points || [];
  const warnList = document.getElementById("warnings-list");
  if (warnings.length > 0) {
    warnList.innerHTML = warnings.map(w => `
      <div class="warn-item">
        <span class="warn-dot">●</span>
        <span>${w}</span>
      </div>
    `).join("");
  } else {
    warnList.innerHTML = `
      <div class="warn-item">
        <span class="warn-dot">✓</span>
        <span>No suspicious signals detected</span>
      </div>`;
  }

  // Recommendation
  if (data?.recommendation) {
    document.getElementById("rec-box").style.display = "block";
    document.getElementById("rec-text").textContent = data.recommendation;
  }

  // Meta
  document.getElementById("meta-time").textContent = `Scanned: ${data?.analyzedAt || "—"}`;
  document.getElementById("meta-model").textContent = data?.model || "Llama 3 (Groq)";
}

async function init() {
  document.getElementById("scanning-view").style.display = "block";
  document.getElementById("result-view").style.display = "none";

  const tab = await getCurrentTab();
  if (!tab) return;

  const result = await loadResult(tab.id);
  if (result) {
    renderResult(result);
  } else {
    // Poll until result arrives
    let tries = 0;
    const poll = setInterval(async () => {
      const r = await loadResult(tab.id);
      if (r || tries++ > 12) {
        clearInterval(poll);
        renderResult(r || {
          verdict: "unknown",
          explanation: "Could not analyze this page.",
          confidence: 0,
          warning_points: [],
          recommendation: "Proceed with caution."
        });
      }
    }, 1000);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await init();

  document.getElementById("rescan-btn").addEventListener("click", async () => {
    const tab = await getCurrentTab();
    if (!tab) return;
    document.getElementById("result-view").style.display = "none";
    document.getElementById("scanning-view").style.display = "block";
    chrome.runtime.sendMessage({ type: "RESCAN", tabId: tab.id });
    setTimeout(init, 3500);
  });
});
