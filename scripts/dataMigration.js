#!/usr/bin/env node
const { initDatabase, db } = require('../backend/src/config/database');
const { seedDatabase } = require('../backend/src/config/seed');

console.log('--- Running Samrat Fitness King Schema & Data Migration ---');
initDatabase();
seedDatabase();
console.log('Migration verified successfully.');
