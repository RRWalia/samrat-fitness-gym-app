const { db, logAudit } = require('../config/database');
const { actorTypeForRole } = require('../auth/roles');
const { normalizePhone } = require('../auth/phone');
const { parseCsv, MAX_IMPORT_ROWS } = require('../services/csv.service');

// Columns the downloadable template exposes, in the order owners should fill them.
const TEMPLATE_COLUMNS = ['name', 'phone', 'email', 'plan_name', 'join_date', 'expiry_date', 'status'];

// name, phone, email, plan index, join date, expiry date, status.
// The plan cell is replaced at download time with the gym's real active plan names.
const TEMPLATE_ROWS = [
  ['Arjun Patel', '9876543210', 'arjun.patel@gmail.com', 0, '15/06/2026', '15/07/2026', 'Active'],
  ['Priya Sharma', '+91 98123 45678', 'priya.sharma@gmail.com', 1, '01/07/2026', '', 'Active'],
  ['Rohan Gupta', '9988776655', '', 2, '10/01/2026', '', 'Paused'],
  ['Neha Desai', '9911223344', 'neha.desai@gmail.com', 3, '05/03/2026', '', 'Active']
];

const MEMBER_STATUSES = ['Active', 'Paused', 'Expired', 'Cancelled', 'Blocked'];
const STATUS_ALIASES = {
  active: 'Active',
  paid: 'Active',
  ongoing: 'Active',
  running: 'Active',
  paused: 'Paused',
  hold: 'Paused',
  'on hold': 'Paused',
  frozen: 'Paused',
  expired: 'Expired',
  lapsed: 'Expired',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
  blocked: 'Blocked',
  blacklisted: 'Blocked'
};

// Member status -> membership row status, mirroring the member status toggle rules.
const MEMBERSHIP_STATUS_FOR_MEMBER = {
  Active: 'Active',
  Paused: 'Frozen',
  Expired: 'Expired',
  Cancelled: 'Cancelled',
  Blocked: 'Active'
};

const ERROR_PREVIEW_LIMIT = 100;
const ROW_PREVIEW_LIMIT = 200;

function todayIso() {
  const now = new Date();
  return formatLocalDate(now);
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Accepts DD/MM/YYYY (Indian sheets) and YYYY-MM-DD (exports), rejects impossible dates.
function parseImportDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const localMatch = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);

  let year;
  let month;
  let day;
  if (isoMatch) {
    [, year, month, day] = isoMatch;
  } else if (localMatch) {
    [, day, month, year] = localMatch;
    if (year.length === 2) year = `20${year}`;
  } else {
    return { error: 'Use DD/MM/YYYY or YYYY-MM-DD.' };
  }

  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) {
    return { error: 'Date does not exist on the calendar.' };
  }
  return { iso: formatLocalDate(parsed) };
}

function addMonths(isoDate, months) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const target = new Date(year, month - 1 + months, day);
  // 31 Jan + 1 month must clamp to 28/29 Feb instead of rolling into March.
  if (target.getDate() !== day) target.setDate(0);
  return formatLocalDate(target);
}

function normalizePlanKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function inferPlanDuration(planName) {
  const text = String(planName || '').toLowerCase();
  const monthMatch = text.match(/(\d{1,2})\s*(?:mo|month)/);
  if (monthMatch) return Number(monthMatch[1]);
  if (/\bannual\b|\byearly\b|12\s*mo/.test(text)) return 12;
  if (/\bhalf[- ]?year\b|6\s*mo/.test(text)) return 6;
  if (/\bquarter|3\s*mo/.test(text)) return 3;
  if (/\bmonthly\b|1\s*mo/.test(text)) return 1;
  return null;
}

function resolvePlan(planName, plans) {
  const wanted = normalizePlanKey(planName);
  if (!wanted) return { plan: plans.find(entry => entry.isShortest) || plans[0] || null, reason: null };

  const exact = plans.find(entry => entry.key === wanted);
  if (exact) return { plan: exact.plan, reason: null };

  const byDuration = inferPlanDuration(planName);
  if (byDuration) {
    const candidates = plans.filter(entry => entry.plan.duration_months === byDuration);
    if (candidates.length === 1) return { plan: candidates[0].plan, reason: `matched by ${byDuration}-month duration` };
    if (candidates.length > 1) {
      return { plan: null, reason: `${candidates.length} plans are ${byDuration} months long` };
    }
  }
  return { plan: null, reason: null };
}

