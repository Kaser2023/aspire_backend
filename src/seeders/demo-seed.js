/**
 * ============================================
 * 🌱 DEMO DATA SEED SCRIPT
 * ============================================
 * 
 * This script populates the database with realistic Arabic demo data:
 * - 4 Branches
 * - 8 Programs (2 per branch)
 * - 32 Coaches (8 per branch)
 * - 100 Parents
 * - 150 Players (50 parents have 2 children each)
 * 
 * Run: node src/seeders/demo-seed.js
 * ============================================
 */

const { v4: uuidv4 } = require('uuid');
const { sequelize, Branch, Program, User, Player, CoachProgram } = require('../models');

// ============================================
// 📊 REALISTIC ARABIC DATA POOLS
// ============================================

// Arabic first names (male)
const ARABIC_MALE_FIRST_NAMES = [
  'محمد', 'أحمد', 'عبدالله', 'خالد', 'سعود', 'فيصل', 'عمر', 'علي', 'سلطان', 'ناصر',
  'عبدالرحمن', 'يوسف', 'إبراهيم', 'حسن', 'حسين', 'طارق', 'ماجد', 'سامي', 'وليد', 'بندر',
  'تركي', 'نايف', 'مشاري', 'راشد', 'سعد', 'فهد', 'منصور', 'عادل', 'زياد', 'هاني',
  'باسم', 'كريم', 'ياسر', 'عماد', 'رامي', 'أيمن', 'هشام', 'مروان', 'جمال', 'صالح'
];

// Arabic last names
const ARABIC_LAST_NAMES = [
  'العتيبي', 'الشمري', 'القحطاني', 'الدوسري', 'الحربي', 'المطيري', 'الغامدي', 'الزهراني',
  'السبيعي', 'العنزي', 'الرشيدي', 'البلوي', 'الجهني', 'السلمي', 'الثقفي', 'المالكي',
  'الأحمدي', 'الشهري', 'العسيري', 'الخالدي', 'السعدي', 'الفهدي', 'الناصري', 'المحمدي',
  'العمري', 'الحسني', 'الإبراهيمي', 'الطارقي', 'الماجدي', 'السامي'
];

// Saudi cities
const SAUDI_CITIES = ['الرياض', 'جدة', 'الدمام', 'مكة المكرمة'];

// Branch data - using DEMO prefix to avoid conflicts with existing data
const BRANCHES_DATA = [
  { name: 'Demo Riyadh Branch', name_ar: 'فرع الرياض التجريبي', city: 'الرياض', code: 'DEMO-RYD', region: 'المنطقة الوسطى' },
  { name: 'Demo Jeddah Branch', name_ar: 'فرع جدة التجريبي', city: 'جدة', code: 'DEMO-JED', region: 'المنطقة الغربية' },
  { name: 'Demo Dammam Branch', name_ar: 'فرع الدمام التجريبي', city: 'الدمام', code: 'DEMO-DMM', region: 'المنطقة الشرقية' },
  { name: 'Demo Makkah Branch', name_ar: 'فرع مكة التجريبي', city: 'مكة المكرمة', code: 'DEMO-MKH', region: 'المنطقة الغربية' }
];

// Program data templates (2 per branch)
const PROGRAMS_TEMPLATES = [
  { name: 'Junior Stars', name_ar: 'نجوم الناشئين', type: 'training', age_min: 6, age_max: 10, price: 500 },
  { name: 'Youth Champions', name_ar: 'أبطال الشباب', type: 'training', age_min: 11, age_max: 14, price: 600 },
  { name: 'Elite Academy', name_ar: 'الأكاديمية المتقدمة', type: 'training', age_min: 15, age_max: 18, price: 750 },
  { name: 'Summer Camp', name_ar: 'المعسكر الصيفي', type: 'camp', age_min: 8, age_max: 16, price: 1200 },
  { name: 'Goalkeepers Special', name_ar: 'برنامج حراس المرمى', type: 'private', age_min: 10, age_max: 18, price: 800 },
  { name: 'Football Fundamentals', name_ar: 'أساسيات كرة القدم', type: 'training', age_min: 5, age_max: 8, price: 400 },
  { name: 'Competition Team', name_ar: 'فريق المنافسات', type: 'competition', age_min: 12, age_max: 17, price: 900 },
  { name: 'Weekend Warriors', name_ar: 'محاربو نهاية الأسبوع', type: 'training', age_min: 7, age_max: 12, price: 350 }
];

