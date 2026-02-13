const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AccountantAutoAnnouncement = sequelize.define('AccountantAutoAnnouncement', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('subscription_expiring', 'payment_overdue'),
      allowNull: false
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    trigger_mode: {
      type: DataTypes.ENUM('days', 'specific_date'),
      defaultValue: 'days'
    },
    days_before: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 7
    },
    days_after: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 3
    },
    specific_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    send_time: {
      type: DataTypes.TIME,
      defaultValue: '09:00:00'
    },
    target_audience: {
      type: DataTypes.JSON,
      allowNull: true
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
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
    tableName: 'accountant_auto_announcements',
    timestamps: true,
    underscored: true
  });

  AccountantAutoAnnouncement.associate = function(models) {
    AccountantAutoAnnouncement.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator'
    });
  };

  return AccountantAutoAnnouncement;
};