function loadPlans() {
  const plans = db.prepare('SELECT * FROM Plans WHERE active = 1 ORDER BY duration_months ASC, id ASC').all();
  const shortest = plans.reduce((best, plan) => (!best || plan.duration_months < best.duration_months ? plan : best), null);
  return plans.map(plan => ({
    plan,
    key: normalizePlanKey(plan.name),
    isShortest: Boolean(shortest && plan.id === shortest.id)
  }));
}

function loadMembersByPhone() {
  const rows = db.prepare('SELECT id, phone, name FROM Members').all();
  const map = new Map();
  for (const row of rows) {
    const key = normalizePhone(row.phone) || row.phone;
    if (!map.has(key)) map.set(key, row);
  }
  return map;
}

function validateRecord(record, { plans, membersByPhone, seenPhones, duplicateMode, availablePlanNames }) {
  const issues = [];
  const name = record.name;
  const rawPhone = record.phone;

  if (!name) issues.push('Name is missing.');

  const phone = normalizePhone(rawPhone);
  if (rawPhone && !phone) issues.push(`Phone "${rawPhone}" is not a valid 7–15 digit number.`);
  if (!rawPhone) issues.push('Phone is missing.');

  let email = record.email ? record.email : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    issues.push(`Email "${email}" is not valid.`);
    email = null;
  }

  let status = 'Active';
  if (record.status) {
    const mapped = STATUS_ALIASES[normalizePlanKey(record.status)] || STATUS_ALIASES[String(record.status).trim().toLowerCase()];
    if (mapped) {
      status = mapped;
    } else {
      issues.push(`Status "${record.status}" is not recognised (use ${MEMBER_STATUSES.join(', ')}).`);
    }
  }

  let joinDate = todayIso();
  if (record.join_date) {
    const parsed = parseImportDate(record.join_date);
    if (parsed.error) issues.push(`Join date "${record.join_date}" is invalid. ${parsed.error}`);
    else joinDate = parsed.iso;
  }

  const planLookup = resolvePlan(record.plan_name, plans);
  let plan = planLookup.plan;
  if (!plan) {
    const detail = planLookup.reason ? ` (${planLookup.reason})` : '';
    issues.push(`Plan "${record.plan_name || '(blank)'}" was not found${detail}. Available plans: ${availablePlanNames.join(', ') || 'none active'}.`);
  }

  let expiryDate = null;
  if (record.expiry_date) {
    const parsed = parseImportDate(record.expiry_date);
    if (parsed.error) issues.push(`Expiry date "${record.expiry_date}" is invalid. ${parsed.error}`);
    else expiryDate = parsed.iso;
  } else if (plan) {
    expiryDate = addMonths(joinDate, plan.duration_months);
  }

  if (expiryDate && expiryDate < joinDate) {
    issues.push(`Expiry date ${expiryDate} is before the join date ${joinDate}.`);
  }

  const existing = phone ? membersByPhone.get(phone) : null;
  const duplicatedInFile = phone ? seenPhones.has(phone) : false;
  if (phone && !duplicatedInFile) seenPhones.add(phone);

  if (issues.length > 0) {
    return { rowNumber: record.rowNumber, name, phone: phone || rawPhone || null, action: 'error', issues };
  }

  if (duplicatedInFile) {
    return {
      rowNumber: record.rowNumber,
      name,
      phone,
      action: 'skip',
      issues: [`Phone ${phone} appears more than once in this file. Only the first row was kept.`]
    };
  }

  if (existing && duplicateMode === 'skip-existing') {
    return {
      rowNumber: record.rowNumber,
      name: existing.name,
      phone,
      action: 'skip',
      issues: [`Phone ${phone} is already registered as "${existing.name}".`]
    };
  }

  return {
    rowNumber: record.rowNumber,
    name,
    phone,
    email,
    status,
    joinDate,
    expiryDate,
    planId: plan.id,
    planName: plan.name,
    planAmount: Math.max(0, plan.base_price - (plan.discount || 0)),
    membershipStatus: MEMBERSHIP_STATUS_FOR_MEMBER[status],
    existingMemberId: existing ? existing.id : null,
    existingMemberName: existing ? existing.name : null,
    action: existing ? 'update' : 'new',
    issues: []
  };
}

