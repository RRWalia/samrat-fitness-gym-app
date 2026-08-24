const { db, initDatabase, logAudit } = require('./database');

function seedDatabase() {
  initDatabase();

  // Check if members already seeded
  const memberCount = db.prepare('SELECT COUNT(*) as count FROM Members').get().count;
  if (memberCount > 0) {
    console.log('Database already has data. Skipping seed.');
    return;
  }

  console.log('Seeding initial data for Samrat Fitness King...');

  // 1. Seed Plans
  const insertPlan = db.prepare(`
    INSERT INTO Plans (name, duration_months, base_price, discount, benefits, active)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const plan1 = insertPlan.run('Monthly Starter', 1, 1500, 0, 'Full gym floor access, cardio zone, locker facility', 1).lastInsertRowid;
  const plan3 = insertPlan.run('Quarterly Fitness Booster', 3, 4000, 500, 'All floor access, 1 complimentary diet consultation, locker', 1).lastInsertRowid;
  const plan6 = insertPlan.run('Half-Year Transformation', 6, 7500, 1500, 'Priority locker, 2 body composition analysis, guest pass', 1).lastInsertRowid;
  const plan12 = insertPlan.run('Annual King Pass', 12, 13000, 3000, 'Unlimited access, 4 PT sessions, 1 free shaker, full locker & sauna', 1).lastInsertRowid;

  // 2. Seed AddOns
  const insertAddOn = db.prepare(`
    INSERT INTO AddOns (type, title, description, price, validity_days, capacity, stock, active, trainer_id, qualifications, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const pt1 = insertAddOn.run('PT', 'Personal Training - 12 Sessions (Coach Aryan)', '1-on-1 personalized strength & hypertrophy coaching with weekly progressive overload tracking.', 4500, 45, 12, 10, 1, 101, 'ACE Certified Personal Trainer, 6+ Yrs Experience', 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300').lastInsertRowid;
  const pt2 = insertAddOn.run('PT', 'Functional & Fat Loss PT - 24 Sessions (Coach Priya)', 'High intensity metabolic conditioning, posture correction, and tailored functional fitness.', 8000, 90, 24, 8, 1, 102, 'K11 Certified Master Trainer, Sports Conditioning Spec.', 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=300').lastInsertRowid;
  const diet1 = insertAddOn.run('Diet', 'Custom Macro & Calorie Meal Plan', 'Personalized Indian vegetarian/non-vegetarian weekly diet chart with grocery list and WhatsApp support.', 1200, 30, 1, 999, 1, 103, 'Registered Sports Dietitian (M.Sc Clinical Nutrition)', 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=300').lastInsertRowid;
  const prod1 = insertAddOn.run('Product', 'Samrat Premium Whey Isolate (2 kg - Chocolate)', '100% pure whey isolate, 27g protein per scoop, zero added sugar, lab tested & verified.', 3800, null, 1, 15, 1, null, 'FSSAI Certified, Batch Tested', 'https://images.unsplash.com/photo-1579722821273-0f6c7d44362f?w=300').lastInsertRowid;
  const prod2 = insertAddOn.run('Product', 'Micronized Creatine Monohydrate (300g)', '200 mesh ultra-pure creatine monohydrate for strength, power output, and muscle volume.', 850, null, 1, 24, 1, null, 'FSSAI Certified, 60 Servings', 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=300').lastInsertRowid;
  const prod3 = insertAddOn.run('Product', 'Samrat King Pro Stainless Steel Shaker (750ml)', 'Leak-proof, BPA-free stainless steel shaker with blending ball.', 450, null, 1, 30, 1, null, 'Premium Quality', 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300').lastInsertRowid;

  // Helper date generators
  const now = new Date();
  const getPastDateStr = (daysAgo) => {
    const d = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  };
  const getFutureDateStr = (daysAhead) => {
    const d = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  };

  // 3. Seed Members & Memberships with diverse realistic states
  const membersData = [
    {
      name: 'Rohan Sharma',
      phone: '+91 98250 11223',
      email: 'rohan.sharma@gmail.com',
      join_date: getPastDateStr(180),
      status: 'Active',
      risk_state: 'Normal',
      plan_id: plan12,
      start_date: getPastDateStr(180),
      expiry_date: getFutureDateStr(185),
      streak: { current: 14, best: 22, target: 5, rule_type: 'Weekly' },
      last_attendance_days_ago: 0 // Checked in today
    },
    {
      name: 'Aarav Patel',
      phone: '+91 98980 44556',
      email: 'aarav.patel@outlook.com',
      join_date: getPastDateStr(90),
      status: 'Active',
      risk_state: 'Normal',
      plan_id: plan6,
      start_date: getPastDateStr(90),
      expiry_date: getFutureDateStr(90),
      streak: { current: 8, best: 15, target: 4, rule_type: 'Weekly' },
      last_attendance_days_ago: 0 // Checked in today
    },
    {
      name: 'Neha Verma',
      phone: '+91 97234 88990',
      email: 'neha.v@yahoo.com',
      join_date: getPastDateStr(60),
      status: 'Active',
      risk_state: 'Normal',
      plan_id: plan3,
      start_date: getPastDateStr(60),
      expiry_date: getFutureDateStr(30),
      streak: { current: 5, best: 10, target: 4, rule_type: 'Weekly' },
      last_attendance_days_ago: 1 // Checked in yesterday
    },
    {
      name: 'Karan Mehra',
      phone: '+91 98765 43210',
      email: 'karan.mehra@gmail.com',
      join_date: getPastDateStr(120),
      status: 'Active',
      risk_state: 'Normal',
      plan_id: plan3,
      start_date: getPastDateStr(87),
      expiry_date: getFutureDateStr(3), // EXPIRING IN 3 DAYS!
      streak: { current: 3, best: 12, target: 4, rule_type: 'Weekly' },
      last_attendance_days_ago: 2
    },
    {
      name: 'Simran Kaur',
      phone: '+91 98111 22334',
      email: 'simran.k@gmail.com',
      join_date: getPastDateStr(150),
      status: 'Active',
      risk_state: 'Normal',
      plan_id: plan6,
      start_date: getPastDateStr(175),
      expiry_date: getFutureDateStr(5), // EXPIRING IN 5 DAYS!
      streak: { current: 6, best: 18, target: 4, rule_type: 'Weekly' },
      last_attendance_days_ago: 3
    },
    {
      name: 'Vikram Rajput',
      phone: '+91 99090 12345',
      email: 'vikram.rajput@gmail.com',
      join_date: getPastDateStr(200),
      status: 'Active',
      risk_state: 'Risk-11', // NO SHOW: 11 DAYS ABSENT
      plan_id: plan6,
      start_date: getPastDateStr(100),
      expiry_date: getFutureDateStr(80),
      streak: { current: 0, best: 9, target: 4, rule_type: 'Weekly' },
      last_attendance_days_ago: 11
    },
    {
      name: 'Deepak Joshi',
      phone: '+91 98790 99887',
      email: 'deepak.joshi@gmail.com',
      join_date: getPastDateStr(140),
      status: 'Active',
      risk_state: 'Risk-17', // NO SHOW: 17 DAYS ABSENT
      plan_id: plan3,
      start_date: getPastDateStr(50),
      expiry_date: getFutureDateStr(40),
      streak: { current: 0, best: 8, target: 4, rule_type: 'Weekly' },
      last_attendance_days_ago: 17
    },
    {
      name: 'Ananya Desai',
      phone: '+91 98240 77665',
      email: 'ananya.desai@gmail.com',
      join_date: getPastDateStr(210),
      status: 'Active',
      risk_state: 'Risk-25', // NO SHOW: 25 DAYS ABSENT (CRITICAL)
      plan_id: plan12,
      start_date: getPastDateStr(210),
      expiry_date: getFutureDateStr(155),
      streak: { current: 0, best: 20, target: 4, rule_type: 'Weekly' },
      last_attendance_days_ago: 25
    },
    {
      name: 'Manish Gupta',
      phone: '+91 98450 33221',
      email: 'manish.g@gmail.com',
      join_date: getPastDateStr(300),
      status: 'Paused',
      risk_state: 'Paused',
      plan_id: plan6,
      start_date: getPastDateStr(120),
      expiry_date: getFutureDateStr(110),
      streak: { current: 0, best: 14, target: 4, rule_type: 'Weekly' },
      last_attendance_days_ago: 35
    },
    {
      name: 'Pooja Iyer',
      phone: '+91 98200 55443',
      email: 'pooja.iyer@gmail.com',
      join_date: getPastDateStr(365),
      status: 'Expired',
      risk_state: 'Expired',
      plan_id: plan3,
      start_date: getPastDateStr(100),
      expiry_date: getPastDateStr(10), // Expired 10 days ago
      streak: { current: 0, best: 11, target: 4, rule_type: 'Weekly' },
      last_attendance_days_ago: 28
    }
  ];

  const insertMember = db.prepare(`
    INSERT INTO Members (name, phone, email, consent, join_date, status, risk_state)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMembership = db.prepare(`
    INSERT INTO Memberships (member_id, plan_id, start_date, expiry_date, status, renewal_source)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertStreak = db.prepare(`
    INSERT INTO Streaks (member_id, rule_type, target, current_value, best_value, last_update)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertAttendance = db.prepare(`
    INSERT INTO Attendance (member_id, check_in_time, source, qr_session)
    VALUES (?, ?, ?, ?)
  `);

  const memberIds = [];

  for (const m of membersData) {
    const memberRes = insertMember.run(m.name, m.phone, m.email, 1, m.join_date, m.status, m.risk_state);
    const memberId = memberRes.lastInsertRowid;
    memberIds.push(memberId);

    // Insert Membership
    insertMembership.run(
      memberId,
      m.plan_id,
      m.start_date,
      m.expiry_date,
      m.status === 'Paused' ? 'Frozen' : (m.status === 'Expired' ? 'Expired' : 'Active'),
      'Direct'
    );

    // Insert Streak
    insertStreak.run(
      memberId,
      m.streak.rule_type,
      m.streak.target,
      m.streak.current,
      m.streak.best,
      getPastDateStr(m.last_attendance_days_ago)
    );

    // Insert attendance records
    if (m.last_attendance_days_ago === 0) {
      // Checked in today at 07:15 AM
      insertAttendance.run(memberId, `${getPastDateStr(0)} 07:15:30`, 'QR', 'QR_SESS_TODAY_1');
      // Also insert some past check-ins
      for (let i = 1; i <= 6; i++) {
        insertAttendance.run(memberId, `${getPastDateStr(i)} 07:12:00`, 'QR', `QR_SESS_PAST_${i}`);
      }
    } else if (m.last_attendance_days_ago <= 3) {
      for (let i = m.last_attendance_days_ago; i <= m.last_attendance_days_ago + 4; i++) {
        insertAttendance.run(memberId, `${getPastDateStr(i)} 08:30:00`, 'QR', `QR_SESS_PAST_${i}`);
      }
    } else {
      // For no-shows, record their last attendance
      insertAttendance.run(memberId, `${getPastDateStr(m.last_attendance_days_ago)} 06:45:00`, 'QR', 'QR_SESS_OLD');
    }
  }

  // 4. Seed No-Show Cases and Follow-Ups
  const insertCase = db.prepare(`
    INSERT INTO NoShowCases (member_id, threshold_date, risk_days, owner_id, status, next_action_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertFollowUp = db.prepare(`
    INSERT INTO FollowUps (case_id, channel, outcome, notes, staff_id, timestamp, next_action_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Vikram Rajput (Member 6, 11 days absent) -> Open case
  const case1 = insertCase.run(memberIds[5], getPastDateStr(1), 11, 1, 'Open', getFutureDateStr(1)).lastInsertRowid;

  // Deepak Joshi (Member 7, 17 days absent) -> Contacted case
  const case2 = insertCase.run(memberIds[6], getPastDateStr(7), 17, 1, 'Contacted', getFutureDateStr(2)).lastInsertRowid;
  insertFollowUp.run(
    case2,
    'WhatsApp',
    'Travelling',
    'Member is currently travelling for official work. Promised to resume workout from next Monday.',
    1,
    `${getPastDateStr(2)} 11:30:00`,
    getFutureDateStr(4)
  );

  // Ananya Desai (Member 8, 25 days absent) -> Follow-up due case
  const case3 = insertCase.run(memberIds[7], getPastDateStr(15), 25, 1, 'Follow-up due', getPastDateStr(1)).lastInsertRowid;
  insertFollowUp.run(
    case3,
    'Call',
    'Injured',
    'Mild lower back spasm from office desk posture. Offered complimentary stretching session with Coach Aryan once recovered.',
    1,
    `${getPastDateStr(5)} 16:20:00`,
    getFutureDateStr(3)
  );

  // Seed a case that was successfully recovered
  const caseResolved = insertCase.run(memberIds[0], getPastDateStr(40), 10, 1, 'Returned', null).lastInsertRowid;
  insertFollowUp.run(
    caseResolved,
    'WhatsApp',
    'Will return',
    'Followed up, member had exams. Returned immediately and renewed yearly plan!',
    1,
    `${getPastDateStr(35)} 14:00:00`,
    null
  );

  // 5. Seed some Add-on Orders & Payments
  const insertPayment = db.prepare(`
    INSERT INTO Payments (member_id, order_id, provider_reference, amount, status, verified_time)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertAddOnOrder = db.prepare(`
    INSERT INTO AddOnOrders (member_id, addon_id, trainer_product_id, quantity, amount, usage, max_usage, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Rohan bought PT 12 sessions
  const pay1 = insertPayment.run(memberIds[0], null, 'rzp_pay_9988112233', 4500, 'Paid', `${getPastDateStr(10)} 10:00:00`).lastInsertRowid;
  insertAddOnOrder.run(memberIds[0], pt1, 101, 1, 4500, 4, 12, 'Active');

  // Aarav bought Whey Isolate
  const pay2 = insertPayment.run(memberIds[1], null, 'rzp_pay_7766554433', 3800, 'Paid', `${getPastDateStr(5)} 18:30:00`).lastInsertRowid;
  insertAddOnOrder.run(memberIds[1], prod1, null, 1, 3800, 1, 1, 'Completed');

  // 6. Seed Renewal Orders
  const insertRenewalOrder = db.prepare(`
    INSERT INTO RenewalOrders (membership_id, selected_plan_id, amount, discount, payment_id, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Seed a renewal for Karan Mehra (expiring in 3 days)
  insertRenewalOrder.run(4, plan3, 3500, 500, null, 'Pending');

  // 7. Seed Notifications
  const insertNotification = db.prepare(`
    INSERT INTO Notifications (member_id, template, channel, message_content, scheduled_time, delivery_status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertNotification.run(
    memberIds[3],
    'Renewal Reminder',
    'WhatsApp',
    `Hi Karan Mehra, your Quarterly Fitness Booster membership expires on ${getFutureDateStr(3)}. Renew today with your ₹500 loyalty discount!`,
    `${getPastDateStr(0)} 09:00:00`,
    'Delivered'
  );

  insertNotification.run(
    memberIds[5],
    'No-show Care Message',
    'WhatsApp',
    `Hi Vikram Rajput, your last gym check-in was 11 days ago. Everything okay? Reply here if you need timing support or a pause.`,
    `${getPastDateStr(0)} 08:00:00`,
    'Sent'
  );

  // 8. Seed Audit Logs
  logAudit(1, 'System', 'Initial Database Setup', 'System', 1, null, { message: 'Initialized Samrat Fitness King database schema and default records' });
  logAudit(1, 'Staff', 'Record Check-in', 'Attendance', 1, null, { member: 'Rohan Sharma', source: 'QR' });
  logAudit(1, 'Staff', 'No-Show Follow-up', 'NoShowCases', case2, null, { outcome: 'Travelling', notes: 'Travelling for work' });

  console.log('Database seeded successfully with 10 members, plans, attendance, red-list cases, and add-on orders!');
}

module.exports = { seedDatabase };
