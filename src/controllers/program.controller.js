const { Program, Branch, User, Player, Subscription, CoachProgram, ProgramPricingPlan } = require('../models');
const { Op } = require('sequelize');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { paginate, formatPaginationResponse } = require('../utils/helpers');
const { ROLES } = require('../config/constants');

function assertBranchProgramAccess(req, program) {
  if (req.user.role === ROLES.BRANCH_ADMIN) {
    if (!req.user.branch_id) {
      throw new AppError('Branch admin is not assigned to a branch', 403);
    }
    if (String(program.branch_id) !== String(req.user.branch_id)) {
      throw new AppError('Not authorized to access programs outside your branch', 403);
    }
  }
}

/**
 * @desc    Get public programs (for landing page)
 * @route   GET /api/programs/public
 * @access  Public
 */
exports.getPublicPrograms = asyncHandler(async (req, res) => {
  const { branch_id, type } = req.query;
  const where = { is_active: true };

  if (branch_id) where.branch_id = branch_id;
  if (type) where.type = type;

  const programs = await Program.findAll({
    where,
    attributes: ['id', 'name', 'name_ar', 'description', 'description_ar', 'type', 'sport_type', 'age_group_min', 'age_group_max', 'price_monthly', 'schedule', 'image', 'features', 'capacity', 'current_enrollment'],
    include: [
      { association: 'branch', attributes: ['id', 'name', 'name_ar', 'city'] },
      {
        association: 'coaches',
        attributes: ['id', 'first_name', 'last_name'],
        through: { attributes: [] }
      },
      {
        association: 'pricing_plans',
        where: { is_active: true },
        required: false,
        attributes: ['id', 'name', 'name_ar', 'price', 'duration_months', 'description']
      }
    ],
    order: [['name', 'ASC']]
  });

  res.json({
    success: true,
    data: programs
  });
});

/**
 * @desc    Get all programs
 * @route   GET /api/programs
 * @access  Private
 */
exports.getAllPrograms = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, branch_id, type, coach_id, is_active } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const where = {};

  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { name_ar: { [Op.like]: `%${search}%` } }
    ];
  }

  if (branch_id) where.branch_id = branch_id;
  if (type) where.type = type;
  if (is_active !== undefined) where.is_active = is_active === 'true';

  // Role-based filtering
  if (req.user.role === ROLES.BRANCH_ADMIN && req.user.branch_id) {
    where.branch_id = req.user.branch_id;
  } else if (req.user.role === ROLES.COACH) {
    // Filter programs where this coach is assigned
    where['$coaches.id$'] = req.user.id;
  }

  // If coach_id filter is provided, filter by specific coach
  if (coach_id) {
    where['$coaches.id$'] = coach_id;
  }

  const programs = await Program.findAndCountAll({
    where,
    include: [
      { association: 'branch', attributes: ['id', 'name', 'code'] },
      { 
        association: 'coaches', 
        attributes: ['id', 'first_name', 'last_name', 'name_ar', 'email'],
        through: { attributes: ['is_primary', 'assigned_at'] }
      },
      {
        association: 'pricing_plans',
        where: { is_active: true },
        required: false
      }
    ],
    offset,
    limit: limitNum,
    order: [['created_at', 'DESC']],
    distinct: true, // Important for many-to-many relationships
    subQuery: false // Required for filtering on nested associations
  });

  const response = formatPaginationResponse(programs, page, limit);

  res.json({
    success: true,
    ...response
  });
});

/**
 * @desc    Get program by ID
 * @route   GET /api/programs/:id
 * @access  Private
 */
exports.getProgramById = asyncHandler(async (req, res) => {
  const program = await Program.findByPk(req.params.id, {
    include: [
      { association: 'branch' },
      { association: 'coach', attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'avatar'] },
      { association: 'pricing_plans', order: [['sort_order', 'ASC']] }
    ]
  });

  if (!program) {
    throw new AppError('Program not found', 404);
  }

  assertBranchProgramAccess(req, program);

  res.json({
    success: true,
    data: program
  });
});

/**
 * @desc    Create new program
 * @route   POST /api/programs
 * @access  Private/Admin
 */
