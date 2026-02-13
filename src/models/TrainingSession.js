const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const TrainingSession = sequelize.define('TrainingSession', {
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
    branch_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'branches',
        key: 'id'
      }
    },
    coach_id: {
      type: DataTypes.UUID,
      allowNull: false, // Coach is REQUIRED
      references: {
        model: 'users',
        key: 'id'
      }
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    day_of_week: {
      type: DataTypes.ENUM('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'),
      allowNull: false
    },
    start_time: {
      type: DataTypes.TIME,
      allowNull: false
    },
    end_time: {
      type: DataTypes.TIME,
      allowNull: false
    },
    facility: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    max_capacity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 20
    },
    current_enrollment: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    is_recurring: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    is_cancelled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    cancellation_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    cancelled_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    cancelled_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    attendance_marked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    reminder_sent_24h: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    reminder_sent_1h: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    tableName: 'training_sessions',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['program_id'] },
      { fields: ['branch_id'] },
      { fields: ['coach_id'] },
      { fields: ['date'] },
      { fields: ['day_of_week'] },
      { fields: ['is_cancelled'] },
      { fields: ['is_recurring'] },
      { fields: ['attendance_marked'] },
      {
        name: 'coach_schedule_conflict_check',
        fields: ['coach_id', 'date', 'start_time', 'end_time']
      },
      {
        name: 'facility_conflict_check',
        fields: ['branch_id', 'facility', 'date', 'start_time', 'end_time']
      },
      {
        name: 'branch_date_sessions',
        fields: ['branch_id', 'date', 'is_cancelled']
      }
    ]
  });

  // Associations
  TrainingSession.associate = (models) => {
    TrainingSession.belongsTo(models.Program, {
      foreignKey: 'program_id',
      as: 'program'
    });

    TrainingSession.belongsTo(models.Branch, {
      foreignKey: 'branch_id',
      as: 'branch'
    });

    TrainingSession.belongsTo(models.User, {
      foreignKey: 'coach_id',
      as: 'coach'
    });

    TrainingSession.belongsTo(models.User, {
      foreignKey: 'cancelled_by',
      as: 'canceller'
    });

    TrainingSession.hasMany(models.Attendance, {
      foreignKey: 'session_id',
      as: 'attendance_records'
    });
  };

  return TrainingSession;
};
