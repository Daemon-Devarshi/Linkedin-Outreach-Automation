# LinkedIn Outreach Automation - Chrome Extension (Manifest V3)

A Chrome Extension for automated LinkedIn connection requests with personalized notes, human-like random pacing, and real-time tracking.

---

## 📁 Project Structure

```
chrome-extension/
├── modules/
│   ├── selectors.js       # Centralized LinkedIn selectors (direct buttons, dropdowns, modals)
│   ├── storage.js         # chrome.storage.local helper for queues, history, and settings
│   └── utils.js           # Random delays, typing simulation, and DOM query helpers
├── background.js          # Background Service Worker managing queue & tab automation
├── contentScript.js       # Content Script injected into LinkedIn profile pages
├── manifest.json          # Manifest V3 extension configuration
├── popup.html             # Extension popup user interface
├── popup.js               # UI controller, event listeners, live log feeds
├── styles.css             # Dark/modern UI stylesheet
└── README.md              # Documentation and installation instructions
```

---

## 🚀 How to Install and Load in Google Chrome

1. Open **Google Chrome** (or Brave, Edge, or any Chromium browser).
2. Navigate to `chrome://extensions/` in your address bar.
3. In the top-right corner, toggle **Developer mode** to **ON**.
4. Click the **"Load unpacked"** button in the top-left corner.
5. Select this `chrome-extension` folder:
   `c:\Users\tanwe\Downloads\Linkedin-Outreach-Automation\Linkedin-Outreach-Automation\chrome-extension`
6. The extension **LinkedIn Outreach Automation** will appear in your extensions list!
7. Pin the extension to your Chrome toolbar for quick access.

---

## 📖 How to Use

1. Ensure you are already logged in to **[LinkedIn](https://www.linkedin.com)** in your browser.
2. Click the extension icon in your Chrome toolbar.
3. In the **Campaign** tab:
   - Click **"Load Sample"** or paste your JSON profile array.
   - Example JSON format:
   ```json
   [
     {
       "username": "satyanadella",
       "url": "https://www.linkedin.com/in/satyanadella/",
       "message": "Hi Satya, inspiring to follow your work at Microsoft. Would love to connect!"
     }
   ]
   ```
   - Click **"Save Queue"**, then **"🚀 Start Outreach"**.
4. Switch to the **Monitor** tab to view real-time logs, stats counters, and pause/resume buttons.
5. In the **History** tab, view sent invites or export results as a `.csv` file.
6. In the **Settings** tab, configure safety delay intervals (default: 6–12 seconds).
