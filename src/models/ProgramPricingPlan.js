const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProgramPricingPlan = sequelize.define('ProgramPricingPlan', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    program_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'programs',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    name_ar: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    duration_months: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Duration in months (1=monthly, 3=quarterly, 12=annual, null=custom)'
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    description_ar: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    sort_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    tableName: 'program_pricing_plans',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['program_id'] },
      { fields: ['is_active'] },
      { fields: ['sort_order'] }
    ]
  });

  // Associations
  ProgramPricingPlan.associate = (models) => {
    ProgramPricingPlan.belongsTo(models.Program, {
      foreignKey: 'program_id',
      as: 'program'
    });
  };

  return ProgramPricingPlan;
};
