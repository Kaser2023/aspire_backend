const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CoachProgram = sequelize.define('CoachProgram', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    coach_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
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
    is_primary: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether this is the primary coach for the program'
    },
    assigned_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'coach_programs',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['coach_id', 'program_id']
      }
    ]
  });

  // Associations
  CoachProgram.associate = (models) => {
    CoachProgram.belongsTo(models.User, {
      foreignKey: 'coach_id',
      as: 'coach'
    });
    CoachProgram.belongsTo(models.Program, {
      foreignKey: 'program_id',
      as: 'program'
    });
  };

  return CoachProgram;
};
