# Configuration & Integration Guide
## Antigravity AI Career Management Platform

**Candidate In Focus**: Aya Hamouda Mahmoud Ali (`Ayahamouda14@gmail.com`)  
**Target Timezone**: `Africa/Cairo`  

---

## 1. Environment Configuration (`.env.local`)

Create or edit `.env.local` in the project root:

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# Database Configuration
DATABASE_PATH=data/career_app.db

# Default Automation Timezone
DEFAULT_TIMEZONE=Africa/Cairo

# Optional: Live Google OAuth & Gmail Integration
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Optional: External LLM Provider API Keys
GEMINI_API_KEY=
OPENAI_API_KEY=
```

---

## 2. Enabling Live Gmail Integration

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project and enable the **Gmail API**.
3. In **Credentials**, create an **OAuth 2.0 Client ID** (Web Application).
4. Set Authorized Redirect URI: `http://localhost:3000/api/auth/google/callback`.
5. Add scopes:
   - `https://www.googleapis.com/auth/gmail.readonly` (Read-only emails)
   - `https://www.googleapis.com/auth/gmail.compose` (Draft generation)
   - `https://www.googleapis.com/auth/gmail.send` (Requires separate explicit approval)
6. Place `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`.

---

## 3. Automation & Scheduled Daily Reports

The automation engine executes daily at **09:00 AM Africa/Cairo time**.
- **In-App Trigger**: You can immediately trigger a fresh report on demand from the `/reports` page or by making a POST request:
  ```bash
  curl -X POST http://localhost:3000/api/reports/daily
  ```
- **Report Contents**:
  - New verified vacancies discovered in the last 24 hours
  - Top 10 matched FMCG & Commercial roles
  - Pending approval count
  - Outbound applications dispatched with confirmation IDs
  - Incoming recruiter messages and interview invites
  - Recommended high-priority next actions

---

## 4. Platform Adapters Configuration

All 8 recruitment platform adapters are managed in `lib/portal-integrations.ts` and can be toggled between `connected`, `sandbox`, and `disconnected` via the Integrations Hub at:
[http://localhost:3000/integrations](http://localhost:3000/integrations)
