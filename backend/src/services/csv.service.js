// Dependency-free CSV reader used by the member bulk-import flow.
// Handles the shapes real gym spreadsheets produce: UTF-8 BOM, CRLF endings,
// double-quote escaped fields ("Patel, Arjun"), empty trailing columns and
// header aliases written by different people ("Full Name", "full_name", "Name").

const MAX_IMPORT_ROWS = 2000;
const MAX_IMPORT_BYTES = 1.5 * 1024 * 1024;

const HEADER_ALIASES = {
  name: ['name', 'member name', 'member_name', 'fullname', 'full name', 'full_name', 'customer name'],
  phone: ['phone', 'phone number', 'phone_number', 'mobile', 'mobile no', 'mobile number', 'contact', 'contact number'],
  email: ['email', 'email id', 'email address', 'mail'],
  plan_name: ['plan', 'plan name', 'plan_name', 'membership', 'membership plan', 'package'],
  join_date: ['join date', 'join_date', 'joining date', 'joining_date', 'start date', 'start_date'],
  expiry_date: ['expiry date', 'expiry_date', 'expire date', 'expire_date', 'end date', 'end_date', 'valid till'],
  status: ['status', 'member status', 'member_status']
};

const CANONICAL_COLUMNS = Object.keys(HEADER_ALIASES);

function normalizeHeaderKey(header) {
  return String(header || '')
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function mapHeaders(rawHeaders) {
  const map = {};
  const used = new Set();

  for (const canonical of CANONICAL_COLUMNS) {
    const accepted = HEADER_ALIASES[canonical];
    const index = rawHeaders.findIndex((header, position) => {
      if (used.has(position)) return false;
      const key = normalizeHeaderKey(header);
      return key === canonical || accepted.includes(key);
    });
    if (index !== -1) {
      map[canonical] = index;
      used.add(index);
    }
  }
  return map;
}

// RFC 4180 style scan: supports quoted fields, embedded newlines and "" escapes.
function parseCsvRows(text) {
  const source = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let hasContent = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      hasContent = true;
      continue;
    }

    if (char === '"' && field.trim() === '') {
      inQuotes = true;
      field = '';
      hasContent = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      hasContent = true;
      continue;
    }

    if (char === '\r') continue;

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      hasContent = false;
      continue;
    }

    field += char;
    hasContent = true;
  }

  if (hasContent || field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter(cells => cells.some(cell => String(cell).trim() !== ''));
}

function parseCsv(text, { maxRows = MAX_IMPORT_ROWS } = {}) {
  if (typeof text !== 'string') {
    return { ok: false, error: 'CSV content must be provided as text.' };
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_IMPORT_BYTES) {
    return { ok: false, error: `CSV file is too large. Keep uploads under ${Math.floor(MAX_IMPORT_BYTES / 1024 / 1024)} MB.` };
  }

  const rows = parseCsvRows(text);
  if (rows.length === 0) {
    return { ok: false, error: 'The CSV file is empty.' };
  }

  const headerCells = rows[0];
  const columnMap = mapHeaders(headerCells);
  const missing = ['name', 'phone'].filter(column => columnMap[column] === undefined);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `The CSV header must contain "${missing.join('" and "')}" columns.`,
      columns: headerCells
    };
  }

  const dataRows = rows.slice(1, maxRows + 1);
  const records = dataRows.map((cells, index) => {
    const record = { rowNumber: index + 2, raw: {} };
    for (const column of CANONICAL_COLUMNS) {
      const position = columnMap[column];
      const value = position === undefined ? '' : String(cells[position] ?? '').trim();
      record[column] = value;
      record.raw[column] = value;
    }
    return record;
  });

  return {
    ok: true,
    headers: headerCells,
    columns: columnMap,
    records,
    totalDataRows: rows.length - 1,
    truncated: rows.length - 1 > maxRows,
    maxRows
  };
}

module.exports = {
  MAX_IMPORT_ROWS,
  MAX_IMPORT_BYTES,
  CANONICAL_COLUMNS,
  HEADER_ALIASES,
  normalizeHeaderKey,
  mapHeaders,
  parseCsvRows,
  parseCsv
};
