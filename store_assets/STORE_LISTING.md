# Chrome Web Store — Winkelvermelding Details

Hieronder vind je de exacte gegevens om over te nemen in het Chrome Web Store Developer Dashboard:

---

## 1. Productdetails

* **Titel van pakket:**
  ```text
  Shield by Nablai
  ```

* **Samenvatting van pakket:**
  ```text
  High-performance ad blocking, stealth video mitigation, and cookie banner auto-rejection with zero remote telemetry.
  ```

* **Beschrijving\* (Plak dit in het grote tekstvak "Beschrijving"):**
  ```text
  Shield by Nablai — Where browsing becomes pure.

  A high-performance, deterministic Manifest V3 Chromium ad blocker engineered from the ground up to eliminate visual noise, bypass aggressive anti-adblock detection walls, and auto-reject GDPR cookie banners without slowing down your computer.

  Unlike traditional ad blockers that inject heavy JavaScript libraries, break page layouts, or trigger video player anti-adblock detection, Shield by Nablai operates strictly on-device with zero remote telemetry and zero cloud API calls.


  KEY PILLARS & ARCHITECTURE

  1. STEALTH VIDEO AD MITIGATION & FEED REFLOW
  • Anti-Detection Evasion: Satisfies internal anti-adblock status checks and safely evades synthetic tamper honeypots.
  • Stream Fast-Forward & Mute: Detects video ad segments instantly, cloaks ad frames, mutes audio, and seeks cleanly to the end once media metadata is ready.
  • Automatic Feed Grid Reflow: Collapses feed ad containers and dynamically backfills grid rows so your homepage never has empty black boxes or broken spacing.

  2. ZERO-LATENCY COSMETIC & COOKIE CONSENT FILTER
  • 0ms Optimistic CSS Injection: Injects lightweight cosmetic rules at document_start to collapse known ad placeholders before they can cause layout shifts (FOUC).
  • Automated CMP Consent Rejection: Automatically detects cookie consent banners and selects "Reject All" or "Necessary Only" options without user intervention.
  • Restores Scrolling: Unlocks locked body overflow and clears dark modal overlays cleanly without requiring a page reload.

  3. KERNEL-LEVEL DECLARATIVE NET FILTERING (MV3)
  • Zero Runtime CPU Overhead: Utilizes Chromium's native chrome.declarativeNetRequest API with high-impact network filtering rules targeting ad networks, tracking beacons, and analytics scripts.

  4. ON-DEVICE HEURISTIC CLASSIFIER
  • Pattern Recognition: Scores dynamic iframes and sticky ad units using standard ad container dimensions, promotional keyword tokens, and cross-origin query entropy.
  • Content Guardrails: Navigation headers, editorial articles, and essential site components are strictly protected.

  5. 1-CLICK WEBSITE WHITELIST MANAGER
  • Need to support a favorite creator or log into online banking? One-click whitelist toggle automatically pauses all network rules, cosmetic filters, and video scripts for that domain and all subdomains (e.g. example.com covers blog.example.com).

  6. DUAL MONOCHROME THEMES (DARK & WHITE MODE)
  • Seamlessly toggle between Deep Space Black (#050505) and Pure White Mode (#FFFFFF) across the Popup, Diagnostics Console, and Onboarding views.
  • Live synchronized across all open tabs and windows.

  7. BUILT-IN REAL-TIME DIAGNOSTICS CONSOLE
  • Total transparency: Open the Diagnostic Console to inspect every intercepted network request, collapsed ad container, and cookie auto-rejection happening right in your browser.
  • One-click JSON export for easy auditing.


  STRICT PRIVACY & PERMISSIONS DECLARATION

  Shield by Nablai is built on an uncompromising privacy-first foundation:
  • ZERO Remote Calls: No analytics, tracking beacons, or telemetry data are ever transmitted to any external server.
  • 100% On-Device: All settings, whitelist entries, and threat counters are stored strictly in local browser storage (chrome.storage.local).
  • Open Source & Free: Free forever without subscriptions, accounts, or paywalls.
  ```

