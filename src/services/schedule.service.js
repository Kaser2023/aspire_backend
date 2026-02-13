const { Op } = require('sequelize');
const { TrainingSession, Program, Branch, User, Player, Waitlist, Notification, SMS } = require('../models');
const notificationService = require('./notification.service');
const smsService = require('./sms.service');

class ScheduleService {
  /**
   * Check for coach scheduling conflicts
   * @param {string} coachId - Coach UUID
   * @param {string} date - Session date (YYYY-MM-DD)
   * @param {string} startTime - Start time (HH:MM:SS)
   * @param {string} endTime - End time (HH:MM:SS)
   * @param {string} excludeSessionId - Optional session ID to exclude (for updates)
   * @returns {Promise<Array>} Array of conflicting sessions
   */
  async checkCoachConflicts(coachId, date, startTime, endTime, excludeSessionId = null) {
    const whereClause = {
      coach_id: coachId,
      date,
      is_cancelled: false,
      [Op.or]: [
        // New session starts during existing session
        {
          start_time: { [Op.lte]: startTime },
          end_time: { [Op.gt]: startTime }
        },
        // New session ends during existing session
        {
          start_time: { [Op.lt]: endTime },
          end_time: { [Op.gte]: endTime }
        },
        // New session completely contains existing session
        {
          start_time: { [Op.gte]: startTime },
          end_time: { [Op.lte]: endTime }
        }
      ]
    };

    if (excludeSessionId) {
      whereClause.id = { [Op.ne]: excludeSessionId };
    }

    return await TrainingSession.findAll({
      where: whereClause,
      include: [
        {
          model: Program,
          as: 'program',
          attributes: ['name', 'name_ar']
        }
      ]
    });
  }

  /**
   * Check for facility scheduling conflicts
   * @param {string} branchId - Branch UUID
   * @param {string} facility - Facility name
   * @param {string} date - Session date (YYYY-MM-DD)
   * @param {string} startTime - Start time (HH:MM:SS)
   * @param {string} endTime - End time (HH:MM:SS)
   * @param {string} excludeSessionId - Optional session ID to exclude (for updates)
   * @returns {Promise<Array>} Array of conflicting sessions
   */
  async checkFacilityConflicts(branchId, facility, date, startTime, endTime, excludeSessionId = null) {
    if (!facility) return []; // No facility specified, no conflict possible

    const whereClause = {
      branch_id: branchId,
      facility,
      date,
      is_cancelled: false,
      [Op.or]: [
        {
          start_time: { [Op.lte]: startTime },
          end_time: { [Op.gt]: startTime }
        },
        {
          start_time: { [Op.lt]: endTime },
          end_time: { [Op.gte]: endTime }
        },
        {
          start_time: { [Op.gte]: startTime },
          end_time: { [Op.lte]: endTime }
        }
      ]
    };

    if (excludeSessionId) {
      whereClause.id = { [Op.ne]: excludeSessionId };
    }

    return await TrainingSession.findAll({
      where: whereClause,
      include: [
        {
          model: Program,
          as: 'program',
          attributes: ['name', 'name_ar']
        }
      ]
    });
  }

  /**
   * Validate session scheduling
   * @param {Object} sessionData - Session data to validate
   * @returns {Promise<Object>} Validation result with conflicts
   */
  async validateSession(sessionData) {
    const { coach_id, branch_id, facility, date, start_time, end_time, session_id } = sessionData;

    const coachConflicts = await this.checkCoachConflicts(
      coach_id,
      date,
      start_time,
      end_time,
      session_id
    );

    const facilityConflicts = await this.checkFacilityConflicts(
      branch_id,
      facility,
      date,
      start_time,
      end_time,
      session_id
    );

    return {
      isValid: coachConflicts.length === 0 && facilityConflicts.length === 0,
      coachConflicts,
      facilityConflicts
    };
  }

