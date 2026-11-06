# 🎬 SeryeKo.com

> **Short Dramas, Big Kilig** — Open-source, mobile-first Asian short drama streaming platform with lifetime subscription access, referral rewards, and PayMongo QR Ph integration.  
> Multilingual: English · Tagalog (Filipino) · Bahasa Indonesia

---

## Features

- 📱 **Mobile-First Experience**: Swipeable vertical feeds, autoplaying drama trailers, and PWA support (installable directly to mobile home screen).
- 🎭 **Multi-Provider Aggregation**: Aggregates catalog from 35+ Asian drama platforms (DramaBox, ShortMax, ReelShort, FlickReels, DramaWave, etc.).
- 💎 **Lifetime Subscription Model**: Built-in PayMongo QR Ph checkout (GCash, Maya, ShopeePay, bank transfers via InstaPay) with automated instant unlocking.
- 🤝 **Affiliate & Referral Engine**: Unique referral codes, commission tracking, and automated payout request management.
- 🛡️ **Admin Dashboard**: Live metrics, content catalog overrides, dynamic pricing controls, referral management, and runtime API key rotation.
- ⚡ **Lightweight Stack**: FastAPI + PostgreSQL 16 + React 19 + Tailwind CSS + Docker Compose.

---

## 🔑 Getting Your API Keys

SeryeKo works with mock keys out of the box for testing, but you will need real keys for production content and payments.

### 1. DramaBuzz Content API Key (Required for live dramas)
- **What it does**: Fetches drama titles, episodes, streaming video URLs, and multilingual subtitles from 35+ providers.
- **Where to get it**:
  1. Visit the DramaBuzz provider portal at [https://dramabuzz.sbs](https://dramabuzz.sbs) (or contact your content provider account representative).
  2. Generate or obtain your 32-character API key from your account dashboard.
  3. Verify your key by calling:
     ```
     https://api.dramabuzz.sbs/api/status?key=YOUR_API_KEY
     ```

### 2. PayMongo Keys (For QR Ph payments)
- **What it does**: Handles QR Ph payments for lifetime subscription purchases.
- **Where to get it**:
  1. Create a free account at [PayMongo Dashboard](https://dashboard.paymongo.com).
  2. Go to **Developers → API Keys** and copy your **Public Key** (`pk_...`) and **Secret Key** (`sk_...`).
  3. Go to **Developers → Webhooks**, create a webhook pointing to `https://<your-domain>/api/webhooks/paymongo`, and copy the **Webhook Signing Secret** (`whsec_...`).
  > *Note: For local testing, default mock keys (`pk_test_...`) are pre-configured to automatically simulate successful payments.*

### 3. Google OAuth Credentials (Optional)
- **What it does**: Enables 1-click Google Sign-In.
- **Where to get it**: [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials** → OAuth 2.0 Client ID.
- Set Authorized Redirect URI: `http://localhost:5173/api/auth/google/callback` (or your production URL).

---

## ⚙️ How to Apply Your Keys

You can apply your keys using either of the two methods below:

### Method A: Via Environment File (Recommended for Deployment)
1. Copy the template environment file:
   ```bash
   cp backend/.env.example backend/.env
   ```
2. Open `backend/.env` and paste your keys:
   ```env
   # Content Provider
   DRAMABUZZ_API_KEY=your_dramabuzz_key_here

   # PayMongo (QR Ph)
   PAYMONGO_PUBLIC_KEY=pk_live_your_key_here
   PAYMONGO_SECRET_KEY=sk_live_your_key_here
   PAYMONGO_WEBHOOK_SECRET=whsec_your_secret_here

   # Google Sign-In (optional)
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```

### Method B: Live in the Admin Dashboard (No Restart Needed)
1. Open the running app in your browser and log in with your admin account.
2. Navigate to **Admin Dashboard → Settings → API Keys**.
3. Paste your **DramaBuzz API Key** and **PayMongo Credentials**, then click **Save**.
4. Keys stored in the database take effect immediately across all background fetchers without requiring a container restart.

---

## 🚀 Quick Start (Local Setup)

The fastest way to run SeryeKo is using Docker Compose:

### Step 1: Clone the repository
```bash
git clone https://github.com/<your-username>/seryeko.com.git
cd seryeko.com
```

### Step 2: Copy the environment file
```bash
cp backend/.env.example backend/.env
```
*(Optionally add your `DRAMABUZZ_API_KEY` into `backend/.env` now, or add it later in the Admin UI).*

### Step 3: Start with Docker Compose
```bash
docker compose up --build
```

That is it! Open your browser:
- 🌐 **Web App:** [http://localhost:3000](http://localhost:3000)
- 🔌 **Backend API:** [http://localhost:8000](http://localhost:8000)
- 📖 **API Docs (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 👤 Default Admin Account

When the database is initialized for the first time, an administrator account is automatically created:

- **Email:** `admin@seryeko.com`
- **Password:** `admin123456`

> ⚠️ **Important**: Change this password immediately after first login via your Profile page or Admin Settings!

---

## 🛠️ Provider Endpoint Analyzer Tool

The repository comes with a standalone script (`api_analyzer.py`) to crawl, inspect, and benchmark all 44 upstream drama providers:

```bash
# Analyze all providers using environment key
export DRAMABUZZ_API_KEY="your_api_key_here"
python3 api_analyzer.py

# Or supply key directly via CLI
python3 api_analyzer.py --key "your_api_key_here"

# Test a specific provider (e.g. DramaBox) with live HTTP requests
python3 api_analyzer.py --provider dramabox --test

# Export results to JSON
python3 api_analyzer.py --output json --save providers_report.json
```

---

## 📜 Open Source License & Disclaimers

### License
SeryeKo is open-source software released under the **[MIT License](LICENSE)**. You are free to use, inspect, modify, distribute, and integrate this software into commercial or private projects, subject to retaining the original copyright notice and license text in substantial portions of the codebase.

### Third-Party APIs & Content Disclaimer
- **No Hosted Media Files:** SeryeKo is a software framework and self-hosted client interface. The codebase contains no video, audio, or copyrighted media files.
- **Provider Aggregation:** Video streams, metadata, thumbnails, and subtitles are resolved dynamically from external third-party API providers using keys configured by the operator.
- **Operator Responsibility:** Operators of self-hosted instances are responsible for ensuring compliance with third-party provider terms of service, applicable copyright regulations, and local licensing laws.

### Trademarks
All company names, product trademarks, brand names, and provider logos referenced in this project are the property of their respective owners. Reference to them does not imply sponsorship, partnership, or endorsement.

### Limitation of Liability
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY ARISING FROM OR IN CONNECTION WITH THE SOFTWARE.
