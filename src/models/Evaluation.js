const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Evaluation = sequelize.define('Evaluation', {
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
    coach_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
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
    evaluation_type: {
      type: DataTypes.ENUM('quick', 'detailed'),
      defaultValue: 'quick'
    },
    // Quick evaluation fields
    overall_rating: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 5
      }
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Number of goals scored in session
    goals: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    // Detailed evaluation - Technical Skills (1-5)
    ball_control: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1, max: 5 }
    },
    passing: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1, max: 5 }
    },
    shooting: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1, max: 5 }
    },
    dribbling: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1, max: 5 }
    },
    // Physical Skills
    speed: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1, max: 5 }
    },
    stamina: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1, max: 5 }
    },
    strength: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1, max: 5 }
    },
    agility: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1, max: 5 }
    },
    // Mental Attributes
    attitude: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1, max: 5 }
    },
    discipline: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1, max: 5 }
    },
    teamwork: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1, max: 5 }
    },
    effort: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1, max: 5 }
    },
    // Calculated average scores
    technical_avg: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true
    },
    physical_avg: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true
    },
    mental_avg: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true
    },
    evaluation_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'evaluations',
    timestamps: true,
    underscored: true,
    hooks: {
      beforeSave: (evaluation) => {
        // Calculate averages for detailed evaluations
        if (evaluation.evaluation_type === 'detailed') {
          const technical = [evaluation.ball_control, evaluation.passing, evaluation.shooting, evaluation.dribbling].filter(v => v !== null);
          const physical = [evaluation.speed, evaluation.stamina, evaluation.strength, evaluation.agility].filter(v => v !== null);
          const mental = [evaluation.attitude, evaluation.discipline, evaluation.teamwork, evaluation.effort].filter(v => v !== null);
          
          if (technical.length > 0) {
            evaluation.technical_avg = technical.reduce((a, b) => a + b, 0) / technical.length;
          }
          if (physical.length > 0) {
            evaluation.physical_avg = physical.reduce((a, b) => a + b, 0) / physical.length;
          }
          if (mental.length > 0) {
            evaluation.mental_avg = mental.reduce((a, b) => a + b, 0) / mental.length;
          }
        }
      }
    }
  });

  Evaluation.associate = (models) => {
    Evaluation.belongsTo(models.Player, {
      foreignKey: 'player_id',
      as: 'player'
    });
    Evaluation.belongsTo(models.User, {
      foreignKey: 'coach_id',
      as: 'coach'
    });
    Evaluation.belongsTo(models.TrainingSession, {
      foreignKey: 'session_id',
      as: 'session'
    });
  };

  return Evaluation;
};
