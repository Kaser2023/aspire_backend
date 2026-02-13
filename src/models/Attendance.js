const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Attendance = sequelize.define('Attendance', {
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
    session_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'training_sessions',
        key: 'id'
      }
    },
    session_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    session_time: {
      type: DataTypes.TIME,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('present', 'absent', 'late', 'leave'),
      defaultValue: 'present'
    },
    check_in_time: {
      type: DataTypes.TIME,
      allowNull: true
    },
    check_out_time: {
      type: DataTypes.TIME,
      allowNull: true
    },
    recorded_by: {
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
    excuse_reason: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    performance_rating: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 5
      }
    },
    performance_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'attendance',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['player_id', 'program_id', 'session_date']
      }
    ]
  });

  // Associations
  Attendance.associate = (models) => {
    Attendance.belongsTo(models.Player, {
      foreignKey: 'player_id',
      as: 'player'
    });
    Attendance.belongsTo(models.Program, {
      foreignKey: 'program_id',
      as: 'program'
    });
    Attendance.belongsTo(models.TrainingSession, {
      foreignKey: 'session_id',
      as: 'session'
    });
    Attendance.belongsTo(models.User, {
      foreignKey: 'recorded_by',
      as: 'recorder'
    });
  };

  return Attendance;
};

