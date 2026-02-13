const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Discount = sequelize.define('Discount', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    branch_id: {
      type: DataTypes.UUID,
      allowNull: false,
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
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'Parent user ID - discount applies to all their children'
    },
    player_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'players',
        key: 'id'
      },
      comment: 'Specific player - most targeted scope'
    },
    pricing_plan_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'program_pricing_plans',
        key: 'id'
      },
      comment: 'Optional: discount only applies to this specific pricing plan'
    },
    discount_type: {
      type: DataTypes.ENUM('percentage', 'fixed'),
      allowNull: false,
      defaultValue: 'fixed'
    },
    discount_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0
      }
    },
    reason: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'used', 'expired', 'cancelled'),
      allowNull: false,
      defaultValue: 'active'
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    used_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    payment_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'payments',
        key: 'id'
      }
    },
    expires_at: {
      type: DataTypes.DATEONLY,
      allowNull: true
    }
  }, {
    tableName: 'discounts',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['branch_id'] },
      { fields: ['program_id'] },
      { fields: ['user_id'] },
      { fields: ['player_id'] },
      { fields: ['status'] },
      { fields: ['created_by'] }
    ]
  });

  // Associations
  Discount.associate = (models) => {
    Discount.belongsTo(models.Branch, { foreignKey: 'branch_id', as: 'branch' });
    Discount.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
    Discount.belongsTo(models.User, { foreignKey: 'user_id', as: 'parent' });
    Discount.belongsTo(models.Player, { foreignKey: 'player_id', as: 'player' });
    Discount.belongsTo(models.ProgramPricingPlan, { foreignKey: 'pricing_plan_id', as: 'pricingPlan' });
    Discount.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    Discount.belongsTo(models.Payment, { foreignKey: 'payment_id', as: 'payment' });
  };

  return Discount;
};
