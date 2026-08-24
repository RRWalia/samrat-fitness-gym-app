# Samrat Fitness Gym App

> **QR Attendance | Early Churn Detection | Renewal System | Add-on Marketplace**
> 
> A practical retention system for local Indian gyms (Samrat Fitness King) to detect silent member churn early, make attendance visible, improve timely renewals, and offer relevant add-ons transparently.

---

## 📋 Project Overview

This app solves the hidden problem of silent churn in gyms: members quietly disappearing before owners notice missed payments.

### The Operating Loop

```text
Record Attendance ➔ Detect Risk ➔ Contact Early ➔ Bring Member Back ➔ Collect Renewal On Time ➔ Deliver Useful Add-ons ➔ Show Owner What Worked
```

### Key Value Proposition

* **Visibility:** Know which members haven't attended in 10+ days.
* **Early Intervention:** Automated red-list with daily call queue.
* **Retention:** Streak tracking to encourage consistent attendance.
* **Revenue:** Timely renewal reminders + transparent add-on marketplace.
* **Trust:** No aggressive selling, no hidden terms, audit trail for all actions.

---

## 🔐 Staff Authentication & Role-Based Access

The staff web app now starts at a secure User ID/password portal. Passwords are stored only as bcrypt hashes, successful logins receive short-lived signed JWTs, and every JWT must also map to a live server-side session. Logout, password reset, account deactivation, or a role change revokes access immediately.

| Staff role | Server-enforced access |
| :--- | :--- |
| **Owner / Manager** | Full dashboard, financial metrics, member records, renewals, settings, audit trail, and staff access management |
| **Front Desk** | Rotating QR kiosk, assisted check-in, recent attendance, and a redacted member lookup; financial and settings APIs return `403` |
| **Trainer** | Only PT orders and member profiles assigned to that account's `trainer_id`; prices and unrelated customers are omitted |

Every `/api/*` business route requires `Authorization: Bearer <token>`. Only `/api/auth/login` and the metadata-only `/api/health` probe are public. JWTs contain no customer or payment data; HTTPS encrypts them in transit in production.

### Local development

Node.js **22.12.0 or newer** is required. Vite 8 (`^20.19.0 || >=22.12.0`) and `better-sqlite3` 13 (`>=22`) both refuse older runtimes. The pinned version lives in `.node-version` (read by Render and by `nodenv`/`fnm`/`nvm`) and the accepted range in `package.json` → `engines`.

```bash
npm run install:all
npm run dev:backend       # API + SQLite on port 5001
npm run dev:frontend      # Vite UI on port 3000
```

`install:all` runs `npm ci --ignore-scripts`. Both native modules (`better-sqlite3`, `bcrypt`) ship prebuilt binaries for glibc *and* musl, so no C toolchain (`python3`/`make`/`g++`) is needed in the build image — keep `--ignore-scripts` in place, otherwise npm synthesises a `node-gyp rebuild` step for `better-sqlite3` and the deploy fails where a compiler is absent.

The frontend install also passes `--include=dev`: `render.yaml` sets `NODE_ENV=production` service-wide, and with that set `npm ci` silently skips `devDependencies` — which is where all the build tooling lives (`vite`, `@vitejs/plugin-react`, `tailwindcss`). Without it, `vite` still arrives as an auto-installed peer of the production package `@tailwindcss/vite`, so the build starts and then dies with `ERR_MODULE_NOT_FOUND: Cannot find package '@vitejs/plugin-react'`. The backend needs no flag — it has no `devDependencies`.

On a new **non-production** database, these demo accounts are created:

| Role | User ID | Password |
| :--- | :--- | :--- |
| Owner | `Ashish` | `Owner@2026!Gym` |
| Manager | `Parmar` | `Manager@2026!` |
| Front Desk | `frontdesk` | `Desk@2026!Gym` |
| Trainer — Sona Walia (Trainer ID 101) | `sona.walia` | `Trainer@2026!` |

These demo passwords are never created automatically in production. For a direct deployment, set a random `JWT_SECRET` (32+ characters) and the required `INITIAL_*_PASSWORD` values before the first production start; see `.env.example`. The Render Blueprint instead generates independent, high-entropy JWT and bootstrap passwords for all four staff roles—no production password is stored in Git. An authorized Render administrator can reveal/copy those generated `INITIAL_*_PASSWORD` values from the service's **Environment** page. Additional accounts can then be managed under **Management Dashboard → Staff Access**.

Run the authentication/RBAC integration suite with:

```bash
cd backend && npm test
```

---

## 🎯 Core Features

