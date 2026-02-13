const { Notification, User } = require('../models');
const { Op } = require('sequelize');
const { ROLES } = require('../config/constants');

/**
 * Notification Service
 * Helper functions to create notifications from other controllers
 */
class NotificationService {
  
  /**
   * Create a notification for a specific user
   */
  static async create({ userId, type, title, titleAr, message, messageAr, data }) {
    try {
      return await Notification.create({
        user_id: userId,
        type: type || 'general',
        title,
        title_ar: titleAr,
        message,
        message_ar: messageAr,
        data: data || {}
      });
    } catch (error) {
      console.error('Failed to create notification:', error);
      return null;
    }
  }

  /**
   * Notify all super admins
   */
  static async notifySuperAdmins({ type, title, titleAr, message, messageAr, data }) {
    try {
      const superAdmins = await User.findAll({
        where: { role: { [Op.in]: [ROLES.SUPER_ADMIN, ROLES.OWNER] }, is_active: true },
        attributes: ['id']
      });

      const notifications = superAdmins.map(admin => ({
        user_id: admin.id,
        type: type || 'general',
        title,
        title_ar: titleAr,
        message,
        message_ar: messageAr,
        data: data || {}
      }));

      return await Notification.bulkCreate(notifications);
    } catch (error) {
      console.error('Failed to notify super admins:', error);
      return [];
    }
  }

  /**
   * Notify all accountants
   */
  static async notifyAccountants({ type, title, titleAr, message, messageAr, data }) {
    try {
      const accountants = await User.findAll({
        where: { role: ROLES.ACCOUNTANT, is_active: true },
        attributes: ['id']
      });

      const notifications = accountants.map(accountant => ({
        user_id: accountant.id,
        type: type || 'general',
        title,
        title_ar: titleAr,
        message,
        message_ar: messageAr,
        data: data || {}
      }));

      return await Notification.bulkCreate(notifications);
    } catch (error) {
      console.error('Failed to notify accountants:', error);
      return [];
    }
  }

  /**
   * Notify branch admins of a specific branch
   */
  static async notifyBranchAdmins(branchId, { type, title, titleAr, message, messageAr, data }) {
    try {
      const branchAdmins = await User.findAll({
        where: { role: ROLES.BRANCH_ADMIN, branch_id: branchId, is_active: true },
        attributes: ['id']
      });

      if (branchAdmins.length === 0) return [];

      const notifications = branchAdmins.map(admin => ({
        user_id: admin.id,
        type: type || 'general',
        title,
        title_ar: titleAr,
        message,
        message_ar: messageAr,
        data: data || {}
      }));

      return await Notification.bulkCreate(notifications);
    } catch (error) {
      console.error('Failed to notify branch admins:', error);
      return [];
    }
  }

  /**
   * New player registration notification - notifies Super Admins + Branch Admins
   */
  static async notifyNewRegistration(player, branch, parentName) {
    const notifData = {
      type: 'new_registration',
      title: `New Player: ${player.first_name} ${player.last_name}`,
      titleAr: `لاعب جديد: ${player.first_name_ar || player.first_name} ${player.last_name_ar || player.last_name}`,
      message: `Registered by ${parentName || 'a parent'} at ${branch?.name || 'Unknown Branch'}`,
      messageAr: `تم تسجيله بواسطة ${parentName || 'ولي أمر'} في ${branch?.name_ar || branch?.name || 'فرع غير معروف'}`,
      data: { player_id: player.id, branch_id: branch?.id, parent_name: parentName }
    };

    const results = await Promise.all([
      this.notifySuperAdmins(notifData),
      branch?.id ? this.notifyBranchAdmins(branch.id, notifData) : Promise.resolve([])
    ]);

    return results.flat();
  }

  /**
   * Payment received notification
   */
  static async notifyPaymentReceived(payment, player, amount) {
    return this.notifySuperAdmins({
      type: 'payment_received',
      title: `Payment Received: ${amount} SAR`,
      titleAr: `تم استلام دفعة: ${amount} ريال`,
      message: `Payment from ${player?.first_name || 'Unknown'} ${player?.last_name || ''}`,
      messageAr: `دفعة من ${player?.first_name_ar || player?.first_name || 'غير معروف'}`,
      data: { payment_id: payment.id, player_id: player?.id, amount }
    });
  }

  /**
   * Payment overdue notification
   */
  static async notifyPaymentOverdue(subscription, player) {
    return this.notifySuperAdmins({
      type: 'payment_overdue',
      title: `Payment Overdue: ${player?.first_name || 'Unknown'} ${player?.last_name || ''}`,
      titleAr: `دفعة متأخرة: ${player?.first_name_ar || player?.first_name || 'غير معروف'}`,
      message: `Subscription expired on ${subscription.end_date}`,
      messageAr: `انتهى الاشتراك في ${subscription.end_date}`,
      data: { subscription_id: subscription.id, player_id: player?.id }
    });
  }

  /**
   * Subscription expiring soon notification
   */
  static async notifySubscriptionExpiring(count, daysLeft) {
    return this.notifySuperAdmins({
      type: 'subscription_expiring',
      title: `${count} Subscriptions Expiring in ${daysLeft} Days`,
      titleAr: `${count} اشتراكات تنتهي خلال ${daysLeft} أيام`,
      message: `Review and contact players before expiration`,
      messageAr: `راجع وتواصل مع اللاعبين قبل انتهاء الاشتراك`,
      data: { count, days_left: daysLeft }
    });
  }

  /**
   * System alert notification
   */
  static async notifySystemAlert(title, message, data = {}) {
    return this.notifySuperAdmins({
      type: 'system_alert',
      title,
      titleAr: title,
      message,
      messageAr: message,
      data
    });
  }
}

module.exports = NotificationService;