// Schedule templates
const SCHEDULE_TEMPLATES = [
  [{ day: 'sunday', start_time: '16:00', end_time: '18:00' }, { day: 'tuesday', start_time: '16:00', end_time: '18:00' }],
  [{ day: 'monday', start_time: '17:00', end_time: '19:00' }, { day: 'wednesday', start_time: '17:00', end_time: '19:00' }],
  [{ day: 'saturday', start_time: '09:00', end_time: '11:00' }, { day: 'thursday', start_time: '16:00', end_time: '18:00' }],
  [{ day: 'sunday', start_time: '18:00', end_time: '20:00' }, { day: 'thursday', start_time: '18:00', end_time: '20:00' }]
];

// ============================================
// 🔧 UTILITY FUNCTIONS
// ============================================

/**
 * Get random item from array
 */
const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Get random items from array (no duplicates)
 */
const getRandomItems = (arr, count) => {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

/**
 * Generate Saudi phone number
 */
const generateSaudiPhone = () => {
  const prefixes = ['050', '053', '054', '055', '056', '057', '058', '059'];
  const prefix = getRandomItem(prefixes);
  const number = Math.floor(Math.random() * 10000000).toString().padStart(7, '0');
  return `${prefix}${number}`;
};

/**
 * Generate random date of birth for player (age 5-18)
 */
const generatePlayerDOB = (minAge = 5, maxAge = 18) => {
  const today = new Date();
  const age = Math.floor(Math.random() * (maxAge - minAge + 1)) + minAge;
  const year = today.getFullYear() - age;
  const month = Math.floor(Math.random() * 12);
  const day = Math.floor(Math.random() * 28) + 1;
  return new Date(year, month, day).toISOString().split('T')[0];
};

/**
 * Generate registration number with DEMO prefix to avoid conflicts
 */
let playerCounter = 0;
const generateRegistrationNumber = () => {
  playerCounter++;
  const timestamp = Date.now();
  return `DEMO-${timestamp}-${String(playerCounter).padStart(4, '0')}`;
};

// Password hashing is handled by User model's beforeCreate hook

// ============================================
// 🌱 MAIN SEED FUNCTION
// ============================================

async function seed() {
  console.log('\n🌱 Starting Demo Data Seed...\n');
  console.log('=' .repeat(50));

  // NOTE: Not using transaction because Player model's beforeValidate hook
  // uses Player.count() which doesn't work well inside transactions
  try {
    // ----------------------------------------
    // 1️⃣ CREATE BRANCHES (4)
    // ----------------------------------------
    console.log('\n📍 Creating 4 Branches...');
    
    const branches = [];
    for (const branchData of BRANCHES_DATA) {
      const branch = await Branch.create({
        id: uuidv4(),
        name: branchData.name,
        name_ar: branchData.name_ar,
        code: branchData.code,
        city: branchData.city,
        region: branchData.region,
        address: `شارع الملك فهد، ${branchData.city}`,
        phone: generateSaudiPhone(),
        email: `${branchData.code.toLowerCase()}@academy.sa`,
        capacity: 200,
        is_active: true,
        facilities: ['ملعب عشب صناعي', 'غرف تبديل', 'مواقف سيارات', 'كافتيريا'],
        working_hours: {
          sunday: { open: '08:00', close: '22:00', closed: false },
          monday: { open: '08:00', close: '22:00', closed: false },
          tuesday: { open: '08:00', close: '22:00', closed: false },
          wednesday: { open: '08:00', close: '22:00', closed: false },
          thursday: { open: '08:00', close: '22:00', closed: false },
          friday: { open: '14:00', close: '22:00', closed: false },
          saturday: { open: '08:00', close: '22:00', closed: false }
        }
      });
      
      branches.push(branch);
      console.log(`   ✅ ${branchData.name_ar} (${branchData.code})`);
    }

    // ----------------------------------------
    // 2️⃣ CREATE PROGRAMS (8 - 2 per branch)
    // ----------------------------------------
    console.log('\n📚 Creating 8 Programs (2 per branch)...');
    
    const programs = [];
    let programIndex = 0;
    
    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i];
      
      // 2 programs per branch
      for (let j = 0; j < 2; j++) {
        const template = PROGRAMS_TEMPLATES[programIndex % PROGRAMS_TEMPLATES.length];
        const schedule = SCHEDULE_TEMPLATES[programIndex % SCHEDULE_TEMPLATES.length];
        
        const program = await Program.create({
          id: uuidv4(),
          name: template.name,
          name_ar: template.name_ar,
          description: `برنامج تدريبي متميز في ${branch.name_ar}`,
          description_ar: `برنامج تدريبي متميز في ${branch.name_ar}`,
          type: template.type,
          sport_type: 'football',
          branch_id: branch.id,
          age_group_min: template.age_min,
          age_group_max: template.age_max,
          capacity: 25,
          current_enrollment: 0,
          price_monthly: template.price,
          price_quarterly: template.price * 2.7,
          price_annual: template.price * 10,
          registration_fee: 100,
          schedule: schedule,
          is_active: true,
          features: ['تدريب احترافي', 'زي رياضي', 'شهادة إتمام']
        });
        
        programs.push(program);
        console.log(`   ✅ ${template.name_ar} - ${branch.name_ar}`);
        programIndex++;
      }
    }

    // ----------------------------------------
    // 3️⃣ CREATE BRANCH ADMINS (4 - 1 per branch)
    // ----------------------------------------
    console.log('\n👔 Creating 4 Branch Admins (1 per branch)...');
    
    const branchAdmins = [];
    const adminPassword = 'Admin@123'; // Let the model hook hash it
    
    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i];
      const adminIndex = i + 1;
      const firstName = ARABIC_MALE_FIRST_NAMES[(adminIndex + 10) % ARABIC_MALE_FIRST_NAMES.length];
      const lastName = ARABIC_LAST_NAMES[(adminIndex + 10) % ARABIC_LAST_NAMES.length];
      // Generate predictable phone: +966531000001, +966531000002, etc.
      const phone = `+96653100${String(adminIndex).padStart(4, '0')}`;
      
      const admin = await User.create({
        id: uuidv4(),
        email: null, // Phone-based login
        password: adminPassword,
        phone: phone,
        first_name: `BranchAdmin${adminIndex}`,
        last_name: `Manager`,
        name_ar: `${firstName} ${lastName}`,
        role: 'branch_admin',
        branch_id: branch.id,
        is_active: true,
        is_verified: true,
        preferences: { language: 'ar', notifications: { email: true, sms: true, push: true } }
      });
      
      branchAdmins.push(admin);
      console.log(`   ✅ ${firstName} ${lastName} - ${branch.name_ar}`);
    }

    // ----------------------------------------
    // 4️⃣ CREATE COACHES (32 - 8 per branch)
    // ----------------------------------------
    console.log('\n🧑‍🏫 Creating 32 Coaches (8 per branch)...');
    
    const coaches = [];
    const coachPassword = 'Coach@123'; // Let the model hook hash it
    let coachCounter = 0;
    
    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i];
      const branchPrograms = programs.filter(p => p.branch_id === branch.id);
      
      for (let j = 0; j < 8; j++) {
        coachCounter++;
        const firstName = ARABIC_MALE_FIRST_NAMES[coachCounter % ARABIC_MALE_FIRST_NAMES.length];
        const lastName = ARABIC_LAST_NAMES[coachCounter % ARABIC_LAST_NAMES.length];
        const firstNameEn = `Coach${coachCounter}`;
        const lastNameEn = `Trainer`;
        // Generate predictable phone: +966551000001, +966551000002, etc.
        const phone = `+9665510${String(coachCounter).padStart(5, '0')}`;
        
        const coach = await User.create({
          id: uuidv4(),
          email: null, // Phone-based login
          password: coachPassword,
          phone: phone,
          first_name: firstNameEn,
          last_name: lastNameEn,
          name_ar: `${firstName} ${lastName}`,
          role: 'coach',
          branch_id: branch.id,
          is_active: true,
          is_verified: true,
          preferences: { language: 'ar', notifications: { email: true, sms: true, push: true } }
        });
        
        coaches.push(coach);
        
        // Assign coach to 1-2 programs in their branch
        const numPrograms = Math.random() > 0.5 ? 2 : 1;
        const assignedPrograms = getRandomItems(branchPrograms, Math.min(numPrograms, branchPrograms.length));
        
        for (let k = 0; k < assignedPrograms.length; k++) {
          await CoachProgram.create({
            id: uuidv4(),
            coach_id: coach.id,
            program_id: assignedPrograms[k].id,
            is_primary: k === 0
          });
        }
        
        console.log(`   ✅ ${firstName} ${lastName} - ${branch.name_ar}`);
      }
    }

    // ----------------------------------------
    // 4️⃣ CREATE PARENTS (100)
    // ----------------------------------------
    console.log('\n👨‍👩‍👧 Creating 100 Parents...');
    
    const parents = [];
    const parentPassword = 'Parent@123'; // Let the model hook hash it
    
    for (let i = 1; i <= 100; i++) {
      const firstName = ARABIC_MALE_FIRST_NAMES[i % ARABIC_MALE_FIRST_NAMES.length];
      const lastName = ARABIC_LAST_NAMES[i % ARABIC_LAST_NAMES.length];
      const firstNameEn = `Parent${i}`;
      const lastNameEn = `User`;
      // Generate predictable phone: +966501000001, +966501000002, etc.
      const phone = `+9665010${String(i).padStart(5, '0')}`;
      
      const parent = await User.create({
        id: uuidv4(),
        email: null, // Phone-based login
        password: parentPassword,
        phone: phone,
        first_name: firstNameEn,
        last_name: lastNameEn,
        name_ar: `${firstName} ${lastName}`,
        role: 'parent',
        branch_id: null, // Parents don't belong to a branch
        is_active: true,
        is_verified: true,
        preferences: { language: 'ar', notifications: { email: true, sms: true, push: true } }
      });
      
      parents.push(parent);
      
      if (i % 20 === 0) {
        console.log(`   ✅ Created ${i}/100 parents...`);
      }
    }
    console.log(`   ✅ All 100 parents created`);

    // ----------------------------------------
    // 5️⃣ CREATE PLAYERS (150)
    // ----------------------------------------
    console.log('\n⚽ Creating 150 Players...');
    console.log('   (50 parents with 2 children, 50 parents with 1 child)');
    
    const players = [];
    const playerFirstNames = [
      'يزيد', 'عبدالعزيز', 'سلمان', 'فارس', 'غازي', 'مهند', 'أنس', 'بدر', 'ثامر', 'جاسم',
      'حمد', 'خليل', 'دانيال', 'رائد', 'زايد', 'سيف', 'شهاب', 'صقر', 'ضاري', 'طلال',
      'عبدالملك', 'غانم', 'فواز', 'قصي', 'كنان', 'لؤي', 'مازن', 'نواف', 'هيثم', 'وائل',
      'يحيى', 'آدم', 'إياد', 'براء', 'تميم', 'جود', 'حاتم', 'خلف', 'داود', 'رامز'
    ];
    
    let playerIndex = 0;
    
    // First 50 parents get 2 children each (100 players)
    for (let i = 0; i < 50; i++) {
      const parent = parents[i];
      const branch = getRandomItem(branches);
      const branchPrograms = programs.filter(p => p.branch_id === branch.id);
      const branchCoaches = coaches.filter(c => c.branch_id === branch.id);
      
      for (let j = 0; j < 2; j++) {
        playerIndex++;
        const firstName = playerFirstNames[playerIndex % playerFirstNames.length];
        const lastName = parent.name_ar.split(' ')[1] || ARABIC_LAST_NAMES[playerIndex % ARABIC_LAST_NAMES.length];
        const program = getRandomItem(branchPrograms);
        const coach = getRandomItem(branchCoaches);
        
        const player = await Player.create({
          id: uuidv4(),
          registration_number: generateRegistrationNumber(),
          first_name: `Player${playerIndex}`,
          last_name: `Child`,
          first_name_ar: firstName,
          last_name_ar: lastName,
          date_of_birth: generatePlayerDOB(program.age_group_min, program.age_group_max),
          gender: 'male',
          parent_id: parent.id,
          branch_id: branch.id,
          program_id: program.id,
          coach_id: coach.id,
          status: 'active',
          skill_level: getRandomItem(['beginner', 'intermediate', 'advanced']),
          position: getRandomItem(['حارس مرمى', 'مدافع', 'وسط', 'مهاجم']),
          jersey_size: getRandomItem(['XS', 'S', 'M', 'L']),
          shoe_size: getRandomItem(['32', '34', '36', '38', '40']),
          join_date: new Date().toISOString().split('T')[0]
        });
        
        players.push(player);
      }
      
      if ((i + 1) % 10 === 0) {
        console.log(`   ✅ Created players for ${i + 1}/50 parents (2 children each)...`);
      }
    }
    
    // Remaining 50 parents get 1 child each (50 players)
    for (let i = 50; i < 100; i++) {
      const parent = parents[i];
      const branch = getRandomItem(branches);
      const branchPrograms = programs.filter(p => p.branch_id === branch.id);
      const branchCoaches = coaches.filter(c => c.branch_id === branch.id);
      
      playerIndex++;
      const firstName = playerFirstNames[playerIndex % playerFirstNames.length];
      const lastName = parent.name_ar.split(' ')[1] || ARABIC_LAST_NAMES[playerIndex % ARABIC_LAST_NAMES.length];
      const program = getRandomItem(branchPrograms);
      const coach = getRandomItem(branchCoaches);
      
      const player = await Player.create({
        id: uuidv4(),
        registration_number: generateRegistrationNumber(),
        first_name: `Player${playerIndex}`,
        last_name: `Child`,
        first_name_ar: firstName,
        last_name_ar: lastName,
        date_of_birth: generatePlayerDOB(program.age_group_min, program.age_group_max),
        gender: 'male',
        parent_id: parent.id,
        branch_id: branch.id,
        program_id: program.id,
        coach_id: coach.id,
        status: 'active',
        skill_level: getRandomItem(['beginner', 'intermediate', 'advanced']),
        position: getRandomItem(['حارس مرمى', 'مدافع', 'وسط', 'مهاجم']),
        jersey_size: getRandomItem(['XS', 'S', 'M', 'L']),
        shoe_size: getRandomItem(['32', '34', '36', '38', '40']),
        join_date: new Date().toISOString().split('T')[0]
      });
      
      players.push(player);
      
      if ((i - 49) % 10 === 0) {
        console.log(`   ✅ Created players for ${i - 49}/50 parents (1 child each)...`);
      }
    }
    
    console.log(`   ✅ All 150 players created`);

    // ----------------------------------------
    // 6️⃣ UPDATE PROGRAM ENROLLMENT COUNTS
    // ----------------------------------------
    console.log('\n📊 Updating program enrollment counts...');
    
    for (const program of programs) {
      const count = players.filter(p => p.program_id === program.id).length;
      await program.update({ current_enrollment: count });
    }
    console.log('   ✅ Enrollment counts updated');

    // ----------------------------------------
    // ✅ COMMIT TRANSACTION
    // ----------------------------------------
    // No transaction to commit

    // ----------------------------------------
    // 📊 SUMMARY
    // ----------------------------------------
    console.log('\n' + '=' .repeat(50));
    console.log('🎉 SEED COMPLETED SUCCESSFULLY!\n');
    console.log('📊 Summary:');
    console.log(`   🏢 Branches:       ${branches.length}`);
    console.log(`   📚 Programs:       ${programs.length}`);
    console.log(`   👔 Branch Admins:  ${branchAdmins.length}`);
    console.log(`   🧑‍🏫 Coaches:        ${coaches.length}`);
    console.log(`   👨‍👩‍👧 Parents:        ${parents.length}`);
    console.log(`   ⚽ Players:        ${players.length}`);
    console.log('\n📝 Login Credentials (Phone-based):');
    console.log('   ┌───────────────────────────────────────────────────────┐');
    console.log('   │ BRANCH ADMINS                                         │');
    console.log('   │   📱 Phone:    +966531000001                          │');
    console.log('   │   🔑 Password: Admin@123                              │');
    console.log('   ├───────────────────────────────────────────────────────┤');
    console.log('   │ COACHES                                               │');
    console.log('   │   📱 Phone:    +966551000001                          │');
    console.log('   │   🔑 Password: Coach@123                              │');
    console.log('   ├───────────────────────────────────────────────────────┤');
    console.log('   │ PARENTS                                               │');
    console.log('   │   📱 Phone:    +966501000001                          │');
    console.log('   │   🔑 Password: Parent@123                             │');
    console.log('   └───────────────────────────────────────────────────────┘');
    console.log('\n   📱 Phone patterns:');
    console.log('      Branch Admins: +966531000001 - +966531000004');
    console.log('      Coaches:       +966551000001 - +966551000032');
    console.log('      Parents:       +966501000001 - +966501000100');
    console.log('=' .repeat(50) + '\n');

  } catch (error) {
    // No transaction to rollback
    console.error('\n❌ SEED FAILED:', error.message);
    if (error.original) {
      console.error('Original error:', error.original.message);
      console.error('SQL:', error.sql);
    }
    console.error(error.stack);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// ============================================
// 🚀 RUN SEED
// ============================================

seed()
  .then(() => {
    console.log('✅ Seed script finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed script failed:', error);
    process.exit(1);
  });