### 1. No-show Red List 📛
* Automatic detection of members absent for 10+ days.
* Configurable thresholds (10–14d, 15–21d, 22+d filters).
* Call/WhatsApp actions with outcome tracking.
* **Follow-up outcomes:** Will return, Injured, Travelling, Timing issue, Unhappy, No response, Cancelled.
* Next action date scheduling.

### 2. QR Check-in & Streak 🎯
* Rotating/session-bound QR codes (no permanent screenshot reuse).
* Duplicate scan prevention within configurable window.
* **Fair streak rules:**
  * Planned-visit streak (recommended)
  * Weekly goal (e.g., 4 of 4 visits)
  * Calendar streak (for challenges only)
* Rest days and approved pauses do not break streaks.
* Offline fallback queue with sync.

### 3. Auto Renewal System 💳
* 7-day reminder before expiry (configurable: 14d, 7d, 3d, 0d).
* Clear plan options: 3-month, 6-month, 12-month.
* Final payable amount with discounts shown.
* **Payment integrity:** Membership extends ONLY after verified payment.
* **States:** `Created` ➔ `Pending` ➔ `Paid` ➔ `Failed` ➔ `Refunded` ➔ `Reversed`.
* Downloadable receipts.
* Webhook-based verification (idempotent handling).

### 4. Add-on Marketplace 🛒
* **Categories:** Personal Training, Diet Plans, Protein & Supplements.
* Never pre-selected — members opt-in only.
* Clear pricing, validity, trainer qualifications.
* Stock status for products.
* Usage tracking for PT packages.
* Cancellation terms shown before purchase.

---

## 👥 User Roles & Permissions

| Role | Access | Key Actions |
| :--- | :--- | :--- |
| **Member** | Mobile App Simulator (management only) | QR check-in, view streak, renew, browse add-ons, notification preferences |
| **Owner / Manager** | Web | Full dashboard, financials, members/plans, settings, staff credentials, and audit logs |
| **Front Desk** | Web / Tablet | Redacted member lookup, rotating QR kiosk, assisted check-in, and recent gate activity only |
| **Trainer** | Web / Mobile | View only assigned PT clients and update their PT session usage |

---

## 🗃️ Database Schema

### Core Tables (MySQL / PostgreSQL)