* **Categorie\*:**
  ```text
  Productiviteit (Productivity)
  ```
  *(Alternatief: Hulpprogramma's / Tools)*

* **Taal\*:**
  ```text
  Engels (Verenigde Staten) / English (United States)
  ```
  *(Omdat de titel en samenvatting in het Engels zijn opgesteld)*

---

## 2. Afbeeldingen & Promotietegels

Alle benodigde afbeeldingen zijn exact op maat en gecodeerd als **24-bits PNG (geen alfa)** conform de strikte Chrome Web Store specificaties:

1. **Winkelicoon\* (128 x 128 pixels):**
   * Bestand: `store_assets/store_icon_128x128.png`

2. **Screenshots\* (1280 x 800 pixels):**
   * Screenshot 1: `store_assets/screenshot_1_1280x800.png` (Dual Themes & Core UI)
   * Screenshot 2: `store_assets/screenshot_2_1280x800.png` (Live Diagnostics & Audit Stream)
   * Screenshot 3: `store_assets/screenshot_3_1280x800.png` (Stealth Video & Cookie Consent Shield)

3. **Kleine promotietegel (440 x 280 pixels):**
   * Bestand: `store_assets/promo_small_440x280.png`

4. **Marquee-promotietegel (1400 x 560 pixels):**
   * Bestand: `store_assets/promo_marquee_1400x560.png`

5. **Algemene promotievideo:**
   * Leeg laten (zoals aangegeven: video hoeft niet).

---

## 3. Tabblad "Privacyprocedures" (Privacy Practices)

Kopieer en plak de onderstaande teksten exact in de bijbehorende velden op het tabblad **Privacyprocedures**:

### 1. Beschrijving voor één doel (Single Purpose Description)*
```text
Shield by Nablai is een snelle, privacygerichte adblocker die advertenties blokkeert, cookiebanners automatisch weigert en videovertraging voorkomt, zonder gebruikersgegevens te verzamelen.
```

### 2. Verantwoording voor Hostrechten (Host Permissions - `<all_urls>`)*
```text
De hostrechten (<all_urls>) zijn noodzakelijk om op alle websites die de gebruiker bezoekt advertentievlakken visueel in te klappen (cosmetic filtering) en opdringerige cookiebanners (GDPR/AVG-overlays) automatisch te weigeren. Omdat advertenties en cookiebanners op elk willekeurig webdomein kunnen voorkomen, is toegang tot alle URL's vereist voor de kernfunctionaliteit van de adblocker. Er worden hierbij geen browsegegevens, URL's of persoonlijke gegevens opgeslagen of verzonden; alle verwerking gebeurt 100% lokaal op het apparaat.
```

### 3. Verantwoording voor activeTab*
```text
Wordt uitsluitend gebruikt wanneer de gebruiker op het extensie-icoon klikt om het popup-venster te openen. activeTab leest enkel de huidige domeinnaam uit om de 1-klik witte lijst (whitelist) in- of uit te schakelen en om lokale statistieken voor dat specifieke tabblad weer te geven.
```

### 4. Verantwoording voor declarativeNetRequest*
```text
Dit is de kernmotor van de adblocker. Deze permissie stelt de extensie in staat om netwerkverzoeken naar bekende advertentieservers, trackingpixels en analysenetwerken direct op Chromium-kernelniveau te blokkeren zonder vertraging van de pagina.
```

### 5. Verantwoording voor declarativeNetRequestFeedback*
```text
Wordt uitsluitend gebruikt door het ingebouwde lokale Diagnose- en Auditpaneel om de gebruiker real-time inzicht te geven in welke lokale regels zijn getriggerd op het actieve tabblad. Deze data verlaat nooit de browser en wordt nergens naartoe verzonden.
```

### 6. Verantwoording voor scripting*
```text
Noodzakelijk om lokale cosmetische stylesheets te injecteren die lege advertentievakken verbergen en om scripts uit te voeren die cookiebanners automatisch sluiten op pagina's en in ingesloten iframes.
```

### 7. Verantwoording voor storage*
```text
Wordt uitsluitend gebruikt om gebruikersvoorkeuren lokaal op te slaan via chrome.storage.local, zoals het gekozen thema (Donker/Licht), de aan/uit-status, de aangepaste witte lijst van domeinen en de lokale bedreigingstellers. Geen van deze instellingen wordt gesynchroniseerd of geëxporteerd naar externe servers.
```

### 8. Externe code (Remotely Hosted Code)*
Selecteer de optie **Nee, ik gebruik geen externe code** (of plak bij een tekstveld):
```text
De extensie gebruikt geen enkele externe of op afstand gehoste code. Alle scripts, stijlen en filterregels zijn 100% lokaal gebundeld in het extensiepakket conform het Chrome Web Store-beleid voor Manifest V3.
```

### 9. URL voor privacybeleid (Privacy Policy URL)*
```text
https://github.com/retrroo/nabla-ad-shield/blob/main/PRIVACY.md
```

### 10. Gegevensverzameling en Certificeringen
* **Gegevenscategorieën:** Selecteer bij alle categorieën **Nee / Niet verzameld** (de extensie verzamelt immers 0 byte aan gegevens).
* **Certificeringen (vink alle 4 de vakjes aan):**
  1. [x] Ik verkoop geen gegevens van gebruikers aan derden.
  2. [x] Ik gebruik of draag geen gebruikersgegevens over voor doeleinden die geen verband houden met de kernfunctionaliteit.
  3. [x] Ik gebruik of draag geen gebruikersgegevens over om kredietwaardigheid vast te stellen of voor leningen.
  4. [x] Ik verklaar dat mijn gebruik van gegevens voldoet aan het Programmabeleid voor ontwikkelaars.

