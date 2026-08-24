#!/usr/bin/env node
const AutomationService = require('../../backend/src/services/automation.service');
const { initDatabase } = require('../../backend/src/config/database');

console.log('--- Running Scheduled Renewal Reminders Scan ---');
initDatabase();

try {
  const result = AutomationService.runRenewalScan();
  console.log('Renewal reminders scan completed successfully:');
  console.log(`- Scanned Memberships: ${result.scannedCount}`);
  console.log(`- Reminders Sent: ${result.remindersSentCount}`);
  if (result.remindersSent.length > 0) {
    console.table(result.remindersSent);
  }
} catch (err) {
  console.error('Failed to run renewal scan:', err);
  process.exit(1);
}