```sql
-- Staff authentication (actual SQLite implementation)
CREATE TABLE Users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner', 'manager', 'front_desk', 'trainer')),
  trainer_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  token_version INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT
);

CREATE TABLE AuthSessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  jti_hash TEXT NOT NULL UNIQUE,
  remember_me INTEGER NOT NULL DEFAULT 0,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

-- 1. Members
CREATE TABLE Members (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(15) NOT NULL UNIQUE,
  email VARCHAR(100),
  consent BOOLEAN DEFAULT FALSE,
  join_date DATE NOT NULL,
  status ENUM('Active', 'Paused', 'Expired', 'Cancelled', 'Blocked') DEFAULT 'Active',
  assigned_trainer_id INT,
  risk_state VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Plans
CREATE TABLE Plans (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL,
  duration_months INT NOT NULL,
  base_price DECIMAL(10,2) NOT NULL,
  discount DECIMAL(10,2) DEFAULT 0,
  benefits TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Memberships
CREATE TABLE Memberships (
  id INT PRIMARY KEY AUTO_INCREMENT,
  member_id INT NOT NULL,
  plan_id INT NOT NULL,
  start_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  status ENUM('Pending', 'Active', 'Frozen', 'Expired', 'Cancelled') DEFAULT 'Pending',
  freeze_dates JSON,
  renewal_source VARCHAR(20),
  FOREIGN KEY (member_id) REFERENCES Members(id),
  FOREIGN KEY (plan_id) REFERENCES Plans(id)
);

-- 4. Attendance
CREATE TABLE Attendance (
  id INT PRIMARY KEY AUTO_INCREMENT,
  member_id INT NOT NULL,
  check_in_time DATETIME NOT NULL,
  source ENUM('QR', 'Assisted', 'Manual') DEFAULT 'QR',
  qr_session VARCHAR(50),
  correction_reason VARCHAR(100),
  staff_actor_id INT,
  FOREIGN KEY (member_id) REFERENCES Members(id)
);

-- 5. Streaks
CREATE TABLE Streaks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  member_id INT NOT NULL,
  rule_type ENUM('Visit', 'Weekly', 'Calendar') DEFAULT 'Visit',
  target INT DEFAULT 4,
  current_value INT DEFAULT 0,
  best_value INT DEFAULT 0,
  last_update DATE,
  FOREIGN KEY (member_id) REFERENCES Members(id)
);

-- 6. No-Show Cases
CREATE TABLE NoShowCases (
  id INT PRIMARY KEY AUTO_INCREMENT,
  member_id INT NOT NULL,
  threshold_date DATE NOT NULL,
  risk_days INT DEFAULT 10,
  owner_id INT,
  status ENUM('Open', 'Contacted', 'Follow-up due', 'Returned', 'Closed') DEFAULT 'Open',
  next_action_date DATE,
  FOREIGN KEY (member_id) REFERENCES Members(id)
);

-- 7. Follow-ups
CREATE TABLE FollowUps (
  id INT PRIMARY KEY AUTO_INCREMENT,
  case_id INT NOT NULL,
  channel ENUM('Call', 'WhatsApp', 'Email', 'SMS') NOT NULL,
  outcome ENUM('Will return', 'Injured', 'Travelling', 'Timing issue', 'Unhappy', 'No response', 'Cancelled'),
  notes TEXT,
  staff_id INT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  next_action_date DATE,
  FOREIGN KEY (case_id) REFERENCES NoShowCases(id)
);

-- 8. Payments
CREATE TABLE Payments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  member_id INT NOT NULL,
  order_id INT,
  provider_reference VARCHAR(100),
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('Created', 'Pending', 'Paid', 'Failed', 'Refunded', 'Reversed') DEFAULT 'Created',
  verified_time DATETIME,
  FOREIGN KEY (member_id) REFERENCES Members(id)
);

-- 9. Renewal Orders
CREATE TABLE RenewalOrders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  membership_id INT NOT NULL,
  selected_plan_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  discount DECIMAL(10,2) DEFAULT 0,
  payment_id INT,
  status ENUM('Pending', 'Paid', 'Failed', 'Cancelled') DEFAULT 'Pending',
  FOREIGN KEY (membership_id) REFERENCES Memberships(id),
  FOREIGN KEY (selected_plan_id) REFERENCES Plans(id),
  FOREIGN KEY (payment_id) REFERENCES Payments(id)
);

-- 10. Add-ons
CREATE TABLE AddOns (
  id INT PRIMARY KEY AUTO_INCREMENT,
  type ENUM('PT', 'Diet', 'Product') NOT NULL,
  title VARCHAR(100) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  validity_days INT,
  capacity INT,
  stock INT,
  active BOOLEAN DEFAULT TRUE,
  trainer_id INT,
  qualifications TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Add-on Orders
CREATE TABLE AddOnOrders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  member_id INT NOT NULL,
  addon_id INT NOT NULL,
  trainer_product_id INT,
  quantity INT DEFAULT 1,
  amount DECIMAL(10,2) NOT NULL,
  usage INT DEFAULT 0,
  status ENUM('Pending', 'Paid', 'Active', 'Completed', 'Cancelled', 'Refunded') DEFAULT 'Pending',
  FOREIGN KEY (member_id) REFERENCES Members(id),
  FOREIGN KEY (addon_id) REFERENCES AddOns(id)
);

-- 12. Notifications
CREATE TABLE Notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  member_id INT NOT NULL,
  template VARCHAR(50) NOT NULL,
  channel ENUM('App', 'SMS', 'Email', 'WhatsApp') DEFAULT 'App',
  scheduled_time DATETIME,
  delivery_status ENUM('Scheduled', 'Sent', 'Delivered', 'Failed', 'Clicked', 'Converted', 'Opted out') DEFAULT 'Scheduled',
  FOREIGN KEY (member_id) REFERENCES Members(id)
);

-- 13. Settings
CREATE TABLE Settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  gym_name VARCHAR(100) NOT NULL,
  gym_address TEXT,
  gym_hours VARCHAR(100),
  timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
  no_show_threshold INT DEFAULT 10,
  streak_rule ENUM('Visit', 'Weekly', 'Calendar') DEFAULT 'Visit',
  renewal_reminder_days JSON DEFAULT '[14, 7, 3, 0]',
  duplicate_scan_window_minutes INT DEFAULT 30
);

-- 14. Audit Logs
CREATE TABLE AuditLogs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  actor_id INT,
  actor_type ENUM('Member', 'Staff', 'Owner', 'System') NOT NULL,
  action VARCHAR(100) NOT NULL,
  record_type VARCHAR(50) NOT NULL,
  record_id INT NOT NULL,
  before_summary JSON,
  after_summary JSON,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## ⚙️ Automations

### 1. Daily No-show Scan
* **Trigger:** Cron job every morning (gym timezone).
* **Action:**
  * Exclude paused, frozen, expired, cancelled memberships.
  * Calculate days since last valid attendance.
  * Open one no-show case when threshold (10d) is crossed.
  * Never create duplicate open cases.

### 2. Valid QR Check-in
* **Trigger:** QR scan at gym gate.
* **Action:**
  * Verify QR session and active membership.
  * Reject duplicate scan within window (default: 30 min).
  * Save attendance timestamp.
  * Update streak/weekly goal.
  * Resolve open no-show case if appropriate.

### 3. Renewal Reminders
* **Trigger:** Membership expiry date.
* **Action:**
  * Select memberships expiring in configured windows (14d, 7d, 3d, 0d).
  * Send one message per stage.
  * Stop reminders after: verified payment, cancellation, or opt-out.
  * Escalate failed payment separately.

### 4. Payment Confirmation
* **Trigger:** Webhook from payment provider.
* **Action:**
  * Receive verified provider result.
  * Mark payment as `PAID` exactly once (idempotent).
  * Activate/extend membership or add-on.
  * Generate receipt.
  * Update owner dashboard.

### 5. Daily Owner Summary
* **Trigger:** Cron job at gym closing time.
* **Action:**
  * Today's check-ins count.
  * New red-list members.
  * Follow-ups completed and due.
  * Renewals paid and pending.
  * Add-on orders and utilisation alerts.
  * Tomorrow's expected PT sessions.

### 6. Data Quality Alerts
* **Trigger:** On data changes.
* **Action:**
  * Membership without expiry date.
  * Paid order without provider reference.
  * Attendance correction without reason.
  * Negative product stock.
  * Trainer double booking.

---

## 📊 Dashboard & KPIs

### Owner Dashboard - Top Cards
* Active members
* Today's check-ins
* 7-day active members
* Open no-show cases
* Members returned after follow-up
* Renewals due in 7 days
* Renewal amount collected
* Add-on revenue this month

### Key Metrics

| Metric | Formula | Target |
| :--- | :--- | :--- |
| **Attendance activity rate** | Members with ≥1 visit / Active members | >80% |
| **No-show recovery rate** | Returned red-list / Contacted red-list | >50% |
| **Renewal rate** | Renewed / Eligible expiring | >70% |
| **On-time renewal rate** | Renewed before expiry / Renewed | >80% |
| **Add-on conversion rate** | Purchased / Shown offers | >20% |

---

## 💬 Message Templates

### 1. No-show Care Message
```text
Hi {{name}},