function buildPreview(csvText, options = {}) {
  const parsed = parseCsv(csvText);
  if (!parsed.ok) {
    return { error: parsed.error, columns: parsed.columns || null };
  }

  const duplicateMode = options.duplicateMode === 'skip-existing' ? 'skip-existing' : 'update';
  const plans = loadPlans();
  const availablePlanNames = plans.map(entry => entry.plan.name);
  const membersByPhone = loadMembersByPhone();
  const seenPhones = new Set();

  const rows = parsed.records.map(record => validateRecord(record, {
    plans,
    membersByPhone,
    seenPhones,
    duplicateMode,
    availablePlanNames
  }));

  const summary = {
    total: rows.length,
    new: rows.filter(row => row.action === 'new').length,
    update: rows.filter(row => row.action === 'update').length,
    skip: rows.filter(row => row.action === 'skip').length,
    error: rows.filter(row => row.action === 'error').length
  };

  return {
    rows,
    summary,
    truncated: parsed.truncated,
    ignoredRows: Math.max(0, parsed.totalDataRows - parsed.records.length),
    detectedColumns: Object.keys(parsed.columns),
    availablePlanNames,
    duplicateMode
  };
}

function summarizeRows(rows) {
  return rows.map(row => ({
    row: row.rowNumber,
    name: row.name || null,
    phone: row.phone || null,
    action: row.action,
    plan: row.planName || null,
    joinDate: row.joinDate || null,
    expiryDate: row.expiryDate || null,
    status: row.status || null,
    issues: row.issues && row.issues.length ? row.issues : undefined
  }));
}

class MembersImportController {
  // GET /api/members/import/sample - downloadable template with real plan names.
  static getSampleTemplate(req, res) {
    try {
      const planNames = db.prepare('SELECT name FROM Plans WHERE active = 1 ORDER BY duration_months ASC').all().map(row => row.name);
      const rows = TEMPLATE_ROWS.map(cells => {
        const planName = planNames.length > 0 ? planNames[cells[3] % planNames.length] : '';
        return [...cells.slice(0, 3), planName, ...cells.slice(4)];
      });

      const csv = [TEMPLATE_COLUMNS.join(','), ...rows.map(cells => cells.join(','))].join('\n');
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', 'attachment; filename="samrat_members_import_template.csv"');
      return res.send(csv);
    } catch (err) {
      console.error('Sample CSV error:', err);
      return res.status(500).json({ success: false, error: 'Unable to build the sample CSV.' });
    }
  }

  // POST /api/members/import/preview - validate only, nothing is written.
  static previewImport(req, res) {
    try {
      const { csv, duplicateMode } = req.body || {};
      if (typeof csv !== 'string' || !csv.trim()) {
        return res.status(400).json({ success: false, error: 'Attach the CSV content as a "csv" string.' });
      }

      const preview = buildPreview(csv, { duplicateMode });
      if (preview.error) {
        return res.status(400).json({ success: false, error: preview.error, columns: preview.columns });
      }

      const rows = summarizeRows(preview.rows);
      return res.json({
        success: true,
        summary: { ...preview.summary, importable: preview.summary.new + preview.summary.update },
        duplicateMode: preview.duplicateMode,
        detectedColumns: preview.detectedColumns,
        availablePlans: preview.availablePlanNames,
        truncated: preview.truncated,
        ignoredRows: preview.ignoredRows,
        maxRows: MAX_IMPORT_ROWS,
        rows: rows.slice(0, ROW_PREVIEW_LIMIT),
        issues: rows.filter(row => row.issues).slice(0, ERROR_PREVIEW_LIMIT)
      });
    } catch (err) {
      console.error('CSV preview error:', err);
      return res.status(500).json({ success: false, error: 'Unable to read that CSV file.' });
    }
  }

