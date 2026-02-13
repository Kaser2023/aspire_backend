const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Subscription = sequelize.define('Subscription', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    player_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'players',
        key: 'id'
      }
    },
    program_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'programs',
        key: 'id'
      }
    },
    plan_type: {
      type: DataTypes.ENUM('monthly', 'quarterly', 'annual', 'custom'),
      defaultValue: 'monthly'
    },
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('active', 'expired', 'suspended', 'cancelled', 'pending'),
      defaultValue: 'pending'
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    discount_reason: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    total_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    is_auto_renew: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    renewed_from_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'subscriptions',
        key: 'id'
      }
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'subscriptions',
    timestamps: true,
    underscored: true
  });

  // Associations
  Subscription.associate = (models) => {
    Subscription.belongsTo(models.Player, {
      foreignKey: 'player_id',
      as: 'player'
    });
    Subscription.belongsTo(models.Program, {
      foreignKey: 'program_id',
      as: 'program'
    });
    Subscription.hasMany(models.Payment, {
      foreignKey: 'subscription_id',
      as: 'payments'
    });
    Subscription.belongsTo(Subscription, {
      foreignKey: 'renewed_from_id',
      as: 'previous_subscription'
    });
  };

  return Subscription;
};

