const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true, // Allow null for users who only use phone login
      //unique: true, // Temporarily removed due to key limit
      validate: {
        isEmail: {
          msg: 'Must be a valid email address'
        }
      }
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: true // Allow null for OTP-only users (parents)
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true
      // unique: true // Temporarily removed due to key limit
    },
    first_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    last_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    name_ar: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: 'Full name in Arabic'
    },
    date_of_birth: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    role: {
      type: DataTypes.ENUM('parent', 'coach', 'branch_admin', 'accountant', 'super_admin', 'owner'),
      allowNull: false,
      defaultValue: 'parent'
    },
    account_type: {
      type: DataTypes.ENUM('parent', 'self_player'),
      allowNull: false,
      defaultValue: 'parent'
    },
    avatar: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    branch_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'branches',
        key: 'id'
      }
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    is_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    last_login: {
      type: DataTypes.DATE,
      allowNull: true
    },
    password_reset_token: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    password_reset_expires: {
      type: DataTypes.DATE,
      allowNull: true
    },
    preferences: {
      type: DataTypes.JSON,
      defaultValue: {
        language: 'ar',
        notifications: {
          email: true,
          sms: true,
          push: true
        }
      }
    },
    permissions: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null
      // Custom permissions for super_admin role
      // Example: { branches: ['read', 'write'], users: ['read', 'write', 'delete'] }
    }
  }, {
    tableName: 'users',
    timestamps: true,
    underscored: true,
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(12);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          const salt = await bcrypt.genSalt(12);
          user.password = await bcrypt.hash(user.password, salt);
        }
      }
    }
  });

  // Instance methods
  User.prototype.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
  };

  User.prototype.toJSON = function() {
    const values = { ...this.get() };
    delete values.password;
    delete values.password_reset_token;
    delete values.password_reset_expires;
    return values;
  };

  // Associations
  User.associate = (models) => {
    User.belongsTo(models.Branch, {
      foreignKey: 'branch_id',
      as: 'branch'
    });
    User.hasMany(models.Player, {
      foreignKey: 'parent_id',
      as: 'children'
    });
    User.hasMany(models.Payment, {
      foreignKey: 'user_id',
      as: 'payments'
    });
    User.hasMany(models.Session, {
      foreignKey: 'user_id',
      as: 'sessions'
    });
    
    // For coaches - many-to-many relationship with programs
    User.belongsToMany(models.Program, {
      through: models.CoachProgram,
      foreignKey: 'coach_id',
      otherKey: 'program_id',
      as: 'programs',
      constraints: false
    });
  };

  return User;
};

