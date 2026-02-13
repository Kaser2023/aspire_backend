const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BranchAnnouncement = sequelize.define('BranchAnnouncement', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    branch_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'branches',
        key: 'id'
      }
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
    target_audience: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: 'all',
      comment: 'all, parents, coaches, players, or JSON for specific users'
    },
    author_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    is_published: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    is_pinned: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'branch_announcements',
    timestamps: true,
    underscored: true
  });

  // Associations
  BranchAnnouncement.associate = (models) => {
    BranchAnnouncement.belongsTo(models.Branch, {
      foreignKey: 'branch_id',
      as: 'branch'
    });
    BranchAnnouncement.belongsTo(models.User, {
      foreignKey: 'author_id',
      as: 'author'
    });
  };

  return BranchAnnouncement;
};
