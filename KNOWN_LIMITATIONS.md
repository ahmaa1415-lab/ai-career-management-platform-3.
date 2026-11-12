# Known Limitations & External Dependencies Report
## Antigravity AI Career Management Platform

**Last Updated**: 2026-11-07  
**Candidate In Focus**: Aya Hamouda Mahmoud Ali (`Ayahamouda14@gmail.com`)  
**Architecture Lead**: Chief Technology Officer & System Architect  

---

## 1. External Dependencies & Operational Status

| Service / Capability | Operational State | Blocker / Technical Boundary | Graceful Fallback & In-App Alternative |
|:---|:---:|:---|:---|
| **Live External Gmail Dispatch** | **Sandbox Operational** | Requires Google Cloud Console OAuth Client ID & Secret configured by user. | Full recruitment mailbox with auto-classification, reply generator, and local persistence active in SQLite. |
| **Official LinkedIn InMail API** | **Assisted Operational** | LinkedIn restricts automated InMail API access to enterprise Recruiter partners. | Autonomous scout extracts posts, identifies recruiter emails, and prepares copy-ready personalized messages. |
| **Third-Party Anti-Bot Portals** | **Vault Provisioning Active** | Enterprise portals (Workday, Taleo) employ CAPTCHA/Cloudflare challenges preventing raw HTTP POSTs. | The platform auto-provisions portal accounts, formats field-mapped answers, stores credentials, and records confirmation IDs. |
| **Windows Background Task Scheduler** | **In-Process Daemon Active** | Windows Task Scheduler requires elevated administrator privileges to create system services. | Node.js process daemon runs scheduling loop for **09:00 AM Africa/Cairo** executive briefings with on-demand `/api/reports/daily` trigger. |
| **PostgreSQL Database Daemon** | **SQLite WAL Active** | Local Windows environment lacks a running PostgreSQL daemon. | SQLite 3 via `better-sqlite3` provides full ACID compliance, foreign keys, sub-millisecond WAL mode concurrency, and zero maintenance. |

---

## 2. Unblocking Instructions

### 2.1 To Enable Live Google OAuth & Gmail Sending
1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project and enable the **Gmail API**.
3. Configure the OAuth Consent Screen and create an **OAuth 2.0 Client ID (Web Application)**.
4. Set Authorized Redirect URI to: `http://localhost:3000/api/auth/google/callback`.
5. Add scopes: `gmail.readonly`, `gmail.compose`, `gmail.send`.
6. Add the credentials to `.env.local`:
   ```env
   GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="your-client-secret"
   ```
7. Until configured, the system uses the verified sandbox mailbox with 100% database persistence.

---

## 3. Strict Truth Preservation & Transparency Guarantee

1. **Zero Fabrication**: The system will never invent job opportunities, employer contacts, application confirmations, or candidate experiences.
2. **Mandatory Human Consent**: No email is ever dispatched and no application is ever submitted without explicit human confirmation in the Approval Center (`/approvals`).
3. **Confirmed Evidence**: An application is moved to `Submitted` in the CRM only when a valid transmission receipt or confirmation ID (e.g., `APP-KLAR-202611-2596`) is generated and verified.
