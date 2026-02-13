/**
 * ============================================
 * 🧹 DEMO DATA CLEANUP SCRIPT
 * ============================================
 * 
 * This script removes ALL seeded demo data from the database.
 * Respects foreign-key order:
 *   1. Players (depends on parents, branches, programs, coaches)
 *   2. CoachPrograms (depends on coaches, programs)
 *   3. Parents (users with role='parent')
 *   4. Coaches (users with role='coach')
 *   5. Programs (depends on branches)
 *   6. Branches
 * 
 * Run: node src/seeders/demo-cleanup.js
 * ============================================
 */

const { sequelize, Branch, Program, User, Player, CoachProgram } = require('../models');
const { Op } = require('sequelize');

// ============================================
// 🧹 MAIN CLEANUP FUNCTION
// ============================================

async function cleanup() {
  console.log('\n🧹 Starting Demo Data Cleanup...\n');
  console.log('=' .repeat(50));
  console.log('⚠️  WARNING: This will delete ALL demo data!');
  console.log('=' .repeat(50));

  const transaction = await sequelize.transaction();

  try {
    // ----------------------------------------
    // 1️⃣ DELETE PLAYERS
    // ----------------------------------------
    console.log('\n1️⃣ Deleting Players...');
    
    // Delete players that belong to seeded parents (phone pattern: +9665010XXXXX)
    const seededParents = await User.findAll({
      where: {
        role: 'parent',
        phone: { [Op.like]: '+9665010%' }
      },
      attributes: ['id'],
      transaction
    });
    
    const parentIds = seededParents.map(p => p.id);
    
    if (parentIds.length > 0) {
      const deletedPlayers = await Player.destroy({
        where: { parent_id: { [Op.in]: parentIds } },
        transaction
      });
      console.log(`   ✅ Deleted ${deletedPlayers} players`);
    } else {
      console.log('   ⏭️  No seeded players found');
    }

    // ----------------------------------------
    // 2️⃣ DELETE COACH-PROGRAM ASSIGNMENTS
    // ----------------------------------------
    console.log('\n2️⃣ Deleting Coach-Program assignments...');
    
    // Find seeded coaches (phone pattern: +9665510XXXXX)
    const seededCoaches = await User.findAll({
      where: {
        role: 'coach',
        phone: { [Op.like]: '+9665510%' }
      },
      attributes: ['id'],
      transaction
    });
    
    const coachIds = seededCoaches.map(c => c.id);
    
    if (coachIds.length > 0) {
      const deletedAssignments = await CoachProgram.destroy({
        where: { coach_id: { [Op.in]: coachIds } },
        transaction
      });
      console.log(`   ✅ Deleted ${deletedAssignments} coach-program assignments`);
    } else {
      console.log('   ⏭️  No seeded coach assignments found');
    }

    // ----------------------------------------
    // 3️⃣ DELETE PARENTS
    // ----------------------------------------
    console.log('\n3️⃣ Deleting Parents...');
    
    const deletedParents = await User.destroy({
      where: {
        role: 'parent',
        phone: { [Op.like]: '+9665010%' }
      },
      transaction
    });
    console.log(`   ✅ Deleted ${deletedParents} parents`);

    // ----------------------------------------
    // 4️⃣ DELETE COACHES
    // ----------------------------------------
    console.log('\n4️⃣ Deleting Coaches...');
    
    const deletedCoaches = await User.destroy({
      where: {
        role: 'coach',
        phone: { [Op.like]: '+9665510%' }
      },
      transaction
    });
    console.log(`   ✅ Deleted ${deletedCoaches} coaches`);

    // ----------------------------------------
    // 4.5️⃣ DELETE BRANCH ADMINS
    // ----------------------------------------
    console.log('\n4.5️⃣ Deleting Branch Admins...');
    
    const deletedBranchAdmins = await User.destroy({
      where: {
        role: 'branch_admin',
        phone: { [Op.like]: '+96653100%' }
      },
      transaction
    });
    console.log(`   ✅ Deleted ${deletedBranchAdmins} branch admins`);

    // ----------------------------------------
    // 5️⃣ DELETE PROGRAMS (and their coach_program links)
    // ----------------------------------------
    console.log('\n5️⃣ Deleting Programs...');
    
    // Find seeded branches first (using DEMO prefix)
    const seededBranches = await Branch.findAll({
      where: {
        code: { [Op.in]: ['DEMO-RYD', 'DEMO-JED', 'DEMO-DMM', 'DEMO-MKH'] }
      },
      attributes: ['id'],
      transaction
    });
    
    const branchIds = seededBranches.map(b => b.id);
    
    if (branchIds.length > 0) {
      // First find all programs in these branches
      const seededPrograms = await Program.findAll({
        where: { branch_id: { [Op.in]: branchIds } },
        attributes: ['id'],
        transaction
      });
      const programIds = seededPrograms.map(p => p.id);
      
      // Delete coach_program links for these programs
      if (programIds.length > 0) {
        const deletedProgramLinks = await CoachProgram.destroy({
          where: { program_id: { [Op.in]: programIds } },
          transaction
        });
        console.log(`   ✅ Deleted ${deletedProgramLinks} coach-program links by program`);
      }
      
      // Now delete the programs
      const deletedPrograms = await Program.destroy({
        where: { branch_id: { [Op.in]: branchIds } },
        transaction
      });
      console.log(`   ✅ Deleted ${deletedPrograms} programs`);
    } else {
      console.log('   ⏭️  No seeded programs found');
    }

    // ----------------------------------------
    // 6️⃣ DELETE BRANCHES
    // ----------------------------------------
    console.log('\n6️⃣ Deleting Branches...');
    
    const deletedBranches = await Branch.destroy({
      where: {
        code: { [Op.in]: ['DEMO-RYD', 'DEMO-JED', 'DEMO-DMM', 'DEMO-MKH'] }
      },
      transaction
    });
    console.log(`   ✅ Deleted ${deletedBranches} branches`);

    // ----------------------------------------
    // ✅ COMMIT TRANSACTION
    // ----------------------------------------
    await transaction.commit();

    // ----------------------------------------
    // 📊 SUMMARY
    // ----------------------------------------
    console.log('\n' + '=' .repeat(50));
    console.log('🎉 CLEANUP COMPLETED SUCCESSFULLY!\n');
    console.log('📊 Summary:');
    console.log(`   ⚽ Players deleted:    ${parentIds.length > 0 ? 'Yes' : 'None found'}`);
    console.log(`   🔗 Assignments deleted: ${coachIds.length > 0 ? 'Yes' : 'None found'}`);
    console.log(`   👨‍👩‍👧 Parents deleted:    ${deletedParents}`);
    console.log(`   🧑‍🏫 Coaches deleted:    ${deletedCoaches}`);
    console.log(`   📚 Programs deleted:   ${branchIds.length > 0 ? 'Yes' : 'None found'}`);
    console.log(`   🏢 Branches deleted:   ${deletedBranches}`);
    console.log('=' .repeat(50) + '\n');

  } catch (error) {
    await transaction.rollback();
    console.error('\n❌ CLEANUP FAILED:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// ============================================
// 🚀 RUN CLEANUP
// ============================================

cleanup()
  .then(() => {
    console.log('✅ Cleanup script finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Cleanup script failed:', error);
    process.exit(1);
  });
