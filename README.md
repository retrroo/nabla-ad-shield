# 🛡️ NABLA — Pure Web Ad & Consent Shield

<p align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="Nabla Shield Logo" />
</p>

<p align="center">
  <strong>Where browsing becomes pure.</strong><br>
  A high-performance, deterministic Manifest V3 Chromium extension for stealth video ad mitigation, zero-overhead network filtering, automatic cookie consent evasion, and on-device heuristic ad detection.
</p>

<p align="center">
  <a href="https://github.com/retrroo/nabla-ad-shield/releases/latest/download/nabla-ad-shield.zip">
    <img src="https://img.shields.io/badge/%E2%AC%87%EF%B8%8F_DOWNLOAD-Nabla_Ad_Shield_(Latest_ZIP)-FFFFFF?style=for-the-badge&logoColor=000000&labelColor=050505" alt="Download Nabla Shield" />
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3_Compliant-FFFFFF?style=flat-square&logo=googlechrome&logoColor=FFFFFF&labelColor=0A0A0A" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/License-100%25_Free-FFFFFF?style=flat-square&labelColor=0A0A0A" alt="100% Free" />
  <img src="https://img.shields.io/badge/Telemetry-Zero_Cloud_Calls-FFFFFF?style=flat-square&labelColor=0A0A0A" alt="Zero Telemetry" />
  <img src="https://img.shields.io/badge/YouTube-Stealth_Mitigation-FFFFFF?style=flat-square&logo=youtube&logoColor=FFFFFF&labelColor=0A0A0A" alt="YouTube Shield" />
</p>

---

## ⚡ 15-Second Quick Install Guide

You do not need to compile or build anything. You can install Nabla into Google Chrome, Brave, Edge, or any Chromium browser in 4 simple steps:

### [👉 Click Here to Download `nabla-ad-shield.zip`](https://github.com/retrroo/nabla-ad-shield/releases/latest/download/nabla-ad-shield.zip)

1. **Download & Extract**:
   * Click the download button above to get `nabla-ad-shield.zip`.
   * Unzip / extract the downloaded zip file into a folder on your computer (for example: `Downloads\nabla-ad-shield`).

2. **Open Extensions Page in Chrome**:
   * In Google Chrome, type or paste this into your address bar and press Enter:
     ```text
     chrome://extensions
     ```

3. **Enable Developer Mode**:
   * In the top-right corner of the Extensions page, toggle the switch that says **Developer mode** to **ON**.

4. **Load Unpacked**:
   * Click the **"Load unpacked"** button in the top-left toolbar.
   * Select the unzipped folder containing `manifest.json`.
   * **Done!** The monochrome Onboarding screen will launch. Check the policy box, click **"Initialize Protection"**, and enjoy pure, uninterrupted browsing.

---

## 🔍 What is Nabla & What Does It Do?

