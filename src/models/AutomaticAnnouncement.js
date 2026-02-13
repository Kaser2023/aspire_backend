const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AutomaticAnnouncement = sequelize.define('AutomaticAnnouncement', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('payment_reminder', 'session_reminder', 'welcome', 'holiday', 'general'),
      defaultValue: 'general'
    },
    target_audience: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: { type: 'all' },
      comment: 'JSON structure: { type: "all"|"roles"|"specific", roles: [], branches: {}, users: [] }'
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
    send_time: {
      type: DataTypes.TIME,
      allowNull: false
    },
    send_days: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    send_notification: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    last_sent_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    send_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    tableName: 'automatic_announcements',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  // Associations
  AutomaticAnnouncement.associate = function(models) {
    // AutomaticAnnouncement belongs to User (creator)
    AutomaticAnnouncement.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator'
    });
  };

  return AutomaticAnnouncement;
};
