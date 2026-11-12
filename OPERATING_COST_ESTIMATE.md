# ESTIMATED OPERATING COSTS

## 1. Local Self-Hosted Architecture (Zero-Cost Baseline)

Running the application locally on your workstation requires zero external subscriptions:

| Component | Service | Monthly Cost |
|---|---|---:|
| **Application Hosting** | Localhost (Node.js runtime) | $0.00 |
| **Relational Database** | Local SQLite (`data/career_app.db`, WAL Mode) | $0.00 |
| **Storage & Persistence** | Local Disk | $0.00 |
| **AI Orchestration & Matching** | Local Rule Engine & Pre-trained NLP | $0.00 |
| **Recruitment Inbox** | Local Verified Sandbox Gateway | $0.00 |
| **Daily Automation** | Local Process / Scheduled Loop | $0.00 |
| **TOTAL LOCAL MONTHLY COST** | | **$0.00 / month** |

---

## 2. Cloud-Hosted Production Architecture (Optional Scale-Up)

If deployed to cloud infrastructure for remote access:

| Component | Recommended Provider | Tier | Estimated Cost |
|---|---|---|---:|
| **Server / Container** | Railway / Hetzner Cloud / Lightsail | 1 vCPU, 2GB RAM | $4.00 – $7.00 / month |
| **Persistent Volume** | Attached Cloud Block Storage (5 GB) | Standard SSD | $0.50 / month |
| **Domain & SSL** | Cloudflare / Vercel DNS | Free Tier + Custom Domain ($12/yr) | ~$1.00 / month |
| **Gmail API** | Google Cloud Console | Standard OAuth2 Quota (1B units/day) | $0.00 (Free) |
| **Pluggable LLM API** | Gemini 1.5 Flash / Gemini 2.0 | ~500k tokens/month for tailoring | ~$0.15 / month |
| **TOTAL ESTIMATED CLOUD COST** | | | **~$5.65 – $8.65 / month** |
