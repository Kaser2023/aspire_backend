const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Payment = sequelize.define('Payment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    invoice_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    player_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'players',
        key: 'id'
      }
    },
    subscription_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'subscriptions',
        key: 'id'
      }
    },
    branch_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'branches',
        key: 'id'
      }
    },
    pricing_plan_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'program_pricing_plans',
        key: 'id'
      }
    },
    type: {
      type: DataTypes.ENUM('subscription', 'registration', 'product', 'other'),
      defaultValue: 'subscription'
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    tax_amount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    total_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'SAR'
    },
    payment_method: {
      type: DataTypes.ENUM('cash', 'credit_card', 'bank_transfer', 'mada', 'apple_pay', 'stc_pay'),
      defaultValue: 'cash'
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded', 'cancelled'),
      defaultValue: 'pending'
    },
    transaction_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    payment_gateway_response: {
      type: DataTypes.JSON,
      allowNull: true
    },
    paid_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    due_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    receipt_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    processed_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'payments',
    timestamps: true,
    underscored: true,
    hooks: {
      beforeValidate: async (payment) => {
        if (!payment.invoice_number) {
          const count = await Payment.count();
          const date = new Date();
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          payment.invoice_number = `INV-${year}${month}-${String(count + 1).padStart(6, '0')}`;
        }
      }
    }
  });

  // Associations
  Payment.associate = (models) => {
    Payment.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
    Payment.belongsTo(models.Player, {
      foreignKey: 'player_id',
      as: 'player'
    });
    Payment.belongsTo(models.Subscription, {
      foreignKey: 'subscription_id',
      as: 'subscription'
    });
    Payment.belongsTo(models.Branch, {
      foreignKey: 'branch_id',
      as: 'branch'
    });
    Payment.belongsTo(models.ProgramPricingPlan, {
      foreignKey: 'pricing_plan_id',
      as: 'pricing_plan'
    });
    Payment.belongsTo(models.User, {
      foreignKey: 'processed_by',
      as: 'processor'
    });
  };

  return Payment;
};

