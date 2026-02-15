const cron = require('node-cron');
const { Op } = require('sequelize');
const {
  AutoSMSSettings,
  Subscription,
  Player,
  User,
  Program,
  SMS,
  AutomaticAnnouncement,
  AccountantAutoAnnouncement,
  Announcement
} = require('../models');
const smsService = require('../services/sms.service');
const { formatPhoneNumber } = require('../utils/helpers');
const { emitAnnouncementCreated } = require('../socket');

/**
 * SMS Scheduler - Handles automatic SMS sending based on settings
 */
class SMSScheduler {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
    this.isAutoAnnouncementsRunning = false;
  }

  /**
   * Initialize all scheduled jobs
   */
  init() {
    console.log('📅 Initializing Scheduler...');

    // Main scheduler - runs daily at 9:00 AM
    const mainJob = cron.schedule('0 9 * * *', async () => {
      console.log('⏰ Running daily auto SMS jobs at', new Date().toISOString());
      await this.runAllAutoSMS();
    }, {
      scheduled: true,
      timezone: 'Asia/Riyadh'
    });

    this.jobs.push(mainJob);

    // Automatic announcements scheduler - runs every minute
    const autoAnnouncementsJob = cron.schedule('* * * * *', async () => {
      await this.runAutomaticAnnouncements();
    }, {
      scheduled: true,
      timezone: 'Asia/Riyadh'
    });

    this.jobs.push(autoAnnouncementsJob);

    console.log('✅ Scheduler initialized. Jobs: SMS daily at 9:00 AM and automatic announcements every minute (Asia/Riyadh)');
  }

  /**
   * Run all enabled auto SMS jobs
   */
  async runAllAutoSMS() {
    if (this.isRunning) {
      console.log('⚠️ Scheduler already running, skipping...');
      return { skipped: true };
    }

    this.isRunning = true;
    const results = {
      subscription_expiring: { sent: 0, failed: 0 },
      payment_overdue: { sent: 0, failed: 0 },
      session_reminder: { sent: 0, failed: 0 },
      total: { sent: 0, failed: 0 }
    };

    try {
      // Get all enabled auto SMS settings
      const settings = await AutoSMSSettings.findAll({
        where: { enabled: true }
      });

      for (const setting of settings) {
        let result = { sent: 0, failed: 0 };

        switch (setting.type) {
          case 'subscription_expiring':
            result = await this.processSubscriptionExpiring(setting);
            results.subscription_expiring.sent += result.sent;
            results.subscription_expiring.failed += result.failed;
            break;

          case 'payment_overdue':
            result = await this.processPaymentOverdue(setting);
            results.payment_overdue.sent += result.sent;
            results.payment_overdue.failed += result.failed;
            break;

          case 'session_reminder':
            result = await this.processSessionReminder(setting);
            results.session_reminder.sent += result.sent;
            results.session_reminder.failed += result.failed;
            break;
        }

        // Update last run info
        await setting.update({
          last_run_at: new Date(),
          last_run_count: result.sent
        });

        results.total.sent += result.sent;
        results.total.failed += result.failed;
      }

      console.log('📊 Auto SMS Results:', results);
      return results;

    } catch (error) {
      console.error('❌ Auto SMS Error:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run automatic announcements scheduler
   */
  async runAutomaticAnnouncements() {
    if (this.isAutoAnnouncementsRunning) {
      return { skipped: true };
    }

    this.isAutoAnnouncementsRunning = true;

    try {
      const now = this.getRiyadhDateTime();
      console.log(`📢 [AutoAnnouncements] Running at ${now.dateStr} ${now.timeStr}`);
      const announcements = await AutomaticAnnouncement.findAll({
        where: { is_active: true }
      });

      for (const autoAnnouncement of announcements) {
        if (!this.shouldSendAutomaticAnnouncement(autoAnnouncement, now)) {
          continue;
        }

        const targetBranchId = this.getTargetBranchIdFromAudience(autoAnnouncement.target_audience);
        const createdAnnouncement = await Announcement.create({
          title: autoAnnouncement.name,
          content: autoAnnouncement.message,
          type: autoAnnouncement.type || 'general',
          priority: 'medium',
          author_id: autoAnnouncement.created_by,
          target_audience: autoAnnouncement.target_audience || 'all',
          target_branch_id: targetBranchId,
          target_program_id: null,
          expires_at: null,
          is_pinned: false,
          send_notification: autoAnnouncement.send_notification !== false,
          send_sms: false,
          is_published: true,
          published_at: new Date()
        });

        await autoAnnouncement.update({
          last_sent_at: new Date(),
          send_count: (autoAnnouncement.send_count || 0) + 1
        });

        const hydratedAnnouncement = await Announcement.findByPk(createdAnnouncement.id, {
          include: [
            { association: 'author', attributes: ['id', 'first_name', 'last_name'] },
            { association: 'target_branch', attributes: ['id', 'name'] }
          ]
        });

        emitAnnouncementCreated(hydratedAnnouncement, hydratedAnnouncement.target_audience);
      }

      // Also process accountant auto announcements (same logic as SMS but sends notifications)
      await this.processAccountantAutoAnnouncements(now);
    } catch (error) {
      console.error('❌ Automatic announcements error:', error);
    } finally {
      this.isAutoAnnouncementsRunning = false;
    }
  }

  getRiyadhDateTime() {
    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Riyadh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Riyadh',
      weekday: 'long'
    });

    const dateStr = dateFormatter.format(new Date());
    const timeStr = timeFormatter.format(new Date());
    const dayOfWeek = dayFormatter.format(new Date()).toLowerCase();

    return { dateStr, timeStr, dayOfWeek };
  }

  shouldSendAutomaticAnnouncement(autoAnnouncement, now) {
    const sendTime = this.normalizeTime(autoAnnouncement.send_time);
    if (!sendTime || sendTime !== now.timeStr) {
      return false;
    }

    if (autoAnnouncement.last_sent_at) {
      const lastSent = this.getRiyadhDateTimeFromDate(autoAnnouncement.last_sent_at);
      if (lastSent.dateStr === now.dateStr && lastSent.timeStr === now.timeStr) {
        return false;
      }
    }

    if (autoAnnouncement.schedule_type === 'specific_days') {
      const days = (autoAnnouncement.send_days || []).map(day => day.toLowerCase());
      return days.includes(now.dayOfWeek);
    }

    if (autoAnnouncement.schedule_type === 'date_range') {
      if (autoAnnouncement.start_date && autoAnnouncement.start_date > now.dateStr) {
        return false;
      }
      if (autoAnnouncement.end_date && autoAnnouncement.end_date < now.dateStr) {
        return false;
      }
      return true;
    }

    return false;
  }

  normalizeTime(timeValue) {
    if (!timeValue) return null;
    const timeString = typeof timeValue === 'string' ? timeValue : timeValue.toString();
    const [hours = '00', minutes = '00'] = timeString.split(':');
    return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
  }

  getTargetBranchIdFromAudience(audience) {
    if (audience && typeof audience === 'object' && audience.type === 'specific' && audience.branches) {
      const branchIds = Object.keys(audience.branches || {});
      if (branchIds.length === 1) {
        return branchIds[0];
      }
    }
    return null;
  }

  getRiyadhDateTimeFromDate(dateValue) {
    const date = new Date(dateValue);
    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Riyadh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return {
      dateStr: dateFormatter.format(date),
      timeStr: timeFormatter.format(date)
    };
  }

  /**
   * Process subscription expiring reminders
   */
  async processSubscriptionExpiring(setting) {
    const result = { sent: 0, failed: 0 };
    const daysBefore = setting.days_before || 7;

    // Calculate target date
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysBefore);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    // Find expiring subscriptions
    const whereClause = {
      status: 'active',
      end_date: targetDateStr
    };

    if (setting.branch_id) {
      // Filter by branch through player
    }

    const subscriptions = await Subscription.findAll({
      where: whereClause,
      include: [
        {
          association: 'player',
          include: [
            { association: 'parent', attributes: ['id', 'first_name', 'last_name', 'phone'] }
          ]
        },
        { association: 'program', attributes: ['id', 'name', 'name_ar'] }
      ]
    });

    // Group by parent to avoid duplicate SMS
    const parentMessages = new Map();

    for (const sub of subscriptions) {
      if (!sub.player?.parent?.phone) continue;

      const parent = sub.player.parent;
      const parentId = parent.id;

      if (!parentMessages.has(parentId)) {
        parentMessages.set(parentId, {
          phone: formatPhoneNumber(parent.phone),
          name: `${parent.first_name} ${parent.last_name}`,
          children: []
        });
      }

      parentMessages.get(parentId).children.push({
        playerName: `${sub.player.first_name} ${sub.player.last_name}`,
        programName: sub.program?.name || 'Unknown',
        endDate: sub.end_date
      });
    }

    // Send SMS to each parent
    for (const [parentId, data] of parentMessages) {
      try {
        const childrenInfo = data.children.map(c => 
          `${c.playerName} (${c.programName})`
        ).join(', ');

        let message = setting.message
          .replace('{parent_name}', data.name)
          .replace('{children}', childrenInfo)
          .replace('{days}', daysBefore.toString())
          .replace('{end_date}', data.children[0]?.endDate || '');

        await smsService.send(data.phone, message);

        // Log SMS
        await SMS.create({
          sender_id: null, // System
          recipient_type: 'individual',
          recipients: [{ phone: data.phone, name: data.name }],
          message,
          template_id: 'auto_subscription_expiring',
          status: 'sent',
          sent_at: new Date(),
          total_recipients: 1,
          successful_count: 1
        });

        result.sent++;
      } catch (error) {
        console.error(`Failed to send SMS to ${data.phone}:`, error.message);
        result.failed++;
      }
    }

    return result;
  }

  /**
   * Process payment overdue reminders
   */
  async processPaymentOverdue(setting) {
    const result = { sent: 0, failed: 0 };
    const daysAfter = setting.days_after || 3;

    // Calculate target date (subscriptions that expired X days ago)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - daysAfter);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    // Find expired subscriptions without renewal
    const expiredSubs = await Subscription.findAll({
      where: {
        status: 'expired',
        end_date: {
          [Op.lte]: targetDateStr
        }
      },
      include: [
        {
          association: 'player',
          where: { status: 'active' },
          include: [
            { association: 'parent', attributes: ['id', 'first_name', 'last_name', 'phone'] }
          ]
        },
        { association: 'program', attributes: ['id', 'name', 'price_monthly'] }
      ]
    });

    // Group by parent
    const parentMessages = new Map();

    for (const sub of expiredSubs) {
      if (!sub.player?.parent?.phone) continue;

      const parent = sub.player.parent;
      const parentId = parent.id;

      if (!parentMessages.has(parentId)) {
        parentMessages.set(parentId, {
          phone: formatPhoneNumber(parent.phone),
          name: `${parent.first_name} ${parent.last_name}`,
          totalDue: 0,
          children: []
        });
      }

      const amount = parseFloat(sub.program?.price_monthly || sub.total_amount || 0);
      parentMessages.get(parentId).totalDue += amount;
      parentMessages.get(parentId).children.push({
        playerName: `${sub.player.first_name} ${sub.player.last_name}`,
        programName: sub.program?.name || 'Unknown',
        amount
      });
    }

    // Send SMS
    for (const [parentId, data] of parentMessages) {
      try {
        let message = setting.message
          .replace('{parent_name}', data.name)
          .replace('{total_due}', data.totalDue.toFixed(2))
          .replace('{days_overdue}', daysAfter.toString());

        await smsService.send(data.phone, message);

        await SMS.create({
          sender_id: null,
          recipient_type: 'individual',
          recipients: [{ phone: data.phone, name: data.name }],
          message,
          template_id: 'auto_payment_overdue',
          status: 'sent',
          sent_at: new Date(),
          total_recipients: 1,
          successful_count: 1
        });

        result.sent++;
      } catch (error) {
        console.error(`Failed to send SMS to ${data.phone}:`, error.message);
        result.failed++;
      }
    }

    return result;
  }

  /**
   * Process session reminder
   */
  async processSessionReminder(setting) {
    const result = { sent: 0, failed: 0 };
    const daysBefore = setting.days_before || 1;

    // Get tomorrow's day of week
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + daysBefore);
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][tomorrow.getDay()];

    // Find programs with sessions tomorrow
    const programs = await Program.findAll({
      where: { is_active: true },
      include: [
        {
          association: 'players',
          where: { status: 'active' },
          include: [
            { association: 'parent', attributes: ['id', 'first_name', 'last_name', 'phone'] }
          ]
        }
      ]
    });

    // Filter programs that have sessions on that day
    const programsWithSessions = programs.filter(program => {
      const schedule = program.schedule || [];
      return schedule.some(s => s.day?.toLowerCase() === dayOfWeek);
    });

    // Group by parent
    const parentMessages = new Map();

    for (const program of programsWithSessions) {
      const sessionInfo = (program.schedule || []).find(s => s.day?.toLowerCase() === dayOfWeek);

      for (const player of program.players || []) {
        if (!player.parent?.phone) continue;

        const parent = player.parent;
        const parentId = parent.id;

        if (!parentMessages.has(parentId)) {
          parentMessages.set(parentId, {
            phone: formatPhoneNumber(parent.phone),
            name: `${parent.first_name} ${parent.last_name}`,
            sessions: []
          });
        }

        parentMessages.get(parentId).sessions.push({
          playerName: `${player.first_name} ${player.last_name}`,
          programName: program.name,
          time: sessionInfo?.start_time || 'TBD'
        });
      }
    }

    // Send SMS
    for (const [parentId, data] of parentMessages) {
      try {
        const sessionsInfo = data.sessions.map(s => 
          `${s.playerName} - ${s.programName} at ${s.time}`
        ).join('\n');

        let message = setting.message
          .replace('{parent_name}', data.name)
          .replace('{sessions}', sessionsInfo)
          .replace('{date}', tomorrow.toISOString().split('T')[0]);

        await smsService.send(data.phone, message);

        await SMS.create({
          sender_id: null,
          recipient_type: 'individual',
          recipients: [{ phone: data.phone, name: data.name }],
          message,
          template_id: 'auto_session_reminder',
          status: 'sent',
          sent_at: new Date(),
          total_recipients: 1,
          successful_count: 1
        });

        result.sent++;
      } catch (error) {
        console.error(`Failed to send SMS to ${data.phone}:`, error.message);
        result.failed++;
      }
    }

    return result;
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    console.log('🛑 Stopping SMS Scheduler...');
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
  }

  /**
   * Process accountant auto announcements (same trigger logic as SMS but creates announcements)
   */
  async processAccountantAutoAnnouncements(now) {
    console.log('📢 [AccountantAuto] Processing accountant auto announcements...');
    console.log('📢 [AccountantAuto] Current time:', now.timeStr, 'Current date:', now.dateStr);
    
    const settings = await AccountantAutoAnnouncement.findAll({
      where: { enabled: true }
    });

    console.log(`📢 [AccountantAuto] Found ${settings.length} enabled settings`);

    const currentTime = now.timeStr; // e.g. "09:00"
    const currentHour = parseInt(currentTime.split(':')[0]);
    const currentMinute = parseInt(currentTime.split(':')[1]);

    for (const setting of settings) {
      // Check if already run today (use Riyadh timezone for comparison)
      if (setting.last_run_at) {
        const lastRunDateRiyadh = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date(setting.last_run_at));
        if (lastRunDateRiyadh === now.dateStr) {
          console.log(`📢 [AccountantAuto] Skipping "${setting.title}" - already ran today (last_run_at: ${setting.last_run_at}, riyadh: ${lastRunDateRiyadh})`);
          continue;
        }
      }

      // Check if current time matches send_time (allow 2-minute window)
      const settingTime = setting.send_time ? setting.send_time.substring(0, 5) : '09:00';
      const settingHour = parseInt(settingTime.split(':')[0]);
      const settingMinute = parseInt(settingTime.split(':')[1]);
      const currentTotalMin = currentHour * 60 + currentMinute;
      const settingTotalMin = settingHour * 60 + settingMinute;
      // Only fire if we're at or up to 2 minutes past the scheduled time (catches restarts)
      console.log(`📢 [AccountantAuto] Setting "${setting.title}" - scheduled: ${settingTime}, current: ${currentTime}, totalMin: ${currentTotalMin} vs ${settingTotalMin}`);
      if (currentTotalMin < settingTotalMin || currentTotalMin > settingTotalMin + 2) {
        console.log(`📢 [AccountantAuto] Skipping "${setting.title}" - time not matched`);
        continue;
      }
      console.log(`📢 [AccountantAuto] Time matched for "${setting.title}"!`);

      try {
        let shouldSend = false;

        if (setting.type === 'subscription_expiring') {
          if (setting.trigger_mode === 'specific_date' && setting.specific_date) {
            // Send on the specific date (regardless of subscriptions)
            shouldSend = (now.dateStr === setting.specific_date);
          } else {
            // Send if there are subscriptions expiring in X days
            const daysBefore = setting.days_before || 7;
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + daysBefore);
            const targetDateStr = targetDate.toISOString().split('T')[0];

            const count = await Subscription.count({
              where: { status: 'active', end_date: targetDateStr }
            });
            shouldSend = count > 0;
          }
        } else if (setting.type === 'payment_overdue') {
          // Send if there are overdue subscriptions
          const daysAfter = setting.days_after || 3;
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() - daysAfter);
          const targetDateStr = targetDate.toISOString().split('T')[0];

          const count = await Subscription.count({
            where: { status: 'active', end_date: targetDateStr }
          });
          shouldSend = count > 0;
        }

        console.log(`📢 [AccountantAuto] "${setting.title}" shouldSend=${shouldSend}, type=${setting.type}, trigger_mode=${setting.trigger_mode}`);
        if (!shouldSend) {
          // Mark as checked today so we don't re-check every minute
          await setting.update({ last_run_at: new Date() });
          console.log(`📢 [AccountantAuto] "${setting.title}" - no matching criteria, marked as checked`);
          continue;
        }

        // Map audience: accountant announcements only go to parents & players
        let mappedAudience = setting.target_audience;
        let targetBranchId = null;
        if (!mappedAudience || mappedAudience.type === 'all' || mappedAudience === 'all') {
          // "All" in accountant context means all parents & players, NOT all roles
          mappedAudience = { type: 'roles', roles: ['parent', 'player'] };
        } else if (mappedAudience.type === 'branches' && Array.isArray(mappedAudience.branches)) {
          // Convert 'branches' format from ParentAudienceSelector to 'specific' format
          // Frontend sends: { type: 'branches', branches: [{ branchId, group: 'parents'|'players' }] }
          // Socket expects: { type: 'specific', branches: { [branchId]: { roles: ['parent','player'] } }, users: [] }
          const branchesMap = {};
          for (const entry of mappedAudience.branches) {
            const bId = entry.branchId;
            if (!bId) continue;
            if (!branchesMap[bId]) branchesMap[bId] = { roles: [] };
            const role = entry.group === 'parents' ? 'parent' : entry.group === 'players' ? 'player' : entry.group;
            if (!branchesMap[bId].roles.includes(role)) {
              branchesMap[bId].roles.push(role);
            }
          }
          mappedAudience = { type: 'specific', branches: branchesMap, users: [] };
          // If only one branch selected, set target_branch_id for proper scoping
          const branchIds = Object.keys(branchesMap);
          if (branchIds.length === 1) {
            targetBranchId = branchIds[0];
          }
        }

        // Create an announcement
        const createdAnnouncement = await Announcement.create({
          title: setting.title,
          content: setting.message,
          type: 'general',
          priority: 'medium',
          author_id: setting.created_by,
          target_audience: mappedAudience,
          target_branch_id: targetBranchId,
          target_program_id: null,
          expires_at: null,
          is_pinned: false,
          send_notification: true,
          send_sms: false,
          is_published: true,
          published_at: new Date()
        });

        await setting.update({
          last_run_at: new Date(),
          last_run_count: (setting.last_run_count || 0) + 1
        });

        const hydratedAnnouncement = await Announcement.findByPk(createdAnnouncement.id, {
          include: [
            { association: 'author', attributes: ['id', 'first_name', 'last_name'] },
            { association: 'target_branch', attributes: ['id', 'name'] }
          ]
        });

        emitAnnouncementCreated(hydratedAnnouncement, hydratedAnnouncement.target_audience);
        console.log(`📢 Accountant auto announcement "${setting.title}" sent successfully`);
      } catch (error) {
        console.error(`❌ Error processing accountant auto announcement "${setting.title}":`, error);
      }
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobsCount: this.jobs.length,
      nextRun: this.jobs.length > 0 ? 'Auto SMS daily at 09:00 AM, automatic announcements every minute (Asia/Riyadh)' : 'Not scheduled'
    };
  }
}

// Export singleton instance
const scheduler = new SMSScheduler();
module.exports = scheduler;