exports.createProgram = asyncHandler(async (req, res) => {
  const {
    name, name_ar, description, description_ar, type, sport_type,
    branch_id, coach_id, age_group_min, age_group_max, capacity,
    price_monthly, price_quarterly, price_annual, registration_fee,
    schedule, start_date, end_date, features, pricing_plans
  } = req.body;

  // Validate required fields
  if (!name || !name.trim()) {
    throw new AppError('Program name is required', 400);
  }

  // Normalize IDs - treat empty strings as null
  let normalizedBranchId = branch_id && branch_id.trim() !== '' ? branch_id : null;
  const normalizedCoachId = coach_id && coach_id.trim() !== '' ? coach_id : null;

  // Branch admins can only create programs in their own branch
  if (req.user.role === ROLES.BRANCH_ADMIN) {
    if (!req.user.branch_id) {
      throw new AppError('Branch admin is not assigned to a branch', 403);
    }
    normalizedBranchId = req.user.branch_id;
  }

  if (!normalizedBranchId) {
    throw new AppError('Branch is required. Please create a branch first.', 400);
  }

  // Validate branch
  const branch = await Branch.findByPk(normalizedBranchId);
  if (!branch) {
    throw new AppError('Branch not found', 404);
  }

  // Validate coach if provided
  if (normalizedCoachId) {
    const coach = await User.findByPk(normalizedCoachId);
    if (!coach || coach.role !== ROLES.COACH) {
      throw new AppError('Coach not found or invalid role', 404);
    }
  }

  const program = await Program.create({
    name,
    name_ar: name_ar || name,
    description,
    description_ar: description_ar || description,
    type: type || 'training',
    sport_type: sport_type || 'football',
    branch_id: normalizedBranchId,
    coach_id: normalizedCoachId,
    age_group_min: age_group_min || 5,
    age_group_max: age_group_max || 18,
    capacity: capacity || 20,
    price_monthly: price_monthly || 0,
    price_quarterly: price_quarterly || null,
    price_annual: price_annual || null,
    registration_fee: registration_fee || 0,
    schedule: schedule || [],
    start_date,
    end_date,
    features: features || []
  });

  // Create pricing plans if provided
  if (pricing_plans && Array.isArray(pricing_plans) && pricing_plans.length > 0) {
    try {
      const plansToCreate = pricing_plans.map((plan, index) => ({
        program_id: program.id,
        name: plan.name,
        name_ar: plan.name_ar || plan.name || null,
        duration_months: plan.duration_months || null,
        price: plan.price || 0,
        description: plan.description || null,
        description_ar: plan.description_ar || null,
        is_active: true,
        sort_order: plan.sort_order || index
      }));
      await ProgramPricingPlan.bulkCreate(plansToCreate);
    } catch (err) {
      console.error('Error creating pricing plans:', err.message);
      // Continue without failing - pricing plans table might not exist yet
    }
  }

  // Fetch program with pricing plans
  let createdProgram;
  try {
    createdProgram = await Program.findByPk(program.id, {
      include: [{ association: 'pricing_plans' }]
    });
  } catch (err) {
    createdProgram = await Program.findByPk(program.id);
  }

  res.status(201).json({
    success: true,
    message: 'Program created successfully',
    data: createdProgram
  });
});

/**
 * @desc    Update program
 * @route   PUT /api/programs/:id
 * @access  Private/Admin
 */
exports.updateProgram = asyncHandler(async (req, res) => {
  const program = await Program.findByPk(req.params.id);

  if (!program) {
    throw new AppError('Program not found', 404);
  }

  assertBranchProgramAccess(req, program);

  const { pricing_plans, ...programData } = req.body;

  // Branch admins cannot move programs to another branch
  if (req.user.role === ROLES.BRANCH_ADMIN && programData.branch_id && String(programData.branch_id) !== String(req.user.branch_id)) {
    throw new AppError('You can only manage programs in your branch', 403);
  }

  await program.update(programData);

  // Update pricing plans if provided
  if (pricing_plans && Array.isArray(pricing_plans)) {
    try {
      // Delete existing plans and create new ones
      await ProgramPricingPlan.destroy({ where: { program_id: program.id } });

      if (pricing_plans.length > 0) {
        const plansToCreate = pricing_plans.map((plan, index) => ({
          program_id: program.id,
          name: plan.name,
          name_ar: plan.name_ar || plan.name || null,
          duration_months: plan.duration_months || null,
          price: plan.price || 0,
          description: plan.description || null,
          description_ar: plan.description_ar || null,
          is_active: plan.is_active !== false,
          sort_order: plan.sort_order || index
        }));
        await ProgramPricingPlan.bulkCreate(plansToCreate);
      }
    } catch (err) {
      console.error('Error updating pricing plans:', err.message);
      // Continue without failing - pricing plans table might not exist yet
    }
  }

  // Fetch updated program
  let updatedProgram;
  try {
    updatedProgram = await Program.findByPk(program.id, {
      include: [{ association: 'pricing_plans' }]
    });
  } catch (err) {
    updatedProgram = await Program.findByPk(program.id);
  }

  res.json({
    success: true,
    message: 'Program updated successfully',
    data: updatedProgram
  });
});

