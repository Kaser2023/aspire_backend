const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Player = sequelize.define('Player', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    registration_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    first_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    last_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    first_name_ar: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    last_name_ar: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    date_of_birth: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    gender: {
      type: DataTypes.ENUM('male', 'female'),
      allowNull: false,
      defaultValue: 'male'
    },
    national_id: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    nationality: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    address: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    parent_id: {
      type: DataTypes.UUID,
      allowNull: false, // Reverted to match existing database constraint
      references: {
        model: 'users',
        key: 'id'
      }
    },
    self_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'Links player to their own user account (for self-registered players)'
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
    coach_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'suspended', 'graduated'),
      defaultValue: 'active'
    },
    avatar: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    medical_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    allergies: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    emergency_contact_name: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    emergency_contact_phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    emergency_contact_relation: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    school_name: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    grade_level: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    jersey_size: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    shoe_size: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    position: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    skill_level: {
      type: DataTypes.ENUM('beginner', 'intermediate', 'advanced', 'professional'),
      defaultValue: 'beginner'
    },
    join_date: {
      type: DataTypes.DATEONLY,
      defaultValue: DataTypes.NOW
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    id_document: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Path to uploaded ID document file'
    }
  }, {
    tableName: 'players',
    timestamps: true,
    underscored: true,
    hooks: {
      beforeValidate: async (player) => {
        // Generate registration number before validation runs
        if (!player.registration_number) {
          const count = await Player.count();
          const year = new Date().getFullYear();
          player.registration_number = `PLR-${year}-${String(count + 1).padStart(5, '0')}`;
        }
      }
    }
  });

  // Virtual field for age
  Player.prototype.getAge = function() {
    const today = new Date();
    const birthDate = new Date(this.date_of_birth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Associations
  Player.associate = (models) => {
    Player.belongsTo(models.User, {
      foreignKey: 'parent_id',
      as: 'parent'
    });
    Player.belongsTo(models.User, {
      foreignKey: 'self_user_id',
      as: 'selfUser'
    });
    Player.belongsTo(models.Branch, {
      foreignKey: 'branch_id',
      as: 'branch'
    });
    Player.belongsTo(models.Program, {
      foreignKey: 'program_id',
      as: 'program'
    });
    Player.belongsTo(models.User, {
      foreignKey: 'coach_id',
      as: 'coach'
    });
    Player.hasMany(models.Subscription, {
      foreignKey: 'player_id',
      as: 'subscriptions'
    });
    Player.hasMany(models.Attendance, {
      foreignKey: 'player_id',
      as: 'attendance_records'
    });
    Player.hasMany(models.Payment, {
      foreignKey: 'player_id',
      as: 'payments'
    });
    Player.hasMany(models.Waitlist, {
      foreignKey: 'player_id',
      as: 'waitlist_entries'
    });
  };

  return Player;
};

