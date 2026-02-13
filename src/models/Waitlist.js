const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Waitlist = sequelize.define('Waitlist', {
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
    branch_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'branches',
        key: 'id'
      }
    },
    parent_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('waiting', 'notified', 'enrolled', 'expired', 'cancelled'),
      defaultValue: 'waiting'
    },
    notified_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    enrolled_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'waitlist',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['player_id'] },
      { fields: ['program_id'] },
      { fields: ['branch_id'] },
      { fields: ['parent_id'] },
      { fields: ['status'] },
      { fields: ['position'] },
      {
        name: 'program_waitlist_order',
        fields: ['program_id', 'status', 'position']
      },
      {
        unique: true,
        name: 'unique_player_program_waitlist',
        fields: ['player_id', 'program_id']
      }
    ]
  });

  // Associations
  Waitlist.associate = (models) => {
    Waitlist.belongsTo(models.Player, {
      foreignKey: 'player_id',
      as: 'player'
    });

    Waitlist.belongsTo(models.Program, {
      foreignKey: 'program_id',
      as: 'program'
    });

    Waitlist.belongsTo(models.Branch, {
      foreignKey: 'branch_id',
      as: 'branch'
    });

    Waitlist.belongsTo(models.User, {
      foreignKey: 'parent_id',
      as: 'parent'
    });
  };

  return Waitlist;
};