/**
 * @desc    Delete program
 * @route   DELETE /api/programs/:id
 * @access  Private/Admin
 */
exports.deleteProgram = asyncHandler(async (req, res) => {
  const program = await Program.findByPk(req.params.id);

  if (!program) {
    throw new AppError('Program not found', 404);
  }

  // Check for active players
  if (program.current_enrollment > 0) {
    throw new AppError('Cannot delete program with active enrollments', 400);
  }

  // Delete pricing plans first (in case cascade doesn't work)
  try {
    await ProgramPricingPlan.destroy({ where: { program_id: program.id } });
  } catch (err) {
    console.error('Error deleting pricing plans:', err.message);
  }

  // Actually delete the program
  await program.destroy();

  res.json({
    success: true,
    message: 'Program deleted successfully'
  });
});

/**
 * @desc    Upload program image
 * @route   POST /api/programs/:id/image
 * @access  Private/Admin
 */
exports.uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('Please upload an image file', 400);
  }

  const program = await Program.findByPk(req.params.id);

  if (!program) {
    throw new AppError('Program not found', 404);
  }

  assertBranchProgramAccess(req, program);

  const imageUrl = `/uploads/programs/${req.file.filename}`;
  await program.update({ image: imageUrl });

  res.json({
    success: true,
    message: 'Image uploaded successfully',
    data: { image: imageUrl }
  });
});

/**
 * @desc    Get program schedule
 * @route   GET /api/programs/:id/schedule
 * @access  Private
 */
exports.getProgramSchedule = asyncHandler(async (req, res) => {
  const program = await Program.findByPk(req.params.id, {
    attributes: ['id', 'name', 'schedule', 'start_date', 'end_date']
  });

  if (!program) {
    throw new AppError('Program not found', 404);
  }

  assertBranchProgramAccess(req, program);

  res.json({
    success: true,
    data: {
      programId: program.id,
      programName: program.name,
      schedule: program.schedule,
      startDate: program.start_date,
      endDate: program.end_date
    }
  });
});

/**
 * @desc    Update program schedule
 * @route   PUT /api/programs/:id/schedule
 * @access  Private/Admin
 */
exports.updateProgramSchedule = asyncHandler(async (req, res) => {
  const { schedule } = req.body;

  const program = await Program.findByPk(req.params.id);

  if (!program) {
    throw new AppError('Program not found', 404);
  }

  assertBranchProgramAccess(req, program);

  await program.update({ schedule });

  res.json({
    success: true,
    message: 'Schedule updated successfully',
    data: { schedule: program.schedule }
  });
});

/**
 * @desc    Get program players
 * @route   GET /api/programs/:id/players
 * @access  Private/Admin/Coach
 */
exports.getProgramPlayers = asyncHandler(async (req, res) => {
  const program = await Program.findByPk(req.params.id, {
    attributes: ['id', 'branch_id']
  });
  if (!program) {
    throw new AppError('Program not found', 404);
  }
  assertBranchProgramAccess(req, program);

  const players = await Player.findAll({
    where: { program_id: req.params.id, status: 'active' },
    include: [
      { association: 'parent', attributes: ['id', 'first_name', 'last_name', 'phone', 'email'] }
    ],
    order: [['first_name', 'ASC']]
  });

  res.json({
    success: true,
    data: players
  });
});

/**
 * @desc    Assign coach to program
 * @route   POST /api/programs/:id/assign-coach
 * @access  Private/Admin
 */
exports.assignCoach = asyncHandler(async (req, res) => {
  const { coach_id } = req.body;

  const program = await Program.findByPk(req.params.id);
  if (!program) {
    throw new AppError('Program not found', 404);
  }

  assertBranchProgramAccess(req, program);

  const coach = await User.findByPk(coach_id);
  if (!coach || coach.role !== ROLES.COACH) {
    throw new AppError('Coach not found or invalid role', 404);
  }

  await program.update({ coach_id });

  res.json({
    success: true,
    message: 'Coach assigned successfully',
    data: program
  });
});

