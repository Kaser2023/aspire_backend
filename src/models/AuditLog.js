const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    module: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    entity_type: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    entity_id: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    action: {
      type: DataTypes.ENUM('create', 'update', 'delete', 'toggle', 'bulk_update'),
      allowNull: false
    },
    actor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    actor_role: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    before_data: {
      type: DataTypes.JSON,
      allowNull: true
    },
    after_data: {
      type: DataTypes.JSON,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    }
  }, {
    tableName: 'audit_logs',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['module'] },
      { fields: ['entity_type', 'entity_id'] },
      { fields: ['actor_id'] },
      { fields: ['created_at'] }
    ]
  });

  AuditLog.associate = (models) => {
    AuditLog.belongsTo(models.User, {
      foreignKey: 'actor_id',
      as: 'actor'
    });
  };

  return AuditLog;
};
