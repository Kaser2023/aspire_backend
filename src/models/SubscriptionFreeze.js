const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SubscriptionFreeze = sequelize.define('SubscriptionFreeze', {
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
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    freeze_days: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    scope: {
      type: DataTypes.ENUM('global', 'branch', 'program'),
      allowNull: false,
      defaultValue: 'global'
    },
    branch_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'branches', key: 'id' }
    },
    program_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'programs', key: 'id' }
    },
    player_id: {
      // Keep compatible with existing players.id column type.
      type: DataTypes.STRING(36),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('scheduled', 'active', 'completed', 'cancelled'),
      allowNull: false,
      defaultValue: 'scheduled'
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' }
    },
    applied: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    subscriptions_affected: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  }, {
    tableName: 'subscription_freezes',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['status'] },
      { fields: ['start_date', 'end_date'] },
      { fields: ['branch_id'] },
      { fields: ['program_id'] },
      { fields: ['player_id'] }
    ]
  });

  SubscriptionFreeze.associate = (models) => {
    SubscriptionFreeze.belongsTo(models.Branch, { foreignKey: 'branch_id', as: 'branch' });
    SubscriptionFreeze.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
    SubscriptionFreeze.belongsTo(models.Player, { foreignKey: 'player_id', as: 'player' });
    SubscriptionFreeze.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
  };

  return SubscriptionFreeze;
};