/**
 * @desc    Toggle program status
 * @route   PATCH /api/programs/:id/status
 * @access  Private/Admin
 */
exports.toggleProgramStatus = asyncHandler(async (req, res) => {
  const program = await Program.findByPk(req.params.id);

  if (!program) {
    throw new AppError('Program not found', 404);
  }

  assertBranchProgramAccess(req, program);

  await program.update({ is_active: !program.is_active });

  res.json({
    success: true,
    message: `Program ${program.is_active ? 'activated' : 'deactivated'} successfully`,
    data: { is_active: program.is_active }
  });
});

/**
 * @desc    Get program statistics
 * @route   GET /api/programs/stats
 * @access  Private/Admin
 */
exports.getProgramStats = asyncHandler(async (req, res) => {
  const { branch_id } = req.query;
  const where = { is_active: true };

  if (branch_id) where.branch_id = branch_id;
  if (req.user.role === ROLES.BRANCH_ADMIN && req.user.branch_id) {
    where.branch_id = req.user.branch_id;
  }

  const [total, byType, totalEnrollment] = await Promise.all([
    Program.count({ where }),
    Program.findAll({
      where,
      attributes: ['type', [require('sequelize').fn('COUNT', 'id'), 'count']],
      group: ['type']
    }),
    Program.sum('current_enrollment', { where })
  ]);

  res.json({
    success: true,
    data: {
      total,
      totalEnrollment: totalEnrollment || 0,
      byType: byType.reduce((acc, item) => {
        acc[item.type] = parseInt(item.get('count'));
        return acc;
      }, {})
    }
  });
});

/**
 * @desc    Assign coaches to a program
 * @route   POST /api/programs/:id/coaches
 * @access  Private/Admin
 */
exports.assignCoaches = asyncHandler(async (req, res) => {
  const { coach_ids } = req.body;
  const program = await Program.findByPk(req.params.id);

  if (!program) {
    throw new AppError('Program not found', 404);
  }

  assertBranchProgramAccess(req, program);

  // Verify all coaches exist and are coach role
  const coaches = await User.findAll({
    where: {
      id: { [Op.in]: coach_ids },
      role: ROLES.COACH
    }
  });

  if (coaches.length !== coach_ids.length) {
    throw new AppError('Some coaches not found or invalid', 400);
  }

  // Clear existing assignments and create new ones
  await CoachProgram.destroy({
    where: { program_id: req.params.id }
  });

  const assignments = coach_ids.map(coach_id => ({
    program_id: req.params.id,
    coach_id,
    is_primary: coach_ids.length === 1 ? true : false // If only one coach, make them primary
  }));

  await CoachProgram.bulkCreate(assignments);

  res.json({
    success: true,
    message: 'Coaches assigned successfully'
  });
});

/**
 * @desc    Get coaches assigned to a program
 * @route   GET /api/programs/:id/coaches
 * @access  Private
 */
exports.getProgramCoaches = asyncHandler(async (req, res) => {
  const program = await Program.findByPk(req.params.id, {
    include: [
      {
        association: 'coaches',
        attributes: ['id', 'first_name', 'last_name', 'name_ar', 'email'],
        through: { attributes: ['is_primary', 'assigned_at'] }
      }
    ]
  });

  if (!program) {
    throw new AppError('Program not found', 404);
  }

  assertBranchProgramAccess(req, program);

  res.json({
    success: true,
    data: program.coaches
  });
});

/**
 * @desc    Remove coach from program
 * @route   DELETE /api/programs/:id/coaches/:coachId
 * @access  Private/Admin
 */
exports.removeCoachFromProgram = asyncHandler(async (req, res) => {
  const program = await Program.findByPk(req.params.id, {
    attributes: ['id', 'branch_id']
  });
  if (!program) {
    throw new AppError('Program not found', 404);
  }
  assertBranchProgramAccess(req, program);

  const result = await CoachProgram.destroy({
    where: {
      program_id: req.params.id,
      coach_id: req.params.coachId
    }
  });

  if (result === 0) {
    throw new AppError('Coach assignment not found', 404);
  }

  res.json({
    success: true,
    message: 'Coach removed from program successfully'
  });
});