Most traditional ad blockers break modern website layouts (leaving huge empty black holes in feeds), trigger aggressive anti-adblock detection warnings (such as YouTube's video player strikes), or inject heavy JavaScript libraries that slow down your computer and drain battery life.

**Nabla** was engineered from the ground up as a lean, zero-overhead protocol with a **4-Layer Defense Architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│                      NABLA ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────┤
│ Layer 1: Declarative Net Request (DNR)                      │
│   ↳ Kernel-level network blocking (Zero runtime CPU overhead)│
├─────────────────────────────────────────────────────────────┤
│ Layer 2: Zero-Latency Cosmetic & Cookie Auto-Reject Engine  │
│   ↳ 0ms CSS injection & automated CMP banner dismissal       │
├─────────────────────────────────────────────────────────────┤
│ Layer 3: Stealth YouTube Mitigation & Grid Reflow           │
│   ↳ Anti-detection canary + player JSON sanitizer + 16x skip │
├─────────────────────────────────────────────────────────────┤
│ Layer 4: On-Device Heuristic Classifier                     │
│   ↳ IAB dimension & URL entropy analysis (Zero cloud APIs)  │
└─────────────────────────────────────────────────────────────┘
```

### 1. Stealth YouTube Ad Mitigation & Feed Reflow
* **Bypasses Anti-Adblock Bans**: Runs a lightweight main-world sanitizer that satisfies YouTube's anti-adblock canary checks (`window.google_ad_status = 1`).
* **Surgically Strips Player Ad Metadata**: Neutralizes `adPlacements` and `playerAds` directly in YouTube's internal API payloads before the video player starts playback.
* **16x Speedup & Auto-Skip Fallback**: If an ad stream attempts to load, it is instantly muted and accelerated to `16x` speed while programmatic clicks trigger skip buttons on the exact frame they appear.
* **No Black Gaps in Your Feed**: In-feed ad slots are collapsed alongside their parent containers (`ytd-rich-item-renderer`), and video rows are automatically backfilled so your homepage video grid remains seamless without empty black squares.

### 2. Zero-Latency Cosmetic & Cookie Consent Filter
* **0ms Optimistic CSS Injection**: Hides known ad containers at the exact moment the page starts loading (`document_start`), completely eliminating layout shifts (FOUC) and saving your CPU from rendering broken ad banners.
* **Automated Cookie Consent Dismissal**: Automatically detects GDPR/CCPA consent modals (OneTrust, Cookiebot, Quantcast, TrustArc, Didomi, Usercentrics) and programmatically clicks **"Reject All"** / **"Necessary Only"**, unlocks locked page scrollbars, and removes modal backdrops.

### 3. High-Velocity On-Device Heuristic AI
* **Zero Cloud APIs & Zero Tracking**: Runs an on-device heuristic classifier in pure vanilla JavaScript.
* **Pattern Recognition**: Scores dynamically injected iframes and sticky banners using standard IAB ad dimensions (e.g. `300x250`, `728x90`, `160x600`), promotional keyword tokens, and external URL query entropy.
* **Structural Safety Guardrails**: Navigation menus, article bodies, and legitimate site components are protected so content never gets removed accidentally.

### 4. Automatic Website Whitelist Manager
* **Auto-Disable on Whitelisted Sites**: Need to disable blocking on your online banking, university portal, or favorite creator site? Add the site to your Whitelist, and Nabla will automatically turn off network rules, cosmetic filters, and video scripts whenever you visit that domain or any of its subdomains (e.g. `nytimes.com` automatically covers `cooking.nytimes.com`).
* **Visual Status**: Shows a dedicated `WL` badge on the extension icon and a `WHITELISTED` pill in the popup.

### 5. Built-in Real-Time Diagnostic Console
* **Full Telemetry & Audit Stream**: Click **"Open Console ↗"** from the extension popup to view a live, real-time log of every network request blocked, ad element collapsed, YouTube mitigation executed, and cookie banner dismissed.
* **One-Click Export**: Click **"Copy Log (JSON)"** to copy your complete diagnostic trace for instant troubleshooting.

### 6. Dual Theme Architecture: Deep Space Dark & Pure White Mode
* **Instant One-Click Switcher**: Seamlessly switch between the signature **Deep Space Black** (`#050505`) and the new **Pure White Mode** (`#F5F5F7` / `#FFFFFF`) across the Popup controller, Diagnostics Console, and Onboarding screens with a single click.
* **Persistent & Synchronized**: Theme preferences persist in local storage and synchronize in real-time across all active extension views.
* **Dynamic Constellation Particles**: HTML5 canvas particles dynamically adapt their luminescence, dot radii, and connecting lines to match light and dark modes flawlessly.

---

## 🎨 Design System ("Nabla" Monochrome Theme)

Nabla features a custom high-contrast minimalist interface:
* **Palette**: Deep Space Black (`#050505`), Pure White (`#FFFFFF`), and Muted Zinc (`#888888`) with subtle glass borders (`rgba(255, 255, 255, 0.12)`).
* **Constellation Canvas**: A background HTML5 `<canvas>` rendering a slow-moving geometric particle constellation that automatically sleeps when hidden (`0%` background GPU/CPU usage).
* **Typography**: Geometric sans-serif controls paired with editorial serif accents.

---

## 📂 Project Structure

```
nabla-ad-shield/
├── manifest.json              # Chromium MV3 Manifest with declarativeNetRequest
├── background.js              # Service Worker (In-memory cache, dynamic whitelist rules, telemetry)
├── popup.html                 # Extension controller popup
├── popup.css                  # Monochrome design system styles
├── popup.js                   # Whitelist manager, master switch, telemetry counters
├── onboarding.html            # First-run privacy consent & initialization screen
├── onboarding.css             # Onboarding styles
├── onboarding.js              # Activation logic
├── debugger.html              # Real-time diagnostic console
├── debugger.css               # Console layout and filtering styles
├── debugger.js                # Live streaming log viewer & JSON exporter
├── shared/
│   ├── logger.js              # Structured diagnostic log format
│   └── particle_canvas.js     # Optimized constellation particle canvas
├── scripts/
│   ├── state_client.js        # ~1ms shared storage state & batched telemetry
│   ├── cosmetic.js            # Non-breaking cosmetic stylesheet & cookie rejector
│   ├── heuristic_ai.js        # On-device heuristic scoring classifier
│   ├── youtube_main_world.js  # Main-world anti-adblock canary & player payload sanitizer
│   └── youtube_shield.js      # Video stream muting/fast-forwarding & grid row backfilling
├── rules/
│   ├── ads_ruleset.json       # 50 high-impact network blocking rules
│   └── cookies_ruleset.json   # CMP tracking engine blocking rules
└── icons/                     # 16px, 32px, 48px, 128px high-DPI brand icons
```

---

## 🔒 Privacy & Security

* **100% Local Execution**: All rule matching, heuristic classification, and whitelist checks run directly inside your browser.
* **Zero Remote Telemetry**: Nabla contains zero tracking scripts, zero external analytics, and zero third-party remote calls.
* **No Account Required**: Free forever with no subscriptions, accounts, or API keys needed.

---

## 🛠️ For Developers: Contributing & Local Development

```bash
# Clone the repository
git clone https://github.com/retrroo/nabla-ad-shield.git
cd nabla-ad-shield

# Test JSON & JavaScript syntax
node -e "JSON.parse(require('fs').readFileSync('manifest.json'))"
node --check background.js popup.js scripts/youtube_shield.js
```

To reload code changes in Chrome:
1. Make any edits to the source code.
2. Go to `chrome://extensions`.
3. Click the **Reload (↻)** icon on the Nabla card.

---

<p align="center">
  Developed with precision for a fast, clean, and distraction-free web.
</p>