  // POST /api/members/import - imports every valid row inside one transaction.
  static importMembers(req, res) {
    try {
      const { csv, duplicateMode } = req.body || {};
      if (typeof csv !== 'string' || !csv.trim()) {
        return res.status(400).json({ success: false, error: 'Attach the CSV content as a "csv" string.' });
      }

      const preview = buildPreview(csv, { duplicateMode });
      if (preview.error) {
        return res.status(400).json({ success: false, error: preview.error, columns: preview.columns });
      }

      const importable = preview.rows.filter(row => row.action === 'new' || row.action === 'update');
      if (importable.length === 0) {
        return res.status(422).json({
          success: false,
          error: 'No rows could be imported. Fix the reported issues and upload the file again.',
          summary: preview.summary,
          issues: summarizeRows(preview.rows).filter(row => row.issues).slice(0, ERROR_PREVIEW_LIMIT)
        });
      }

      const actorType = actorTypeForRole(req.user.role);
      const counts = { created: 0, updated: 0 };
      const affected = [];
      const importStamp = Date.now();

      const runImport = db.transaction(() => {
        for (const row of importable) {
          if (row.action === 'new') {
            const memberResult = db.prepare(`
              INSERT INTO Members (name, phone, email, consent, join_date, status, risk_state, assigned_trainer_id)
              VALUES (?, ?, ?, 1, ?, ?, ?, NULL)
            `).run(row.name, row.phone, row.email, row.joinDate, row.status, row.status === 'Paused' ? 'Paused' : 'Normal');
            const memberId = memberResult.lastInsertRowid;

            db.prepare(`
              INSERT INTO Streaks (member_id, rule_type, target, current_value, best_value, last_update)
              VALUES (?, 'Weekly', 4, 0, 0, ?)
            `).run(memberId, row.joinDate);

            const membershipResult = db.prepare(`
              INSERT INTO Memberships (member_id, plan_id, start_date, expiry_date, status, renewal_source)
              VALUES (?, ?, ?, ?, ?, 'CSV_Import')
            `).run(memberId, row.planId, row.joinDate, row.expiryDate, row.membershipStatus);

            db.prepare(`
              INSERT INTO Payments (member_id, order_id, provider_reference, amount, status, verified_time)
              VALUES (?, ?, ?, ?, 'Paid', datetime('now', 'localtime'))
            `).run(memberId, membershipResult.lastInsertRowid, `IMP_${importStamp}_${memberId}`, row.planAmount);

            counts.created += 1;
            affected.push({ memberId, name: row.name, action: 'new' });
          } else {
            db.prepare(`
              UPDATE Members
              SET name = ?, email = COALESCE(?, email), status = ?,
                  risk_state = CASE WHEN ? = 'Paused' THEN 'Paused' WHEN ? = 'Active' THEN 'Normal' ELSE risk_state END,
                  updated_at = datetime('now', 'localtime')
              WHERE id = ?
            `).run(row.name, row.email, row.status, row.status, row.status, row.existingMemberId);

            db.prepare(`
              UPDATE Memberships SET status = ?
              WHERE member_id = ? AND id = (
                SELECT inner_ms.id FROM Memberships inner_ms
                WHERE inner_ms.member_id = ?
                ORDER BY (inner_ms.status = 'Active') DESC, inner_ms.expiry_date DESC, inner_ms.id DESC LIMIT 1
              )
            `).run(row.membershipStatus, row.existingMemberId, row.existingMemberId);

            db.prepare(`
              INSERT INTO Memberships (member_id, plan_id, start_date, expiry_date, status, renewal_source)
              VALUES (?, ?, ?, ?, ?, 'CSV_Import')
            `).run(row.existingMemberId, row.planId, row.joinDate, row.expiryDate, row.membershipStatus);

            counts.updated += 1;
            affected.push({ memberId: row.existingMemberId, name: row.name, action: 'update' });
          }
        }

        logAudit(req.user.id, actorType, 'CSV Bulk Import', 'Members', affected[0].memberId, null, {
          file: 'csv-upload',
          created: counts.created,
          updated: counts.updated,
          skipped: preview.summary.skip,
          failed: preview.summary.error
        });
      });

      runImport();

      const summary = {
        created: counts.created,
        updated: counts.updated,
        skipped: preview.summary.skip,
        failed: preview.summary.error,
        total: preview.summary.total
      };

      return res.status(201).json({
        success: true,
        message: `${counts.created} member(s) created and ${counts.updated} updated.`,
        summary,
        imported: affected.slice(0, ROW_PREVIEW_LIMIT),
        issues: summarizeRows(preview.rows).filter(row => row.issues).slice(0, ERROR_PREVIEW_LIMIT)
      });
    } catch (err) {
      console.error('CSV import error:', err);
      return res.status(500).json({ success: false, error: 'Import failed. No changes were saved.' });
    }
  }
}

module.exports = MembersImportController;
module.exports.buildPreview = buildPreview;
