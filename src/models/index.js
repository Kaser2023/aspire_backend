const { Sequelize } = require('sequelize');
const config = require('../config/database');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// Create Sequelize instance
const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging,
    define: dbConfig.define,
    pool: dbConfig.pool,
    timezone: dbConfig.timezone || '+03:00', // Saudi Arabia timezone
    dialectOptions: dbConfig.dialectOptions || {
      dateStrings: true,
      typeCast: true
    }
  }
);

// Import models
const User = require('./User')(sequelize);
const Branch = require('./Branch')(sequelize);
const Program = require('./Program')(sequelize);
const Player = require('./Player')(sequelize);
const Subscription = require('./Subscription')(sequelize);
const Payment = require('./Payment')(sequelize);
const Attendance = require('./Attendance')(sequelize);
const SMS = require('./SMS')(sequelize);
const Announcement = require('./Announcement')(sequelize);
const Session = require('./Session')(sequelize);
const OTP = require('./OTP')(sequelize);
const AutoSMSSettings = require('./AutoSMSSettings')(sequelize);
const CoachProgram = require('./CoachProgram')(sequelize);
const AutomaticAnnouncement = require('./AutomaticAnnouncement')(sequelize);
const Notification = require('./Notification')(sequelize);
const CoachAttendance = require('./CoachAttendance')(sequelize);
const BranchAnnouncement = require('./BranchAnnouncement')(sequelize);
const TrainingSession = require('./TrainingSession')(sequelize);
const Waitlist = require('./Waitlist')(sequelize);
const Evaluation = require('./Evaluation')(sequelize);
const ProgramPricingPlan = require('./ProgramPricingPlan')(sequelize);
const Expense = require('./Expense')(sequelize);
const AccountantAutoAnnouncement = require('./AccountantAutoAnnouncement')(sequelize);
const Discount = require('./Discount')(sequelize);
const SubscriptionFreeze = require('./SubscriptionFreeze')(sequelize);
const AuditLog = require('./AuditLog')(sequelize);

// Define associations
const models = {
  User,
  Branch,
  Program,
  Player,
  Subscription,
  Payment,
  Attendance,
  SMS,
  Announcement,
  Session,
  OTP,
  AutoSMSSettings,
  CoachProgram,
  AutomaticAnnouncement,
  Notification,
  CoachAttendance,
  BranchAnnouncement,
  TrainingSession,
  Waitlist,
  Evaluation,
  ProgramPricingPlan,
  Expense,
  AccountantAutoAnnouncement,
  Discount,
  SubscriptionFreeze,
  AuditLog
};

// Run associations
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

module.exports = {
  sequelize,
  Sequelize,
  ...models
};

