# SeryeKo — Product Requirements Document (PRD)

**Version:** 1.1  
**Date:** October 2026  
**Status:** Draft  
**Owner:** Product Team  

---

## 1. Executive Summary

SeryeKo is a mobile-first Asian drama streaming platform targeting users in the Philippines, Indonesia, and international markets. It aggregates content from 40+ providers via the DramaBuzz API ecosystem, delivers **lifetime subscription access** (one-time purchase), and prioritizes frictionless discovery and viewing through swipe/scroll interaction patterns.

---

## 2. Problem Statement

- Asian drama fans across Southeast Asia (PH, ID, global) lack a single, affordable, mobile-friendly platform with permanent access — existing services are monthly subscription traps.
- Content discovery on competing apps requires too many taps; users want TikTok-style swipe-to-discover, not category drilling.
- Multilingual support (EN / TL / ID) is absent on most existing drama platforms.

---

## 3. Goals & Success Metrics

| Goal | KPI | Target (6 months) |
|---|---|---|
| Grow lifetime subscriber base | Paid conversions | 10,000 users |
| Retention via discovery UX | Daily active users / MAU | > 60% |
| Content availability | Providers integrated | ≥ 30 active |
| Mobile experience quality | Mobile session duration | > 20 min avg |
| Localization adoption | Non-EN UI sessions | > 50% |

---

## 4. Target Users

### Primary Persona — "Bea" (Philippines, 24F)
- Watches drama on phone during commute, lunch break
- Follows Korean/Chinese/Thai drama fandoms on TikTok
- Fed up with monthly sub fees; prefers one-time payment
- Language: Tagalog (primary), English (secondary)

### Secondary Persona — "Rina" (Indonesia, 28F)
- Watches drama late night, mobile-first
- Active in Indonesian drama Facebook groups
- Finds existing apps confusing to navigate
- Language: Bahasa Indonesia

### Tertiary Persona — "International Fan" (EN-speaking diaspora)
- Southeast Asian diaspora in US/EU/AU
- Uses VPN, seeks affordable lifetime access
- Language: English

---

## 5. Feature Scope (MVP)

### 5.1 Authentication & Subscription

| Feature | Priority | Notes |
|---|---|---|
| Register / Login (email + password) | P0 | Email verification on signup |
| Login via Google (OAuth 2.0) | P0 | Google Sign-In button — one tap on mobile |
| Lifetime subscription purchase | P0 | One-time fee, price set via Admin Panel |
| Guest browsing (limited content) | P1 | 1 episode preview per drama |
| Subscription status indicator | P0 | Badge: "Lifetime Member" |
| Multi-device access | P1 | Up to 3 devices simultaneously |

**Lifetime Access Model:**
- One-time price: **configurable by admin** via Admin Panel (no hardcoded value in app)
- Admin can set price per currency (PHP primary, USD optional)
- Admin can activate/deactivate "Early Bird" discount pricing with optional user cap (e.g. first 1,000 users)
- Admin can toggle guest preview on/off (default: 1 free episode)
- Access never expires; no recurring charges after purchase

### 5.2 Content Discovery — Mobile-First UX

#### Home Feed (Swipe-to-Discover)
- **Vertical swipe feed** (TikTok/Reels-style) — auto-play short trailer/first episode clip on swipe
- Each card shows: thumbnail, title, genre tags, episode count, language badges, provider source
- Swipe right = add to Watchlist; swipe left = not interested (improves recommendation)
- Pull-down to refresh feed

#### Browse & Search
- Bottom navigation: Home | Browse | Search | Watchlist | Profile
- Browse by: Genre, Country (Korea/China/Thailand/Japan), Provider, Language
- Search: real-time type-ahead, search across all active providers
- Filter: completion status (completed / ongoing), language, year, rating

#### Trending & Rankings
- "Hot Today", "New Episodes", "Most Watched This Week"
- Horizontal scroll carousel for categories
- Infinite scroll list for full category pages

### 5.3 Player Experience

