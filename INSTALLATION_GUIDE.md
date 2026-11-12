# Installation & Quickstart Guide
## Antigravity AI Career Management Platform

**Candidate In Focus**: Aya Hamouda Mahmoud Ali (`Ayahamouda14@gmail.com`)  
**Operating Environment**: Windows 11 (NT 10.0.26100), macOS, or Linux  

---

## 1. System Prerequisites

- **Node.js**: v18.0.0 or higher (`v26.13.0` verified on current host; LTS 20 or 22 also supported)
- **npm**: v9.0.0 or higher (`v11.20.0` verified)
- **Memory**: Minimum 2 GB RAM (4 GB recommended)
- **Disk Space**: ~500 MB for `node_modules` and SQLite database

---

## 2. Quick Setup Instructions

### Step 1: Open Terminal in Workspace Directory
```powershell
cd "f:\work Aya"
```

### Step 2: Install Project Dependencies
```powershell
npm install
```
*All required libraries including Next.js 16, React 19, better-sqlite3, Tailwind CSS, Lucide icons, and Zod are installed.*

### Step 3: Run the Automated Test Suite (19 Suites)
```powershell
npm test
```
*Executes all 19 test suites verifying database integrity, onboarding gating, ATS scoring, 8-criterion matching, real resume extraction, security firewalls, and browser rendering across all 21 pages.*

### Step 4: Run the Production Build
```powershell
npm run build
```
*Compiles all 21 static web pages and 28 REST API routes with zero errors.*

### Step 5: Start the Application Server
```powershell
npm start
```
*Launches the optimized production server on port 3000.*

### Step 6: Access the Web Interface
Open your browser and navigate to:  
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 3. Verification Checklist

- [x] SQLite database active at `data/career_app.db` with WAL mode.
- [x] Candidate profile confirmed for **Aya Hamouda Mahmoud Ali** (`Ayahamouda14@gmail.com`).
- [x] All 21 web routes returning HTTP 200 with complete layouts.
- [x] Human Approval Center gate active before any application submission or email dispatch.
- [x] All 19 test suites passing with 0 defects.
