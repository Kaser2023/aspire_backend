const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AutoSMSSettings = sequelize.define('AutoSMSSettings', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    title_ar: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    type: {
      type: DataTypes.ENUM('subscription_expiring', 'payment_overdue', 'session_reminder', 'birthday', 'custom'),
      allowNull: false
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    trigger_mode: {
      type: DataTypes.ENUM('days', 'specific_date'),
      defaultValue: 'days',
      comment: 'Whether to trigger by days before/after or on a specific date'
    },
    days_before: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    days_after: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    specific_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: 'Specific date to send the reminder (when trigger_mode is specific_date)'
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    message_ar: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    target_role: {
      type: DataTypes.ENUM('parent', 'coach', 'all'),
      defaultValue: 'parent'
    },
    branch_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'branches',
        key: 'id'
      }
    },
    send_time: {
      type: DataTypes.TIME,
      defaultValue: '09:00:00'
    },
    schedule_type: {
      type: DataTypes.ENUM('date_range', 'specific_days'),
      defaultValue: 'date_range'
    },
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    send_days: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
    },
    target_audience: {
      type: DataTypes.JSON,
      allowNull: true
    },
    last_run_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_run_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    tableName: 'auto_sms_settings',
    timestamps: true,
    underscored: true
  });

  // Associations
  AutoSMSSettings.associate = (models) => {
    AutoSMSSettings.belongsTo(models.Branch, {
      foreignKey: 'branch_id',
      as: 'branch'
    });
  };

  return AutoSMSSettings;
};