| Feature | Priority |
|---|---|
| In-app video player (HLS) | P0 |
| Episode list — horizontal scroll thumbnails | P0 |
| Auto-play next episode | P0 |
| Swipe left/right to prev/next episode | P1 |
| Double-tap to seek ±10s | P1 |
| Subtitle selection (EN / TL / ID / others) | P1 |
| Fullscreen auto on landscape | P0 |
| Picture-in-Picture (mobile) | P2 |
| Download for offline (subscriber only) | P2 |
| Playback speed control (0.75x – 2x) | P1 |

### 5.4 Localization (i18n)

| Language | Code | UI | Subtitles | Search |
|---|---|---|---|---|
| English | `en` | ✅ | ✅ | ✅ |
| Filipino / Tagalog | `tl` | ✅ | ✅ | ✅ |
| Bahasa Indonesia | `id` | ✅ | ✅ | ✅ |

- Language auto-detected from device locale; user can override in Profile
- All UI labels, error messages, onboarding strings, and notifications localized

### 5.5 Watchlist & Progress Tracking
- Add/remove from Watchlist (swipe right on discovery feed OR bookmark icon on player)
- Continue Watching: resume episode from last position
- Watch history per user
- Mark episodes watched

### 5.6 Notifications
- New episode alerts for followed dramas
- Platform-wide announcements (new providers, promotions)
- Push notifications (PWA push or native)

---

## 6. Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React SPA)                      │
│  React 18 + Vite + Tailwind CSS + React Router v6           │
│  PWA (service worker) — installable on mobile               │
│  Docker image → fly.io app: seryeko-web                 │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTPS REST / JSON
┌───────────────────────▼─────────────────────────────────────┐
│               BACKEND API  (FastAPI / Python)                │
│  Auth · Rate Limiting · Caching · Provider Aggregation      │
│  Admin Panel API (separate route prefix /admin)             │
│  Docker image → fly.io app: seryeko-api                 │
└──────┬─────────────────────────┬───────────────────────────┘
       │                         │
┌──────▼──────┐        ┌─────────▼──────────────────────────┐
│  PostgreSQL │        │   PROVIDER AGGREGATOR SERVICE      │
│  fly.io     │        │   Calls DramaBuzz API ecosystem    │
│  Postgres   │        │   Key: <YOUR_DRAMABUZZ_API_KEY> │
│  (managed)  │        │   44 providers, 35 active          │
└──────┬──────┘        └────────────────────────────────────┘
       │
┌──────▼──────┐
│   Redis     │
│  Upstash or │
│  fly.io app │
└─────────────┘
```

**Deployment topology (fly.io):**

| App name | Image | Region | Resources |
|---|---|---|---|
| `seryeko-web` | React + Nginx | sin (Singapore) | shared-cpu-1x, 256MB |
| `seryeko-api` | FastAPI + Uvicorn | sin (Singapore) | shared-cpu-1x, 512MB |
| `seryeko-db` | fly.io Postgres | sin (Singapore) | managed, 1GB |
| `seryeko-redis` | Upstash Redis or fly.io Redis | sin | managed |

All services in the same fly.io org — DB and Redis exposed only on the private `fly-local-6pn` network (not public).

### Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind CSS | SPA, fast dev, mobile-first |
| Routing | React Router v6 | Client-side routing, lazy-loaded routes |
| State | Zustand + React Query | Global state + server-state / caching |
| PWA | Vite PWA plugin (Workbox) | Installable on Android/iOS homescreen |
| Backend API | FastAPI (Python) | Async, fast, easy provider aggregation |
| Database | PostgreSQL (fly.io managed) | User data, subscriptions, settings |
| ORM | SQLAlchemy + Alembic | Migrations, async queries |
| Cache | Redis (Upstash or fly.io) | Content TTL cache, session store |
| Video | Provider HLS URLs (direct CDN) | No re-encoding; stream from source |
| Auth | JWT (access + refresh tokens) + Google OAuth 2.0 | Email/password login + Google Sign-In |
| Payments | PayMongo | GCash, Maya, Visa/MC, BillEase |
| Containerization | Docker (multi-stage builds) | Consistent builds, fly.io deploy target |
| Hosting | fly.io | Both FE and BE; Singapore region |
| CI/CD | GitHub Actions → `flyctl deploy` | Push-to-deploy on `main` branch |

---

## 6b. Docker & fly.io Setup

### Project Structure

```
seryeko/
├── frontend/                   # React SPA
│   ├── Dockerfile
│   ├── fly.toml                # fly.io config for seryeko-web
│   ├── nginx.conf              # serves built SPA + proxy /api → backend
│   ├── vite.config.ts
│   ├── public/
│   │   └── manifest.json       # PWA manifest
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── routes/             # React Router pages
│       ├── components/
│       ├── hooks/
│       ├── store/              # Zustand stores
│       └── api/                # React Query + axios client
│
├── backend/                    # FastAPI
│   ├── Dockerfile
│   ├── fly.toml                # fly.io config for seryeko-api
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── models/             # SQLAlchemy models
│       ├── routers/
│       │   ├── auth.py             # email/password + Google OAuth callback
│       │   ├── content.py          # provider aggregation
│       │   ├── subscription.py
│       │   ├── webhooks.py     # PayMongo webhook
│       │   └── admin.py        # admin panel API
│       ├── services/
│       │   ├── provider.py     # DramaBuzz aggregator
│       │   ├── paymongo.py
│       │   └── cache.py        # Redis helpers
│       └── migrations/         # Alembic
│
└── docker-compose.yml          # local dev (all services)
```

### Frontend Dockerfile (multi-stage)

```dockerfile
# Stage 1: build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: serve with Nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

