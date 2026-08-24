#!/usr/bin/env node
const AutomationService = require('../../backend/src/services/automation.service');
const { initDatabase } = require('../../backend/src/config/database');

console.log('--- Running Scheduled Daily No-Show Scan ---');
initDatabase();

try {
  const result = AutomationService.runDailyNoShowScan();
  console.log('Daily scan completed successfully:');
  console.log(`- Scanned Members: ${result.scannedMembers}`);
  console.log(`- Threshold: ${result.thresholdDays} days`);
  console.log(`- New Cases Opened: ${result.newCasesCount}`);
  if (result.detectedCases.length > 0) {
    console.table(result.detectedCases);
  }
} catch (err) {
  console.error('Failed to run daily no-show scan:', err);
  process.exit(1);
}
