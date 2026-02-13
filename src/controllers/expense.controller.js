const { Expense, Branch, User } = require('../models');
const { Op } = require('sequelize');
const { logAuditEvent, getLatestAuditMap } = require('../utils/auditLogger');

// Get all expenses (with optional branch filter)
const getExpenses = async (req, res) => {
  try {
    const { branch_id, category, start_date, end_date, page = 1, limit = 50 } = req.query;
    
    const where = {};
    
    // Filter by branch
    if (branch_id) {
      where.branch_id = branch_id;
    }
    
    // Filter by category
    if (category) {
      where.category = category;
    }
    
    // Filter by date range
    if (start_date || end_date) {
      where.expense_date = {};
      if (start_date) {
        where.expense_date[Op.gte] = start_date;
      }
      if (end_date) {
        where.expense_date[Op.lte] = end_date;
      }
    }
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const { rows: expenses, count: total } = await Expense.findAndCountAll({
      where,
      include: [
        {
          model: Branch,
          as: 'branch',
          attributes: ['id', 'name', 'name_ar']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ],
      order: [['expense_date', 'DESC'], ['created_at', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    const latestAuditMap = await getLatestAuditMap('expense', expenses.map((expense) => expense.id));
    const enrichedExpenses = expenses.map((expense) => {
      const item = expense.toJSON();
      const latestAudit = latestAuditMap[item.id];
      const actor = latestAudit?.actor;
      item.last_updated_by = actor
        ? { id: actor.id, first_name: actor.first_name, last_name: actor.last_name, role: actor.role }
        : (item.creator || null);
      item.last_updated_at = latestAudit?.created_at || item.updated_at || item.created_at;
      return item;
    });
    
    res.json({
      success: true,
      data: enrichedExpenses,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expenses',
      error: error.message
    });
  }
};

// Get expense by ID
const getExpenseById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const expense = await Expense.findByPk(id, {
      include: [
        {
          model: Branch,
          as: 'branch',
          attributes: ['id', 'name', 'name_ar']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ]
    });
    
    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }
    
    const latestAuditMap = await getLatestAuditMap('expense', [expense.id]);
    const latestAudit = latestAuditMap[expense.id];
    const expenseData = expense.toJSON();
    const actor = latestAudit?.actor;
    expenseData.last_updated_by = actor
      ? { id: actor.id, first_name: actor.first_name, last_name: actor.last_name, role: actor.role }
      : (expenseData.creator || null);
    expenseData.last_updated_at = latestAudit?.created_at || expenseData.updated_at || expenseData.created_at;

    res.json({
      success: true,
      data: expenseData
    });
  } catch (error) {
    console.error('Error fetching expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expense',
      error: error.message
    });
  }
};

// Create expense
const createExpense = async (req, res) => {
  try {
    const {
      branch_id,
      category,
      title,
      description,
      amount,
      expense_date,
      payment_method,
      receipt_number,
      vendor_name,
      notes,
      is_recurring,
      recurring_frequency
    } = req.body;
    
    // Validate required fields
    if (!branch_id || !title || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Branch, title, and amount are required'
      });
    }
    
    // Check if branch exists
    const branch = await Branch.findByPk(branch_id);
    if (!branch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }
    
    const expenseData = {
      branch_id,
      category: category || 'other',
      title,
      description,
      amount,
      expense_date: expense_date || new Date(),
      payment_method: payment_method || 'cash',
      receipt_number,
      vendor_name,
      notes,
      created_by: req.user.id,
      is_recurring: is_recurring || false,
      recurring_frequency: is_recurring ? recurring_frequency : null
    };
    
    // Handle receipt file upload
    if (req.file) {
      expenseData.receipt_url = `/uploads/receipts/${req.file.filename}`;
    }
    
    const expense = await Expense.create(expenseData);
    
    // Fetch with associations
    const createdExpense = await Expense.findByPk(expense.id, {
      include: [
        {
          model: Branch,
          as: 'branch',
          attributes: ['id', 'name', 'name_ar']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ]
    });

    await logAuditEvent({
      module: 'expenses',
      entityType: 'expense',
      entityId: expense.id,
      action: 'create',
      actor: req.user,
      before: null,
      after: createdExpense
    });

    const createdExpenseData = createdExpense.toJSON();
    createdExpenseData.last_updated_by = createdExpenseData.creator || null;
    createdExpenseData.last_updated_at = createdExpenseData.updated_at || createdExpenseData.created_at;
    
    res.status(201).json({
      success: true,
      message: 'Expense created successfully',
      data: createdExpenseData
    });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create expense',
      error: error.message
    });
  }
};