### Backend Dockerfile (multi-stage)

```dockerfile
FROM python:3.12-slim AS base
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS production
COPY ./app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

### Nginx Config (frontend — proxies /api to backend)

```nginx
server {
    listen 8080;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls to backend app
    location /api/ {
        proxy_pass http://seryeko-api.fly.dev/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### fly.toml — Frontend

```toml
app = "seryeko-web"
primary_region = "sin"

[build]

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
```

### fly.toml — Backend

```toml
app = "seryeko-api"
primary_region = "sin"

[build]

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1

[env]
  ENVIRONMENT = "production"
  REDIS_TTL_HOME = "1200"
  REDIS_TTL_DETAIL = "3600"
  REDIS_TTL_SEARCH = "300"

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

### Secrets (set via `flyctl secrets set` — never in fly.toml)

```bash
# Backend secrets
flyctl secrets set \
  DATABASE_URL="postgres://..." \
  REDIS_URL="redis://..." \
  JWT_SECRET="..." \
  PAYMONGO_PUBLIC_KEY="pk_live_..." \
  PAYMONGO_SECRET_KEY="sk_live_..." \
  PAYMONGO_WEBHOOK_SECRET="whsec_..." \
  DRAMABUZZ_API_KEY="<YOUR_DRAMABUZZ_API_KEY>" \
  GOOGLE_CLIENT_ID="..." \
  GOOGLE_CLIENT_SECRET="..." \
  --app seryeko-api

### Google OAuth 2.0 — Implementation Detail

**Setup (Google Cloud Console):**
1. Create project → Enable **Google Identity API**
2. OAuth 2.0 Credentials → Web Application
3. Authorized redirect URI: `https://seryeko-api.fly.dev/api/auth/google/callback`
4. Add `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` to fly.io secrets

**Auth flow:**

```
Mobile browser
  → tap "Continue with Google"
  → frontend redirects to: GET /api/auth/google/login
  → backend redirects to Google consent screen
  → user approves
  → Google redirects to: GET /api/auth/google/callback?code=...
  → backend exchanges code for Google ID token
  → backend verifies token, upserts user in DB
  → backend issues JWT (access + refresh)
  → redirect to frontend with token in URL fragment:
      https://seryeko-web.fly.dev/#token=<jwt>
  → frontend reads token from fragment, stores in memory/localStorage
  → user is logged in
```

**Backend endpoints:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auth/google/login` | Redirect to Google consent URL |
| `GET` | `/api/auth/google/callback` | Handle Google code, return JWT |
| `POST` | `/api/auth/register` | Email/password registration |
| `POST` | `/api/auth/login` | Email/password login → JWT |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `POST` | `/api/auth/logout` | Invalidate refresh token |

**User upsert logic (Google callback):**
```python
# If email already exists as email/password account → link Google sub
# If Google sub exists → return existing user
# If neither → create new user (email from Google profile, no password)
```

**Frontend (React):**
- Button: `<GoogleLoginButton />` — renders branded Google button per UX guidelines
- On click: `window.location.href = "/api/auth/google/login"` (full redirect, not popup — better mobile support)
- After callback: parse `#token=` from URL, store JWT, redirect to `/home`
- Library: plain fetch — no NextAuth or Firebase needed

**Required Google OAuth scopes:** `openid email profile` (no extra permissions)

# Frontend secrets (build-time env via VITE_ prefix)
# Set in GitHub Actions CI, not fly secrets
```

### Local Dev — docker-compose.yml

```yaml
version: "3.9"
services:
  web:
    build: ./frontend
    ports: ["3000:8080"]
    environment:
      - VITE_API_URL=http://localhost:8000

  api:
    build: ./backend
    ports: ["8000:8000"]
    environment:
      - DATABASE_URL=postgresql+asyncpg://drama:drama@db:5432/seryeko
      - REDIS_URL=redis://redis:6379
      - DRAMABUZZ_API_KEY=<YOUR_DRAMABUZZ_API_KEY>
      - JWT_SECRET=localsecret
      - ENVIRONMENT=development
    depends_on: [db, redis]

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: drama
      POSTGRES_PASSWORD: drama
      POSTGRES_DB: seryeko
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    volumes: [redisdata:/data]

volumes:
  pgdata:
  redisdata:
```

### GitHub Actions CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy to fly.io
on:
  push:
    branches: [main]

jobs:
  deploy-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only --app seryeko-api
        working-directory: backend
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

  deploy-web:
    runs-on: ubuntu-latest
    needs: deploy-api
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only --app seryeko-web
        working-directory: frontend
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
          VITE_API_URL: https://seryeko-api.fly.dev
```

### Initial Setup Commands

```bash
# 1. Install flyctl (already at ~/.fly/bin/flyctl)
# 2. Login
flyctl auth login

# 3. Create apps
flyctl apps create seryeko-web 
flyctl apps create seryeko-api 

# 4. Provision Postgres
flyctl postgres create --name seryeko-db --region sin --initial-cluster-size 1

# 5. Attach DB to API app
flyctl postgres attach seryeko-db --app seryeko-api

# 6. Deploy
cd backend  && flyctl deploy --app seryeko-api
cd frontend && flyctl deploy --app seryeko-web
```

---

## 7. API Integration Layer

### 7.1 DramaBuzz Provider Status

- **Status API:** `GET https://api.dramabuzz.sbs/api/status?key=<YOUR_DRAMABUZZ_API_KEY>`
- **Total providers:** 44 (43 with API, 1 maintenance/no API)
- **Currently active:** 36 | **Maintenance:** 7 | **Coming Soon:** 1

### 7.2 Priority Providers for MVP (active + rich API)

| Provider | API Base | Endpoints |
|---|---|---|
| DramaBox | `https://dramabox.goodbos.online` | trending, search, browse, allepisode, languages |
| ShortMax | `https://shortmax.goodbos.online` | popular, new, hot, vip, ranking, search, detail, alleps |
| DramaWave | `https://dramawave.goodbos.online` | home, new-drama, recommend, anime, search, drama/:id |
| ReelShort | `https://reelshort.goodbos.online` | chapters/:id, allepisodes/:id, languages |
| FlickReels | `https://flickreels.goodbos.online` | home, list, trending, search, languages, batchload/:id |
| StarShort | `https://drakula.goodbos.online` | content/hot, content/latest, content/trending, content/recommended |
| GoodShort | `https://goodshort.goodbos.online` | /api.html |
| Melolo | `https://melolo.goodbos.online` | /api.html |
| DramaNova | `https://dramanova.goodbos.online` | /api.html |
| ReelBuzz | `https://reelbuzz.goodbos.online` | /api.html |

### 7.3 Common Endpoint Patterns Across Providers

```
GET /api/{provider}/trending?lang={locale}&page={n}&token={key}
GET /api/{provider}/search?q={query}&lang={locale}&token={key}
GET /api/{provider}/detail/{id}?lang={locale}&token={key}
GET /api/{provider}/allepisodes/{id}?lang={locale}&token={key}   → returns HLS video URLs
GET /api/{provider}/home?lang={locale}
GET /api/{provider}/languages
```

Auth header pattern (DramaBox): `x-token: {API_KEY}`  
Auth query pattern (most others): `?token={API_KEY}` or `?code={API_KEY}`

### 7.4 Aggregation Strategy

1. **Content normalization:** Map each provider response to a unified schema (see Section 8)
2. **Caching:** Redis TTL 20 min for home/trending; 60 min for detail; 5 min for search
3. **Fallback:** If a provider's API returns error, log and skip silently
4. **Rate limits:** Respect per-provider limits (e.g., DramaWave: 60 req/min per code)

---

## 8. Unified Content Schema

```typescript
interface Drama {
  id: string;                    // "{provider}:{originalId}"
  provider: string;              // e.g., "dramabox"
  title: string;
  titleLocalized: {
    en: string;
    tl?: string;
    id?: string;
  };
  thumbnail: string;             // CDN URL
  coverImage: string;
  synopsis: string;
  synopsisLocalized?: Record<string, string>;
  genre: string[];
  country: "KR" | "CN" | "TH" | "JP" | "PH" | "ID" | string;
  year: number;
  totalEpisodes: number;
  status: "completed" | "ongoing" | "upcoming";
  languages: string[];           // available subtitle/dub languages
  rating?: number;
  tags?: string[];
}

interface Episode {
  id: string;
  dramaId: string;
  provider: string;
  episodeNumber: number;
  title: string;
  videoUrl: string;              // HLS m3u8 or MP4
  thumbnailUrl?: string;
  duration?: number;             // seconds
  subtitles?: SubtitleTrack[];
}
```

---

## 9. Mobile UX Specifications

### 9.1 Layout — Bottom Navigation
```
[🏠 Home] [🔍 Browse] [🔎 Search] [📋 Watchlist] [👤 Profile]
```

### 9.2 Home Screen — Discovery Feed
- **Swipe up/down:** Navigate between draamas (vertical scroll, snap-to-item)
- **Tap:** Open drama detail / start watching
- **Swipe right on card:** Quick-add to Watchlist
- **Long-press:** Preview trailer (autoplay muted)
- Card height: 85vh on mobile (almost full screen)
- Auto-advance: none by default (opt-in in settings)

### 9.3 Player Screen
- Portrait: half-screen video, half-screen episode list
- Landscape: fullscreen auto
- Episode list: horizontal scroll strip at bottom of video
- Swipe left/right IN video area = prev/next episode
- Double-tap left/right = seek ±10s

### 9.4 Responsive Breakpoints

| Breakpoint | Layout |
|---|---|
| < 640px | Single column, bottom nav |
| 640–1024px | 2-column browse, bottom nav |
| > 1024px | 3-4 column browse, side nav |

### 9.5 Accessibility
- Minimum touch target: 44x44px
- Contrast ratio ≥ 4.5:1
- Screen reader labels on all interactive elements

---

## 10. Subscription & Payment Flow

```
Landing Page → Preview (1 ep free) → "Unlock All" CTA
  → Pricing Page (price fetched live from Admin Panel settings)
  → Payment via PayMongo (GCash / Maya / Credit-Debit Card)
  → PayMongo webhook → backend activates subscription
  → Email confirmation
  → Account activated
  → Redirect to Home Feed (full access)
```

**PayMongo integration details:**
- API: `https://api.paymongo.com/v1`
- Payment methods: GCash, Maya (PayMaya), Credit/Debit Card (Visa/MC), BillEase
- Flow: create `PaymentIntent` → attach `PaymentMethod` → confirm → webhook `payment.paid`
- Webhook endpoint: `POST /api/webhooks/paymongo` — verifies signature, activates user account
- Idempotency: store `paymongo_payment_id` in DB; duplicate webhooks are no-ops
- Test mode key in staging; live key in production (both set in Admin Panel env config)

**Admin Panel — Pricing Settings:**

| Setting | Type | Description |
|---|---|---|
| `lifetime_price_php` | Number | Price in Philippine Peso (e.g. 999) |
| `lifetime_price_usd` | Number | Optional USD price for international users |
| `early_bird_enabled` | Boolean | Toggle early bird discount |
| `early_bird_price_php` | Number | Discounted price while active |
| `early_bird_cap` | Number | Max users who can get early bird price (0 = unlimited) |
| `early_bird_sold` | Number (read-only) | Current count of early bird purchases |
| `guest_preview_enabled` | Boolean | Allow non-subscribers to watch 1 ep free |
| `guest_preview_episodes` | Number | How many free episodes guests can watch |

**Refund policy:** 7-day money-back guarantee — processed manually via PayMongo dashboard  
**Fraud prevention:** Email verification required before payment link is shown

---

## 11. Phases & Timeline

### Phase 1 — MVP (Month 1–2)
- [ ] Auth — email/password (register, login, email verification)
- [ ] Auth — Google OAuth 2.0 (one-tap login, account linking)
- [ ] PayMongo payment integration (GCash, Maya, card)
- [ ] Admin Panel: pricing config (lifetime_price_php, early_bird toggle, guest preview toggle)
- [ ] Provider aggregator: 5 priority providers (DramaBox, ShortMax, DramaWave, ReelShort, FlickReels)
- [ ] Home swipe feed
- [ ] In-app video player (HLS)
- [ ] Episode navigation
- [ ] Basic Watchlist
- [ ] EN language UI only

### Phase 2 — Localization + Content Depth (Month 3)
- [ ] Tagalog (TL) UI
- [ ] Bahasa Indonesia (ID) UI
- [ ] Expand to 15 providers
- [ ] Browse by genre/country
- [ ] Search across providers
- [ ] Continue watching / progress sync

### Phase 3 — Growth (Month 4–6)
- [ ] USD pricing option for international users (PayMongo card international)
- [ ] All 36 active providers
- [ ] Download for offline
- [ ] Push notifications (new episodes)
- [ ] Recommendation engine (based on watch history + swipe signals)
- [ ] PWA + Capacitor iOS/Android app

---

## 12. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Provider API goes offline | Medium | High | Multi-provider fallback; status monitoring |
| Legal: content licensing | High | Critical | Use only providers with public API access; ToS review |
| Payment fraud / chargebacks | Medium | Medium | Email verification + PayMongo fraud signals; idempotent webhook handler |
| Rate limit exceeded | Medium | Medium | Request queue, Redis cache, per-provider limits |
| Mobile video buffering | Medium | High | Preload next episode, provider CDN direct stream |
| Low conversion from free trial | Medium | High | Optimize onboarding, "1 episode" hook strategy |

---

## 13. Admin Panel Scope

The Admin Panel is a separate internal web UI (not the subscriber-facing app). MVP scope:

| Module | Features |
|---|---|
| **Pricing** | Set `lifetime_price_php`, `lifetime_price_usd`; toggle Early Bird + cap; set guest preview episodes |
| **PayMongo** | Enter/rotate PayMongo API keys (public + secret); toggle test/live mode; view webhook log |
| **Subscribers** | List all subscribers, status, payment date, PayMongo payment ID; manual deactivate |
| **Providers** | Enable/disable specific providers; refresh provider status from DramaBuzz API |
| **Analytics** | Total subscribers, revenue (PHP), conversion rate, daily sign-ups chart |

Admin Panel auth: separate admin login (email + password), no social sign-in; protected by IP whitelist or VPN.

---

## 14. Out of Scope (v1)

- Native iOS/Android apps (PWA first)
- User-generated comments/reviews
- Live streaming
- Downloads for offline (Phase 3)
- Affiliate / referral program
- Multi-currency checkout beyond PHP/USD

---

*Document prepared for: SeryeKo v1.1 MVP*  
*Next review: Sprint kickoff — Week 1*
