const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Program = sequelize.define('Program', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    name_ar: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    description_ar: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    type: {
      type: DataTypes.ENUM('training', 'competition', 'camp', 'private'),
      defaultValue: 'training'
    },
    sport_type: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'football'
    },
    branch_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'branches',
        key: 'id'
      }
    },
    age_group_min: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 5
    },
    age_group_max: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 18
    },
    capacity: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 20
    },
    current_enrollment: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    price_monthly: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    price_quarterly: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    price_annual: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    registration_fee: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    schedule: {
      type: DataTypes.JSON,
      defaultValue: []
      // Example: [{ day: 'sunday', start_time: '16:00', end_time: '18:00' }]
    },
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    image: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    features: {
      type: DataTypes.JSON,
      defaultValue: []
    }
  }, {
    tableName: 'programs',
    timestamps: true,
    underscored: true
  });

  // Associations
  Program.associate = (models) => {
    Program.belongsTo(models.Branch, {
      foreignKey: 'branch_id',
      as: 'branch'
    });
    
    // Many-to-many relationship with coaches
    Program.belongsToMany(models.User, {
      through: models.CoachProgram,
      foreignKey: 'program_id',
      otherKey: 'coach_id',
      as: 'coaches',
      constraints: false
    });
    
    Program.hasMany(models.Player, {
      foreignKey: 'program_id',
      as: 'players'
    });
    Program.hasMany(models.Subscription, {
      foreignKey: 'program_id',
      as: 'subscriptions'
    });
    Program.hasMany(models.Attendance, {
      foreignKey: 'program_id',
      as: 'attendance_records'
    });
    Program.hasMany(models.TrainingSession, {
      foreignKey: 'program_id',
      as: 'training_sessions'
    });
    Program.hasMany(models.Waitlist, {
      foreignKey: 'program_id',
      as: 'waitlist_entries'
    });
    Program.hasMany(models.ProgramPricingPlan, {
      foreignKey: 'program_id',
      as: 'pricing_plans'
    });
  };

  return Program;
};

