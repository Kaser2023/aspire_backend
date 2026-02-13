const { sequelize, AuditLog } = require('../models');

let auditTableChecked = false;
let auditTableReady = false;

const ensureAuditTable = async () => {
  if (auditTableChecked) return auditTableReady;
  auditTableChecked = true;

  try {
    const queryInterface = sequelize.getQueryInterface();
    await queryInterface.describeTable('audit_logs');
    auditTableReady = true;
    return true;
  } catch (describeError) {
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id CHAR(36) PRIMARY KEY,
          module VARCHAR(100) NOT NULL,
          entity_type VARCHAR(100) NOT NULL,
          entity_id VARCHAR(100) NOT NULL,
          action VARCHAR(20) NOT NULL,
          actor_id CHAR(36) NOT NULL,
          actor_role VARCHAR(50) NOT NULL,
          before_data JSON NULL,
          after_data JSON NULL,
          metadata JSON NULL,
          created_at DATETIME NOT NULL,
          updated_at DATETIME NOT NULL
        )
      `);
      auditTableReady = true;
      return true;
    } catch (createError) {
      console.error('Failed to ensure audit_logs table:', createError.message);
      auditTableReady = false;
      return false;
    }
  }
};

const normalizeRecord = (record) => {
  if (!record) return null;
  if (typeof record.toJSON === 'function') return record.toJSON();
  return record;
};

const logAuditEvent = async ({
  module,
  entityType,
  entityId,
  action,
  actor,
  before = null,
  after = null,
  metadata = null
}) => {
  if (!module || !entityType || !entityId || !action || !actor?.id || !actor?.role) {
    return null;
  }

  const ready = await ensureAuditTable();
  if (!ready) return null;

  try {
    return await AuditLog.create({
      module,
      entity_type: entityType,
      entity_id: entityId,
      action,
      actor_id: actor.id,
      actor_role: actor.role,
      before_data: normalizeRecord(before),
      after_data: normalizeRecord(after),
      metadata
    });
  } catch (error) {
    // Audit logging should not break the primary workflow.
    console.error('Audit log write failed:', error.message);
    return null;
  }
};

const getLatestAuditMap = async (entityType, entityIds = []) => {
  if (!entityType || !Array.isArray(entityIds) || entityIds.length === 0) {
    return {};
  }

  const ready = await ensureAuditTable();
  if (!ready) return {};

  const ids = [...new Set(entityIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const logs = await AuditLog.findAll({
    where: {
      entity_type: entityType,
      entity_id: ids
    },
    include: [
      {
        association: 'actor',
        attributes: ['id', 'first_name', 'last_name', 'role']
      }
    ],
    order: [['created_at', 'DESC']]
  });

  const map = {};
  logs.forEach((log) => {
    if (!map[log.entity_id]) {
      map[log.entity_id] = log;
    }
  });
  return map;
};

module.exports = {
  logAuditEvent,
  getLatestAuditMap
};
