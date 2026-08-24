#!/usr/bin/env node
const AutomationService = require('../../backend/src/services/automation.service');
const { initDatabase } = require('../../backend/src/config/database');

console.log('--- Simulating Payment Webhook Processor ---');
initDatabase();

// Mock Razorpay Webhook Payload
const mockPayload = {
  memberId: 4, // Karan Mehra
  orderType: 'RENEWAL',
  planId: 2, // Quarterly Fitness Booster
  amount: 3500,
  providerReference: `rzp_sim_${Date.now()}`,
  staffId: null
};

try {
  const result = AutomationService.processPaymentVerification(mockPayload);
  console.log('Payment webhook processed idempotently:');
  console.log(result);
} catch (err) {
  console.error('Webhook processing failed:', err);
  process.exit(1);
}
