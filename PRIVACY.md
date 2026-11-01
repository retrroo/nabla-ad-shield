# Privacy Policy for Shield by Nablai

**Effective Date:** November 1, 2026  
**Last Updated:** November 1, 2026

Shield by Nablai ("we", "our", or "the extension") is an open-source, deterministic ad blocker and cookie consent manager built for Chromium-based browsers. We are deeply committed to protecting your privacy. This Privacy Policy describes how Shield by Nablai handles your information.

---

## 1. Zero Data Collection Principle

**Shield by Nablai does not collect, store, transmit, sell, or share any personal data, browsing history, or user information.**

Specifically:
- **No Personal Identifiers:** We do not collect names, email addresses, usernames, passwords, or IP addresses.
- **No Browsing History:** We do not track, log, or record the websites you visit, the searches you perform, or the links you click.
- **No Analytics or Telemetry:** Shield by Nablai contains zero analytics trackers, third-party SDKs, telemetry beacons, or error reporting scripts.
- **No Remote Servers:** The extension never initiates network connections or API calls to our own or third-party servers. All filtering and processing occur strictly on your local machine.

---

## 2. On-Device Local Storage (`chrome.storage.local`)

All preferences and configuration data are stored exclusively on your device using Chromium's `chrome.storage.local` API. This data never leaves your browser:
- **User Settings:** Extension enabled/disabled state, and visual theme preference (Dark Mode or White Mode).
- **Custom Whitelist:** The list of website domains you have explicitly chosen to whitelist.
- **Threat Counter:** Local integer counter of neutralized ad requests, collapsed elements, and rejected cookie banners.

You can clear or reset this data at any time by disabling or removing the extension, or by using the built-in whitelist and counter controls.

---

## 3. Chrome Permissions & Why They Are Needed

Shield by Nablai requests only the minimal permissions necessary to perform its core functions:

* **`activeTab`**: Used only when you open the extension popup to inspect the current domain name for the 1-click whitelist toggle and to display local threat statistics for that page.
* **`declarativeNetRequest`**: Enables native Chromium kernel-level blocking of known advertising scripts, tracking pixels, and analytic domains without CPU overhead.
* **`declarativeNetRequestFeedback`**: Used strictly by the local Diagnostics Console to display intercepted network rules in real time for transparent user auditing.
* **Host Permissions (`<all_urls>`)**: Required to apply cosmetic stylesheet filters that collapse ad element containers, automatically reject GDPR/CMP cookie consent overlays, and mitigate video ads across arbitrary websites you visit.
* **`scripting`**: Required to inject dynamic cosmetic CSS rules and execute cookie consent rejection routines across top-level and iframe frames.
* **`storage`**: Used exclusively to persist your local preferences (whitelist, theme, counters) on your device.

---

## 4. Third-Party Sharing and Sale of Data

Because we do not collect any user data, **we do not sell, rent, trade, or transfer any information to third parties** for advertising, marketing, profiling, lending, creditworthiness, or any other commercial purpose.

---

## 5. Open Source Transparency

Shield by Nablai is open source. You can independently review the entire source code, build scripts, and local rulesets on GitHub at:  
[https://github.com/retrroo/nabla-ad-shield](https://github.com/retrroo/nabla-ad-shield)

---

## 6. Changes to This Policy

If this Privacy Policy is updated, the revised policy will be posted to this repository with an updated "Last Updated" date.

---

## 7. Contact

If you have any questions or feedback regarding this Privacy Policy or the security of Shield by Nablai, please open an issue on our GitHub repository:  
[https://github.com/retrroo/nabla-ad-shield/issues](https://github.com/retrroo/nabla-ad-shield/issues)
