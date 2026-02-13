const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SMS = sequelize.define('SMS', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    sender_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    recipient_type: {
      type: DataTypes.ENUM('individual', 'group', 'branch', 'program', 'all'),
      defaultValue: 'individual'
    },
    recipients: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: []
      // Array of { user_id, phone, name }
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    template_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    branch_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'branches',
        key: 'id'
      }
    },
    program_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'programs',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'delivered', 'failed'),
      defaultValue: 'pending'
    },
    total_recipients: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    successful_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    failed_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    cost: {
      type: DataTypes.DECIMAL(10, 4),
      defaultValue: 0
    },
    provider_response: {
      type: DataTypes.JSON,
      allowNull: true
    },
    scheduled_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    sent_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'sms_messages',
    timestamps: true,
    underscored: true
  });

  // Associations
  SMS.associate = (models) => {
    SMS.belongsTo(models.User, {
      foreignKey: 'sender_id',
      as: 'sender'
    });
    SMS.belongsTo(models.Branch, {
      foreignKey: 'branch_id',
      as: 'branch'
    });
    SMS.belongsTo(models.Program, {
      foreignKey: 'program_id',
      as: 'program'
    });
  };

  return SMS;
};

