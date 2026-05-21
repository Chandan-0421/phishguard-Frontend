// ============================================
// PhishGuard AI - Content Script
// Shows blocking overlay for phishing pages
// ============================================

let overlayShown = false;

function createPhishingOverlay(data) {
  if (overlayShown) return;
  overlayShown = true;

  const isPhishing = data.verdict === "phishing";
  const mainColor = isPhishing ? "#ef4444" : "#f59e0b";
  const bgColor = isPhishing ? "#fef2f2" : "#fffbeb";
  const icon = isPhishing ? "🚨" : "⚠️";
  const title = isPhishing ? "PHISHING WEBSITE DETECTED!" : "SUSPICIOUS WEBSITE WARNING";

  const overlay = document.createElement("div");
  overlay.id = "phishguard-overlay";
  overlay.style.cssText = `
    position: fixed !important;
    top: 0 !important; left: 0 !important;
    width: 100vw !important; height: 100vh !important;
    background: rgba(0,0,0,0.85) !important;
    z-index: 2147483647 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
  `;

  overlay.innerHTML = `
    <div style="
      background: ${bgColor};
      border: 3px solid ${mainColor};
      border-radius: 16px;
      padding: 40px;
      max-width: 560px;
      width: 90%;
      box-shadow: 0 25px 60px rgba(0,0,0,0.5);
      text-align: center;
      position: relative;
    ">
      <!-- Header -->
      <div style="font-size: 56px; margin-bottom: 12px;">${icon}</div>
      <div style="
        background: ${mainColor};
        color: white;
        padding: 8px 20px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 2px;
        display: inline-block;
        margin-bottom: 16px;
        text-transform: uppercase;
      ">PhishGuard AI Alert</div>

      <h2 style="
        color: ${mainColor};
        font-size: 22px;
        font-weight: 800;
        margin: 0 0 12px 0;
        line-height: 1.3;
      ">${title}</h2>

      <p style="
        color: #374151;
        font-size: 15px;
        margin: 0 0 20px 0;
        line-height: 1.6;
      ">${data.explanation}</p>

      <!-- Risk Badge -->
      <div style="
        background: ${mainColor}22;
        border: 1px solid ${mainColor}44;
        border-radius: 10px;
        padding: 14px;
        margin-bottom: 20px;
        text-align: left;
      ">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
          <span style="font-size: 13px; font-weight: 700; color: ${mainColor}; text-transform: uppercase;">Risk Level:</span>
          <span style="
            background: ${mainColor};
            color: white;
            padding: 2px 10px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
          ">${(data.risk_level || "HIGH").toUpperCase()}</span>
          <span style="font-size: 13px; color: #6b7280; margin-left: auto;">Confidence: ${data.confidence || 0}%</span>
        </div>
        ${data.warning_points && data.warning_points.length > 0 ? `
          <div style="font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px;">⚡ Detected Threats:</div>
          ${data.warning_points.slice(0, 4).map(p => `
            <div style="font-size: 12px; color: #6b7280; padding: 2px 0; padding-left: 12px;">• ${p}</div>
          `).join("")}
        ` : ""}
      </div>

      <!-- Recommendation -->
      <div style="
        background: #f3f4f6;
        border-radius: 10px;
        padding: 12px;
        font-size: 13px;
        color: #374151;
        margin-bottom: 24px;
        font-weight: 500;
      ">
        💡 ${data.recommendation}
      </div>

      <!-- Buttons -->
      <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
        <button id="phishguard-back" style="
          background: ${mainColor};
          color: white;
          border: none;
          padding: 13px 28px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          flex: 1;
          min-width: 140px;
        ">← Go Back (Safe)</button>
        ${data.verdict === "suspicious" ? `
          <button id="phishguard-proceed" style="
            background: transparent;
            color: ${mainColor};
            border: 2px solid ${mainColor};
            padding: 13px 28px;
            border-radius: 10px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            flex: 1;
            min-width: 140px;
          ">Proceed Anyway (Risk)</button>
        ` : ""}
      </div>

      <!-- URL -->
      <div style="margin-top: 16px; font-size: 11px; color: #9ca3af; word-break: break-all;">
        🔗 ${data.url ? data.url.substring(0, 80) + (data.url.length > 80 ? "..." : "") : window.location.href.substring(0, 80)}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("phishguard-back")?.addEventListener("click", () => {
    window.history.back();
    setTimeout(() => { if (overlayShown) overlay.remove(); overlayShown = false; }, 500);
  });

  document.getElementById("phishguard-proceed")?.addEventListener("click", () => {
    overlay.remove();
    overlayShown = false;
  });
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SHOW_WARNING" && msg.data) {
    // Small delay to let page render
    setTimeout(() => createPhishingOverlay(msg.data), 800);
  }
});
