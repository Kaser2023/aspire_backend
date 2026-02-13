/**
 * Migration script to create subscriptions from existing completed payments
 * Run with: node src/scripts/migrate-payments-to-subscriptions.js
 */

const { Payment, Subscription, Player, ProgramPricingPlan, Program } = require('../models');
const { Op } = require('sequelize');

async function migratePaymentsToSubscriptions() {
  console.log('🚀 Starting migration: Creating subscriptions from existing payments...\n');

  try {
    // Find all completed payments that don't have a subscription
    const payments = await Payment.findAll({
      where: {
        status: 'completed',
        player_id: { [Op.ne]: null }
      },
      include: [
        { 
          association: 'player', 
          attributes: ['id', 'first_name', 'last_name', 'program_id', 'branch_id']
        },
        {
          association: 'subscription',
          required: false
        }
      ],
      order: [['created_at', 'ASC']]
    });

    console.log(`📋 Found ${payments.length} completed payments with players\n`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const payment of payments) {
      const paymentData = payment.toJSON();
      
      // Skip if subscription already exists
      if (paymentData.subscription) {
        console.log(`⏭️  Skipped: Payment ${payment.invoice_number} - already has subscription`);
        skipped++;
        continue;
      }

      // Check if player already has an active subscription
      const existingSub = await Subscription.findOne({
        where: {
          player_id: payment.player_id,
          status: { [Op.in]: ['active', 'pending'] }
        }
      });

      if (existingSub) {
        console.log(`⏭️  Skipped: Payment ${payment.invoice_number} - player already has active subscription`);
        skipped++;
        continue;
      }

      try {
        // Try to find matching pricing plan
        const paymentAmount = parseFloat(paymentData.total_amount || paymentData.amount || 0);
        let pricingPlan = null;
        let programId = null;

        // Method 1: From metadata pricing_plan_id
        if (paymentData.metadata?.pricing_plan_id) {
          pricingPlan = await ProgramPricingPlan.findByPk(paymentData.metadata.pricing_plan_id);
        }

        // Method 2: From metadata program_id
        if (!pricingPlan && paymentData.metadata?.program_id) {
          programId = paymentData.metadata.program_id;
          const plans = await ProgramPricingPlan.findAll({
            where: { program_id: programId, is_active: true }
          });
          pricingPlan = plans.find(p => Math.abs(parseFloat(p.price) - paymentAmount) < 1);
        }

        // Method 3: From player's program
        if (!pricingPlan && paymentData.player?.program_id) {
          programId = paymentData.player.program_id;
          const plans = await ProgramPricingPlan.findAll({
            where: { program_id: programId, is_active: true }
          });
          pricingPlan = plans.find(p => Math.abs(parseFloat(p.price) - paymentAmount) < 1);
        }

        // Method 4: Match by branch and amount
        if (!pricingPlan && (paymentData.branch_id || paymentData.player?.branch_id)) {
          const branchId = paymentData.branch_id || paymentData.player?.branch_id;
          const plans = await ProgramPricingPlan.findAll({
            where: { is_active: true },
            include: [{
              model: Program,
              as: 'program',
              where: { branch_id: branchId },
              required: true
            }]
          });
          pricingPlan = plans.find(p => Math.abs(parseFloat(p.price) - paymentAmount) < 1);
          if (pricingPlan) {
            programId = pricingPlan.program_id;
          }
        }

        // Calculate subscription dates
        const startDate = new Date(paymentData.paid_at || paymentData.created_at);
        const endDate = new Date(startDate);
        
        // Determine duration
        let durationMonths = 1; // Default 1 month
        if (pricingPlan?.duration_months) {
          durationMonths = pricingPlan.duration_months;
        } else if (paymentData.metadata?.duration_months) {
          durationMonths = paymentData.metadata.duration_months;
        } else {
          // Guess based on amount
          if (paymentAmount >= 1000) durationMonths = 12;
          else if (paymentAmount >= 700) durationMonths = 6;
          else if (paymentAmount >= 400) durationMonths = 3;
        }
        
        endDate.setMonth(endDate.getMonth() + durationMonths);

        // Use program_id from pricing plan, metadata, or player
        const finalProgramId = pricingPlan?.program_id || programId || paymentData.player?.program_id;

        if (!finalProgramId) {
          console.log(`⚠️  Warning: Payment ${payment.invoice_number} - no program found, using null`);
        }

        // Determine plan_type based on duration (must be valid ENUM: monthly, quarterly, annual, custom)
        let planType = 'custom';
        if (durationMonths === 1) planType = 'monthly';
        else if (durationMonths === 3) planType = 'quarterly';
        else if (durationMonths === 12) planType = 'annual';

        // Create subscription
        const subscription = await Subscription.create({
          player_id: payment.player_id,
          program_id: finalProgramId,
          plan_type: planType,
          start_date: startDate,
          end_date: endDate,
          status: endDate > new Date() ? 'active' : 'expired',
          amount: paymentAmount,
          total_amount: paymentAmount,
          is_auto_renew: false,
          notes: `Migrated from payment ${payment.invoice_number}${pricingPlan ? `. Plan: ${pricingPlan.name} (${durationMonths} months)` : ''}`
        });

        // Link subscription to payment
        await payment.update({ subscription_id: subscription.id });

        console.log(`✅ Created: Subscription for ${paymentData.player?.first_name} ${paymentData.player?.last_name} - ${durationMonths} months (ends ${endDate.toLocaleDateString()})`);
        created++;

      } catch (err) {
        console.error(`❌ Error processing payment ${payment.invoice_number}:`, err.message);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Created: ${created} subscriptions`);
    console.log(`   ⏭️  Skipped: ${skipped} payments`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migratePaymentsToSubscriptions()
  .then(() => {
    console.log('\n✅ Migration completed!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  });