// Update expense
const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      branch_id,
      category,
      title,
      description,
      amount,
      expense_date,
      payment_method,
      receipt_number,
      vendor_name,
      notes,
      is_recurring,
      recurring_frequency
    } = req.body;
    
    const expense = await Expense.findByPk(id);
    
    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }
    
    const updateData = {};
    
    if (branch_id) updateData.branch_id = branch_id;
    if (category) updateData.category = category;
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (amount) updateData.amount = amount;
    if (expense_date) updateData.expense_date = expense_date;
    if (payment_method) updateData.payment_method = payment_method;
    if (receipt_number !== undefined) updateData.receipt_number = receipt_number;
    if (vendor_name !== undefined) updateData.vendor_name = vendor_name;
    if (notes !== undefined) updateData.notes = notes;
    if (is_recurring !== undefined) {
      updateData.is_recurring = is_recurring;
      updateData.recurring_frequency = is_recurring ? recurring_frequency : null;
    }
    
    // Handle receipt file upload
    if (req.file) {
      updateData.receipt_url = `/uploads/receipts/${req.file.filename}`;
    }
    
    const beforeData = expense.toJSON();
    await expense.update(updateData);
    
    // Fetch with associations
    const updatedExpense = await Expense.findByPk(id, {
      include: [
        {
          model: Branch,
          as: 'branch',
          attributes: ['id', 'name', 'name_ar']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ]
    });

    await logAuditEvent({
      module: 'expenses',
      entityType: 'expense',
      entityId: id,
      action: 'update',
      actor: req.user,
      before: beforeData,
      after: updatedExpense
    });

    const updatedExpenseData = updatedExpense.toJSON();
    updatedExpenseData.last_updated_by = {
      id: req.user.id,
      first_name: req.user.first_name,
      last_name: req.user.last_name,
      role: req.user.role
    };
    updatedExpenseData.last_updated_at = updatedExpenseData.updated_at || new Date().toISOString();
    
    res.json({
      success: true,
      message: 'Expense updated successfully',
      data: updatedExpenseData
    });
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update expense',
      error: error.message
    });
  }
};

// Delete expense
const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    
    const expense = await Expense.findByPk(id);
    
    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }
    
    const beforeData = expense.toJSON();
    await expense.destroy();

    await logAuditEvent({
      module: 'expenses',
      entityType: 'expense',
      entityId: id,
      action: 'delete',
      actor: req.user,
      before: beforeData,
      after: null
    });
    
    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete expense',
      error: error.message
    });
  }
};

// Get expense statistics by branch
const getExpenseStats = async (req, res) => {
  try {
    const { branch_id, start_date, end_date } = req.query;
    
    const where = {};
    
    if (branch_id) {
      where.branch_id = branch_id;
    }
    
    if (start_date || end_date) {
      where.expense_date = {};
      if (start_date) {
        where.expense_date[Op.gte] = start_date;
      }
      if (end_date) {
        where.expense_date[Op.lte] = end_date;
      }
    }
    
    // Get total expenses
    const expenses = await Expense.findAll({ where });
    
    const totalAmount = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
    
    // Group by category
    const byCategory = {};
    expenses.forEach(exp => {
      if (!byCategory[exp.category]) {
        byCategory[exp.category] = 0;
      }
      byCategory[exp.category] += parseFloat(exp.amount);
    });
    
    // Group by payment method
    const byPaymentMethod = {};
    expenses.forEach(exp => {
      if (!byPaymentMethod[exp.payment_method]) {
        byPaymentMethod[exp.payment_method] = 0;
      }
      byPaymentMethod[exp.payment_method] += parseFloat(exp.amount);
    });
    
    res.json({
      success: true,
      data: {
        totalExpenses: expenses.length,
        totalAmount,
        byCategory,
        byPaymentMethod
      }
    });
  } catch (error) {
    console.error('Error fetching expense stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expense statistics',
      error: error.message
    });
  }
};

module.exports = {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseStats
};