  /**
   * Get day of week from date
   * @param {string} dateString - Date string (YYYY-MM-DD)
   * @returns {string} Day of week (lowercase)
   */
  getDayOfWeek(dateString) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    // Parse date in UTC to avoid timezone shifts
    // YYYY-MM-DD format: split and create date object in UTC
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return days[date.getUTCDay()];
  }

  /**
   * Generate recurring sessions for a program
   * @param {string} programId - Program UUID
   * @param {Object} options - Options for generating sessions
   * @returns {Promise<Array>} Created sessions
   */
  async generateRecurringSessions(programId, options = {}) {
    const { startDate, endDate, weeksAhead = 12 } = options;

    const program = await Program.findByPk(programId);
    if (!program || !program.schedule || program.schedule.length === 0) {
      throw new Error('Program not found or has no schedule defined');
    }

    const start = new Date(startDate || new Date());
    const end = new Date(endDate || new Date(start.getTime() + (weeksAhead * 7 * 24 * 60 * 60 * 1000)));

    const sessionsToCreate = [];
    const currentDate = new Date(start);

    while (currentDate <= end) {
      const dayOfWeek = this.getDayOfWeek(currentDate.toISOString().split('T')[0]);

      // Check if this day has sessions in the program schedule
      const daySchedule = program.schedule.find(s => s.day === dayOfWeek);

      if (daySchedule && daySchedule.sessions) {
        for (const session of daySchedule.sessions) {
          sessionsToCreate.push({
            program_id: programId,
            branch_id: program.branch_id,
            coach_id: session.coach_id,
            date: currentDate.toISOString().split('T')[0],
            day_of_week: dayOfWeek,
            start_time: session.start_time,
            end_time: session.end_time,
            facility: session.facility || null,
            max_capacity: session.max_capacity || program.capacity,
            current_enrollment: program.current_enrollment,
            is_recurring: true
          });
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Bulk create sessions
    return await TrainingSession.bulkCreate(sessionsToCreate);
  }

  /**
   * Send notifications to enrolled players about schedule changes
   * @param {string} sessionId - Training session UUID
   * @param {string} changeType - Type of change (created, updated, cancelled)
   * @param {Object} additionalData - Additional data for notification
   */
  async notifyEnrolledPlayers(sessionId, changeType, additionalData = {}) {
    const session = await TrainingSession.findByPk(sessionId, {
      include: [
        {
          model: Program,
          as: 'program',
          include: [
            {
              model: Player,
              as: 'players',
              include: [
                {
                  model: User,
                  as: 'parent'
                }
              ]
            }
          ]
        },
        {
          model: User,
          as: 'coach',
          attributes: ['first_name', 'last_name', 'name_ar']
        }
      ]
    });

    if (!session || !session.program || !session.program.players) {
      return;
    }

    const players = session.program.players;
    const notifications = [];
    const smsMessages = [];

    for (const player of players) {
      if (!player.parent) continue;

      let titleEn, titleAr, messageEn, messageAr;

      switch (changeType) {
        case 'cancelled':
          titleEn = 'Session Cancelled';
          titleAr = 'تم إلغاء الحصة';
          messageEn = `The ${session.program.name} session on ${session.date} at ${session.start_time} has been cancelled. ${additionalData.reason ? 'Reason: ' + additionalData.reason : ''}`;
          messageAr = `تم إلغاء حصة ${session.program.name_ar} بتاريخ ${session.date} في تمام الساعة ${session.start_time}. ${additionalData.reason ? 'السبب: ' + additionalData.reason : ''}`;
          break;

        case 'rescheduled':
          titleEn = 'Session Rescheduled';
          titleAr = 'تم إعادة جدولة الحصة';
          messageEn = `The ${session.program.name} session has been rescheduled. New time: ${additionalData.newDate} at ${additionalData.newTime}`;
          messageAr = `تم إعادة جدولة حصة ${session.program.name_ar}. الوقت الجديد: ${additionalData.newDate} في تمام الساعة ${additionalData.newTime}`;
          break;

        case 'created':
          titleEn = 'New Session Scheduled';
          titleAr = 'حصة جديدة مجدولة';
          messageEn = `A new ${session.program.name} session has been scheduled for ${session.date} at ${session.start_time}`;
          messageAr = `تم جدولة حصة جديدة لـ ${session.program.name_ar} بتاريخ ${session.date} في تمام الساعة ${session.start_time}`;
          break;

        default:
          titleEn = 'Schedule Update';
          titleAr = 'تحديث الجدول';
          messageEn = `The ${session.program.name} session schedule has been updated.`;
          messageAr = `تم تحديث جدول حصة ${session.program.name_ar}.`;
      }

      // Create in-app notification
      notifications.push({
        user_id: player.parent.id,
        type: 'general',
        title: titleEn,
        title_ar: titleAr,
        message: messageEn,
        message_ar: messageAr,
        data: {
          session_id: sessionId,
          program_id: session.program_id,
          player_id: player.id,
          change_type: changeType,
          ...additionalData
        }
      });

      // Prepare SMS for critical changes (cancellations, reschedules)
      if (['cancelled', 'rescheduled'].includes(changeType) && player.parent.phone) {
        const language = player.parent.preferences?.language || 'ar';
        const smsMessage = language === 'ar' ? messageAr : messageEn;

        smsMessages.push({
          phone: player.parent.phone,
          message: smsMessage,
          parent_id: player.parent.id,
          player_id: player.id
        });
      }
    }

    // Bulk create notifications
    if (notifications.length > 0) {
      await Notification.bulkCreate(notifications);
    }

    // Send SMS messages
    if (smsMessages.length > 0) {
      for (const sms of smsMessages) {
        try {
          await smsService.sendSMS({
            recipient_type: 'individual',
            recipients: [{ phone: sms.phone, user_id: sms.parent_id }],
            message: sms.message
          });
        } catch (error) {
          console.error(`Failed to send SMS to ${sms.phone}:`, error);
        }
      }
    }
  }

  /**
   * Send reminder notifications for upcoming sessions
   * @param {number} hoursAhead - How many hours ahead to check
   */
  async sendSessionReminders(hoursAhead = 24) {
    const now = new Date();
    const targetTime = new Date(now.getTime() + (hoursAhead * 60 * 60 * 1000));

    const reminderField = hoursAhead === 24 ? 'reminder_sent_24h' : 'reminder_sent_1h';

    const upcomingSessions = await TrainingSession.findAll({
      where: {
        date: targetTime.toISOString().split('T')[0],
        is_cancelled: false,
        [reminderField]: false
      },
      include: [
        {
          model: Program,
          as: 'program',
          include: [
            {
              model: Player,
              as: 'players',
              include: [
                {
                  model: User,
                  as: 'parent'
                }
              ]
            }
          ]
        },
        {
          model: User,
          as: 'coach'
        }
      ]
    });

    for (const session of upcomingSessions) {
      if (!session.program || !session.program.players) continue;

      for (const player of session.program.players) {
        if (!player.parent || !player.parent.phone) continue;

        const language = player.parent.preferences?.language || 'ar';
        const sessionTime = `${session.date} at ${session.start_time}`;

        const messageEn = `Reminder: ${player.first_name} has a ${session.program.name} session in ${hoursAhead} hours (${sessionTime}). Coach: ${session.coach?.first_name} ${session.coach?.last_name}`;
        const messageAr = `تذكير: لدى ${player.first_name_ar} حصة ${session.program.name_ar} بعد ${hoursAhead} ساعة (${sessionTime}). المدرب: ${session.coach?.name_ar}`;

        try {
          await smsService.sendSMS({
            recipient_type: 'individual',
            recipients: [{ phone: player.parent.phone, user_id: player.parent.id }],
            message: language === 'ar' ? messageAr : messageEn
          });
        } catch (error) {
          console.error(`Failed to send reminder to ${player.parent.phone}:`, error);
        }
      }

      // Mark reminder as sent
      await session.update({ [reminderField]: true });
    }
  }

  /**
   * Handle waitlist when a spot opens up
   * @param {string} programId - Program UUID
   */
  async processWaitlist(programId) {
    const program = await Program.findByPk(programId);
    if (!program) return;

    // Check if there are available spots
    if (program.current_enrollment >= program.capacity) return;

    const availableSpots = program.capacity - program.current_enrollment;

    // Get waiting players in order
    const waitingPlayers = await Waitlist.findAll({
      where: {
        program_id: programId,
        status: 'waiting'
      },
      order: [['position', 'ASC']],
      limit: availableSpots,
      include: [
        {
          model: Player,
          as: 'player',
          include: [
            {
              model: User,
              as: 'parent'
            }
          ]
        }
      ]
    });

    for (const waitlistEntry of waitingPlayers) {
      // Notify parent about available spot
      const expiresAt = new Date(Date.now() + (48 * 60 * 60 * 1000)); // 48 hours to respond

      await waitlistEntry.update({
        status: 'notified',
        notified_at: new Date(),
        expires_at: expiresAt
      });

      // Send notification
      if (waitlistEntry.player?.parent) {
        const titleEn = 'Spot Available!';
        const titleAr = 'مقعد متاح!';
        const messageEn = `A spot has opened up in ${program.name}! Please confirm enrollment within 48 hours.`;
        const messageAr = `أصبح هناك مقعد متاح في ${program.name_ar}! يرجى تأكيد التسجيل خلال 48 ساعة.`;

        await Notification.create({
          user_id: waitlistEntry.player.parent.id,
          type: 'waitlist_spot_available',
          title: titleEn,
          title_ar: titleAr,
          message: messageEn,
          message_ar: messageAr,
          data: {
            program_id: programId,
            player_id: waitlistEntry.player_id,
            waitlist_id: waitlistEntry.id,
            expires_at: expiresAt
          }
        });

        // Send SMS
        if (waitlistEntry.player.parent.phone) {
          const language = waitlistEntry.player.parent.preferences?.language || 'ar';
          try {
            await smsService.sendSMS({
              recipient_type: 'individual',
              recipients: [{
                phone: waitlistEntry.player.parent.phone,
                user_id: waitlistEntry.player.parent.id
              }],
              message: language === 'ar' ? messageAr : messageEn
            });
          } catch (error) {
            console.error('Failed to send waitlist SMS:', error);
          }
        }
      }
    }
  }
}

module.exports = new ScheduleService();
