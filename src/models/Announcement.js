const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Announcement = sequelize.define('Announcement', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    title_ar: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    content_ar: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    type: {
      type: DataTypes.ENUM('general', 'urgent', 'event', 'maintenance'),
      defaultValue: 'general'
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high'),
      defaultValue: 'medium'
    },
    author_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    target_audience: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: { type: 'all' },
      comment: 'JSON structure: { type: "all"|"roles"|"specific", roles: [], branches: {}, users: [] }'
    },
    target_branch_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'branches',
        key: 'id'
      }
    },
    target_program_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'programs',
        key: 'id'
      }
    },
    image: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    attachments: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    is_published: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    published_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    is_pinned: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    send_notification: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    send_sms: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    views_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    tableName: 'announcements',
    timestamps: true,
    underscored: true
  });

  // Associations
  Announcement.associate = (models) => {
    Announcement.belongsTo(models.User, {
      foreignKey: 'author_id',
      as: 'author'
    });
    Announcement.belongsTo(models.Branch, {
      foreignKey: 'target_branch_id',
      as: 'target_branch'
    });
    Announcement.belongsTo(models.Program, {
      foreignKey: 'target_program_id',
      as: 'target_program'
    });
  };

  return Announcement;
};

