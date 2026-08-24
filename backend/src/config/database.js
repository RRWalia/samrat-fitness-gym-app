const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../../gym.db');
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for high performance and integrity
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

function initDatabase() {
  db.exec(`
    -- 1. Members
    CREATE TABLE IF NOT EXISTS Members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      email TEXT,
      consent INTEGER DEFAULT 1,
      join_date TEXT NOT NULL,
      status TEXT CHECK(status IN ('Active', 'Paused', 'Expired', 'Cancelled', 'Blocked')) DEFAULT 'Active',
      assigned_trainer_id INTEGER,
      risk_state TEXT DEFAULT 'Normal',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 2. Plans
    CREATE TABLE IF NOT EXISTS Plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      duration_months INTEGER NOT NULL,
      base_price REAL NOT NULL,
      discount REAL DEFAULT 0,
      benefits TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 3. Memberships
    CREATE TABLE IF NOT EXISTS Memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      status TEXT CHECK(status IN ('Pending', 'Active', 'Frozen', 'Expired', 'Cancelled')) DEFAULT 'Pending',
      freeze_dates TEXT,
      renewal_source TEXT,
      FOREIGN KEY (member_id) REFERENCES Members(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES Plans(id)
    );

    -- 4. Attendance
    CREATE TABLE IF NOT EXISTS Attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      check_in_time TEXT NOT NULL,
      source TEXT CHECK(source IN ('QR', 'Assisted', 'Manual')) DEFAULT 'QR',
      qr_session TEXT,
      correction_reason TEXT,
      staff_actor_id INTEGER,
      FOREIGN KEY (member_id) REFERENCES Members(id) ON DELETE CASCADE
    );

    -- 5. Streaks
    CREATE TABLE IF NOT EXISTS Streaks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL UNIQUE,
      rule_type TEXT CHECK(rule_type IN ('Visit', 'Weekly', 'Calendar')) DEFAULT 'Weekly',
      target INTEGER DEFAULT 4,
      current_value INTEGER DEFAULT 0,
      best_value INTEGER DEFAULT 0,
      last_update TEXT,
      FOREIGN KEY (member_id) REFERENCES Members(id) ON DELETE CASCADE
    );

    -- 6. No-Show Cases
    CREATE TABLE IF NOT EXISTS NoShowCases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      threshold_date TEXT NOT NULL,
      risk_days INTEGER DEFAULT 10,
      owner_id INTEGER,
      status TEXT CHECK(status IN ('Open', 'Contacted', 'Follow-up due', 'Returned', 'Closed')) DEFAULT 'Open',
      next_action_date TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (member_id) REFERENCES Members(id) ON DELETE CASCADE
    );

    -- 7. Follow-ups
    CREATE TABLE IF NOT EXISTS FollowUps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL,
      channel TEXT CHECK(channel IN ('Call', 'WhatsApp', 'Email', 'SMS')) NOT NULL,
      outcome TEXT CHECK(outcome IN ('Will return', 'Injured', 'Travelling', 'Timing issue', 'Unhappy', 'No response', 'Cancelled')),
      notes TEXT,
      staff_id INTEGER NOT NULL,
      timestamp TEXT DEFAULT (datetime('now', 'localtime')),
      next_action_date TEXT,
      FOREIGN KEY (case_id) REFERENCES NoShowCases(id) ON DELETE CASCADE
    );

    -- 8. Payments
    CREATE TABLE IF NOT EXISTS Payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      order_id INTEGER,
      provider_reference TEXT,
      amount REAL NOT NULL,
      status TEXT CHECK(status IN ('Created', 'Pending', 'Paid', 'Failed', 'Refunded', 'Reversed')) DEFAULT 'Created',
      verified_time TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (member_id) REFERENCES Members(id) ON DELETE CASCADE
    );

    -- 9. Renewal Orders
    CREATE TABLE IF NOT EXISTS RenewalOrders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      membership_id INTEGER NOT NULL,
      selected_plan_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      discount REAL DEFAULT 0,
      payment_id INTEGER,
      status TEXT CHECK(status IN ('Pending', 'Paid', 'Failed', 'Cancelled')) DEFAULT 'Pending',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (membership_id) REFERENCES Memberships(id) ON DELETE CASCADE,
      FOREIGN KEY (selected_plan_id) REFERENCES Plans(id),
      FOREIGN KEY (payment_id) REFERENCES Payments(id)
    );

    -- 10. Add-ons
    CREATE TABLE IF NOT EXISTS AddOns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT CHECK(type IN ('PT', 'Diet', 'Product')) NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      validity_days INTEGER,
      capacity INTEGER,
      stock INTEGER,
      active INTEGER DEFAULT 1,
      trainer_id INTEGER,
      qualifications TEXT,
      image_url TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 11. Add-on Orders
    CREATE TABLE IF NOT EXISTS AddOnOrders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      addon_id INTEGER NOT NULL,
      trainer_product_id INTEGER,
      quantity INTEGER DEFAULT 1,
      amount REAL NOT NULL,
      usage INTEGER DEFAULT 0,
      max_usage INTEGER DEFAULT 1,
      status TEXT CHECK(status IN ('Pending', 'Paid', 'Active', 'Completed', 'Cancelled', 'Refunded')) DEFAULT 'Pending',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (member_id) REFERENCES Members(id) ON DELETE CASCADE,
      FOREIGN KEY (addon_id) REFERENCES AddOns(id)
    );

    -- 12. Notifications
    CREATE TABLE IF NOT EXISTS Notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      template TEXT NOT NULL,
      channel TEXT CHECK(channel IN ('App', 'SMS', 'Email', 'WhatsApp')) DEFAULT 'App',
      message_content TEXT,
      scheduled_time TEXT,
      delivery_status TEXT CHECK(delivery_status IN ('Scheduled', 'Sent', 'Delivered', 'Failed', 'Clicked', 'Converted', 'Opted out')) DEFAULT 'Scheduled',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (member_id) REFERENCES Members(id) ON DELETE CASCADE
    );

    -- 13. Settings
    CREATE TABLE IF NOT EXISTS Settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gym_name TEXT NOT NULL DEFAULT 'Samrat Fitness King',
      gym_address TEXT DEFAULT 'Main Market Road, Near City Center, Ahmedabad, Gujarat',
      gym_hours TEXT DEFAULT '5:30 AM - 10:30 PM (Mon-Sat), 6:00 AM - 1:00 PM (Sun)',
      timezone TEXT DEFAULT 'Asia/Kolkata',
      no_show_threshold INTEGER DEFAULT 10,
      streak_rule TEXT CHECK(streak_rule IN ('Visit', 'Weekly', 'Calendar')) DEFAULT 'Weekly',
      renewal_reminder_days TEXT DEFAULT '[14, 7, 3, 0]',
      duplicate_scan_window_minutes INTEGER DEFAULT 30
    );

    -- 14. Audit Logs
    CREATE TABLE IF NOT EXISTS AuditLogs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER,
      actor_type TEXT CHECK(actor_type IN ('Member', 'Staff', 'Owner', 'System')) NOT NULL,
      action TEXT NOT NULL,
      record_type TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      before_summary TEXT,
      after_summary TEXT,
      timestamp TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Ensure default settings exist
  const existingSettings = db.prepare('SELECT id FROM Settings LIMIT 1').get();
  if (!existingSettings) {
    db.prepare(`
      INSERT INTO Settings (gym_name, gym_address, gym_hours, timezone, no_show_threshold, streak_rule, renewal_reminder_days, duplicate_scan_window_minutes)
      VALUES ('Samrat Fitness King', 'Main Market Road, Near City Center, Ahmedabad, Gujarat', '5:30 AM - 10:30 PM (Mon-Sat), 6:00 AM - 1:00 PM (Sun)', 'Asia/Kolkata', 10, 'Weekly', '[14, 7, 3, 0]', 30)
    `).run();
  }
}

function logAudit(actorId, actorType, action, recordType, recordId, beforeSummary = null, afterSummary = null) {
  try {
    db.prepare(`
      INSERT INTO AuditLogs (actor_id, actor_type, action, record_type, record_id, before_summary, after_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      actorId || 1,
      actorType || 'System',
      action,
      recordType,
      recordId,
      beforeSummary ? JSON.stringify(beforeSummary) : null,
      afterSummary ? JSON.stringify(afterSummary) : null
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

module.exports = {
  db,
  initDatabase,
  logAudit
};
