const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Branch = sequelize.define('Branch', {
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
    code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    region: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    manager_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true
    },
    capacity: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 100
    },
    facilities: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    working_hours: {
      type: DataTypes.JSON,
      defaultValue: {
        sunday: { open: '08:00', close: '22:00', closed: false },
        monday: { open: '08:00', close: '22:00', closed: false },
        tuesday: { open: '08:00', close: '22:00', closed: false },
        wednesday: { open: '08:00', close: '22:00', closed: false },
        thursday: { open: '08:00', close: '22:00', closed: false },
        friday: { open: '14:00', close: '22:00', closed: false },
        saturday: { open: '08:00', close: '22:00', closed: false }
      }
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    settings: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'branches',
    timestamps: true,
    underscored: true
  });

  // Associations
  Branch.associate = (models) => {
    Branch.belongsTo(models.User, {
      foreignKey: 'manager_id',
      as: 'manager'
    });
    Branch.hasMany(models.User, {
      foreignKey: 'branch_id',
      as: 'staff'
    });
    Branch.hasMany(models.Program, {
      foreignKey: 'branch_id',
      as: 'programs'
    });
    Branch.hasMany(models.Player, {
      foreignKey: 'branch_id',
      as: 'players'
    });
    Branch.hasMany(models.TrainingSession, {
      foreignKey: 'branch_id',
      as: 'training_sessions'
    });
    Branch.hasMany(models.Waitlist, {
      foreignKey: 'branch_id',
      as: 'waitlist_entries'
    });
  };

  return Branch;
};

