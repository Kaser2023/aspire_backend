const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CoachAttendance = sequelize.define('CoachAttendance', {
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
    branch_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'branches',
        key: 'id'
      }
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('present', 'absent', 'late', 'leave'),
      defaultValue: 'absent'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    recorded_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'coach_attendance',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['coach_id', 'date']
      }
    ]
  });

  CoachAttendance.associate = (models) => {
    CoachAttendance.belongsTo(models.User, {
      foreignKey: 'coach_id',
      as: 'coach'
    });
    CoachAttendance.belongsTo(models.Branch, {
      foreignKey: 'branch_id',
      as: 'branch'
    });
    CoachAttendance.belongsTo(models.User, {
      foreignKey: 'recorded_by',
      as: 'recorder'
    });
  };

  return CoachAttendance;
};