Your last gym check-in was on {{last_visit}}. Everything okay? 
If you need help with timing, pause, or trainer support, reply here: {{support_link}}
```

### 2. Renewal Reminder
```text
Hi {{name}},

Your {{plan}} membership expires on {{expiry_date}}.
Review your renewal options and final payable amount here: {{renewal_link}}
```

### 3. Payment Success
```text
✅ ₹{{amount}} payment received.
Your membership is now active until {{new_expiry}}.
Download receipt: {{receipt_link}}
```

### 4. Payment Failed
```text
⚠️ Payment incomplete.
If any amount was debited, wait for provider status update.
Retry: {{payment_link}} | Help: {{support_link}}
```

### 5. Streak Message
```text
🎉 Great work, {{name}}!
You completed {{completed}}/{{target}} planned visits this week.
Next planned visit: {{next_visit}}.
```

### 6. PT Session Reminder
```text
📅 Your PT session is booked on {{date}} at {{time}} with {{trainer}}.
Reschedule: {{session_link}}
```

---

## 🚀 Implementation Roadmap

### Phase 1: MVP (7-Day Prototype)
* **Day 1:** Gym setup + data model
* **Day 2:** Member & membership profiles
* **Day 3:** QR attendance system
* **Day 4:** Red-list + follow-up
* **Day 5:** Streak + renewal
* **Day 6:** Add-ons + owner dashboard
* **Day 7:** Failure-state testing

### Phase 2: Pilot (30 Days)
* **Week 1:** Setup + staff training
* **Week 2:** Activate red-list recovery
* **Week 3:** Start renewal reminders + add-ons
* **Week 4:** Measure results

### Phase 3: Post-Pilot (After Validation)
* Full trainer mobile app
* Workout programming & exercise library
* Body measurement tracking
* Wearable integrations
* Multi-branch support
* Advanced commissions & payroll
* AI recommendations
* Community challenges
* Referral rewards

---

## 📁 Project Structure

```text
samrat-fitness-gym-app/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── attendance.controller.js
│   │   │   ├── members.controller.js
│   │   │   ├── payments.controller.js
│   │   │   └── renewals.controller.js
│   │   ├── models/
│   │   │   ├── Member.js
│   │   │   ├── Attendance.js
│   │   │   └── index.js
│   │   ├── routes/
│   │   │   └── api.js
│   │   ├── services/
│   │   │   ├── automation.service.js
│   │   │   └── notification.service.js
│   │   └── config/
│   │       └── database.js
│   ├── package.json
│   └── server.js
│
├── frontend/
│   ├── mobile/ (React Native/Flutter)
│   │   ├── screens/
│   │   │   ├── CheckInScreen.js
│   │   │   ├── DashboardScreen.js
│   │   │   ├── RenewalScreen.js
│   │   │   └── RedListScreen.js
│   │   ├── navigation/
│   │   └── App.js
│   └── web/ (React for owner dashboard)
│       ├── src/
│       │   ├── components/
│       │   └── pages/
│       └── public/
│
├── scripts/
│   ├── automations/
│   │   ├── dailyNoShowScan.js
│   │   ├── paymentWebhook.js
│   │   └── renewalReminders.js
│   └── dataMigration.js
│
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
```

---

## 🛠️ Tech Stack Recommendations

### Backend Options

| Option | Pros | Cons |
| :--- | :--- | :--- |
| **Node.js + Express + MySQL** | Fast development, widely used | Need to manage connections |
| **Python + FastAPI + PostgreSQL** | Great for data, async support | Slightly steeper learning curve |
| **Firebase** | Realtime updates, easy setup | Vendor lock-in, cost at scale |
| **Supabase** | Open-source Firebase alternative | Newer ecosystem |

### Mobile App Options

| Option | Pros | Cons |
| :--- | :--- | :--- |
| **React Native** | Cross-platform, large community | Native features need bridges |
| **Flutter** | Beautiful UI, single codebase | Dart language learning curve |
| **Native (Kotlin/Swift)** | Best performance | Separate codebases |

### Payment Gateways (India)
* **Razorpay** (Recommended)
* **PayU**
* **Cashfree**
* **Stripe** (for international)

---

## 🔐 Security & Compliance

### Must Follow
* ❌ Never store raw card numbers or UPI credentials.
* ✅ Payment provider is source of truth for payment status.
* ✅ Verify payment via webhook before extending membership.
* ✅ Idempotent webhook handling (prevent duplicate processing).
* ✅ Audit logs for all financial and attendance corrections.
* ✅ Separate marketing consent from service communications.
* ✅ Support opt-out for all notifications.

### QR Security
* Use rotating/session-bound QR codes.
* Reject duplicate scans within window (default: 30 minutes).
* Provide assisted check-in fallback with mandatory reason.
* Offline queue with sync and audit stamp.

---

## 📝 Pre-Development Checklist

Before starting development, confirm with gym owner:
1. How many active, paused, and expired members today?
2. How is attendance currently registered? (register, card, biometric, app)
3. How many absent days should trigger first follow-up? (default: 10)
4. Which pause reasons are allowed and who approves them?
5. All membership plans, prices, discounts, and freeze rules.
6. When should renewal reminders start? (default: 7 days before)
7. Which payment provider and receipt process to use?
8. Who will call red-list members and record outcomes?
9. Which streak rule is fair for different training schedules?
10. How do PT packages work? (sessions, validity, trainer allocation)
11. Who will deliver diet advice? (qualified professional required)
12. Who will manage supplement stock, invoice, return, expiry?
13. Which 5 numbers does the owner need every day?
14. How have members given communication consent?
15. What is the measurable definition of pilot success?

---

## 💰 Pricing Model

### Sample Pricing (from Blueprint)
* **One-time build:** ₹10,000
* **Monthly maintenance:** ₹500

### Real Quote Factors
* Payment integration complexity
* Messaging (SMS/WhatsApp) costs
* Member data import
* Biometric/QR hardware integration
* App store release (if needed)
* Support level
* Custom roles/permissions

### Value Calculation
* 1 member: ₹1,000/month
* 10 members retained for 12 months = ₹120,000 gross
* Conservative estimate: ~₹1,00,000 value
* *(Note: This is an estimate based on retention impact — depends on gym execution)*

---

## 📞 Contact
* **Owner:** Randeep Walia ([RRWalia](https://github.com/RRWalia))
* **GitHub:** [https://github.com/RRWalia/samrat-fitness-gym-app](https://github.com/RRWalia/samrat-fitness-gym-app)

---

## 🤝 Contributing
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📜 License
Distributed under the MIT License. See `LICENSE` for more information.

---

> 💡 **Key Insight:** The value is not the app screens themselves, but the connected operating loop that helps gyms retain members and collect renewals on time. Build and test that loop first. Everything else is optional.
