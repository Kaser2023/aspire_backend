const { Evaluation, Player, User, TrainingSession, Program } = require('../models');
const { Op } = require('sequelize');
const { ROLES } = require('../config/constants');

/**
 * Create a new evaluation
 * @route POST /api/evaluations
 */
exports.createEvaluation = async (req, res, next) => {
  try {
    const {
      player_id,
      session_id,
      evaluation_type,
      overall_rating,
      goals,
      notes,
      // Detailed skills
      ball_control,
      passing,
      shooting,
      dribbling,
      speed,
      stamina,
      strength,
      agility,
      attitude,
      discipline,
      teamwork,
      effort,
      evaluation_date
    } = req.body;

    // Verify player exists and coach has access
    const player = await Player.findByPk(player_id);
    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Player not found'
      });
    }

    // Check if coach has access to this player
    if (req.user.role === ROLES.COACH && player.coach_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to evaluate this player'
      });
    }

    const evaluation = await Evaluation.create({
      player_id,
      coach_id: req.user.id,
      session_id: session_id || null,
      evaluation_type: evaluation_type || 'quick',
      overall_rating,
      goals: goals || 0,
      notes,
      ball_control,
      passing,
      shooting,
      dribbling,
      speed,
      stamina,
      strength,
      agility,
      attitude,
      discipline,
      teamwork,
      effort,
      evaluation_date: evaluation_date || new Date()
    });

    // Fetch with associations
    const fullEvaluation = await Evaluation.findByPk(evaluation.id, {
      include: [
        {
          model: Player,
          as: 'player',
          attributes: ['id', 'first_name', 'last_name', 'first_name_ar', 'last_name_ar', 'avatar']
        },
        {
          model: User,
          as: 'coach',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Evaluation created successfully',
      data: fullEvaluation
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get evaluations for a player
 * @route GET /api/evaluations/player/:playerId
 */
exports.getPlayerEvaluations = async (req, res, next) => {
  try {
    const { playerId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const player = await Player.findByPk(playerId);
    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Player not found'
      });
    }

    if (req.user.role === ROLES.PARENT && player.parent_id !== req.user.id && player.self_user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const where = { player_id: playerId };

    // If coach, only show their evaluations
    if (req.user.role === ROLES.COACH) {
      where.coach_id = req.user.id;
    }

    const { count, rows: evaluations } = await Evaluation.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'coach',
          attributes: ['id', 'first_name', 'last_name']
        },
        {
          model: TrainingSession,
          as: 'session',
          attributes: ['id', 'date', 'start_time']
        }
      ],
      order: [['evaluation_date', 'DESC'], ['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: evaluations,
      pagination: {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all evaluations for coach's players
 * @route GET /api/evaluations
 */
exports.getEvaluations = async (req, res, next) => {
  try {
    const { player_id, session_id, evaluation_type, from_date, to_date, start_date, end_date, limit = 50, offset = 0 } = req.query;

    const where = {};

    // Filter by coach if not admin
    if (req.user.role === ROLES.COACH) {
      where.coach_id = req.user.id;
    }

    if (player_id) {
      where.player_id = player_id;
    }

    // Filter by session_id
    if (session_id) {
      where.session_id = session_id;
    }

    if (evaluation_type) {
      where.evaluation_type = evaluation_type;
    }

    // Support both from_date/to_date and start_date/end_date
    const startDate = from_date || start_date;
    const endDate = to_date || end_date;
    
    if (startDate || endDate) {
      where.evaluation_date = {};
      if (startDate) where.evaluation_date[Op.gte] = startDate;
      if (endDate) where.evaluation_date[Op.lte] = endDate;
    }

    const { count, rows: evaluations } = await Evaluation.findAndCountAll({
      where,
      include: [
        {
          model: Player,
          as: 'player',
          attributes: ['id', 'first_name', 'last_name', 'first_name_ar', 'last_name_ar', 'avatar']
        },
        {
          model: User,
          as: 'coach',
          attributes: ['id', 'first_name', 'last_name']
        }
      ],
      order: [['evaluation_date', 'DESC'], ['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: evaluations,
      pagination: {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single evaluation
 * @route GET /api/evaluations/:id
 */
exports.getEvaluation = async (req, res, next) => {
  try {
    const { id } = req.params;

    const evaluation = await Evaluation.findByPk(id, {
      include: [
        {
          model: Player,
          as: 'player',
          attributes: ['id', 'first_name', 'last_name', 'first_name_ar', 'last_name_ar', 'avatar']
        },
        {
          model: User,
          as: 'coach',
          attributes: ['id', 'first_name', 'last_name']
        },
        {
          model: TrainingSession,
          as: 'session',
          include: [{
            model: Program,
            as: 'program',
            attributes: ['id', 'name', 'name_ar']
          }]
        }
      ]
    });

    if (!evaluation) {
      return res.status(404).json({
        success: false,
        message: 'Evaluation not found'
      });
    }

    // Check access
    if (req.user.role === ROLES.COACH && evaluation.coach_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: evaluation
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update evaluation
 * @route PUT /api/evaluations/:id
 */
exports.updateEvaluation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const evaluation = await Evaluation.findByPk(id);

    if (!evaluation) {
      return res.status(404).json({
        success: false,
        message: 'Evaluation not found'
      });
    }

    // Only the coach who created it can update
    if (evaluation.coach_id !== req.user.id && req.user.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own evaluations'
      });
    }

    const allowedFields = [
      'overall_rating', 'goals', 'notes', 'ball_control', 'passing', 'shooting', 'dribbling',
      'speed', 'stamina', 'strength', 'agility', 'attitude', 'discipline', 'teamwork', 'effort'
    ];

    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    await evaluation.update(updates);

    const updated = await Evaluation.findByPk(id, {
      include: [
        {
          model: Player,
          as: 'player',
          attributes: ['id', 'first_name', 'last_name', 'first_name_ar', 'last_name_ar', 'avatar']
        }
      ]
    });

    res.json({
      success: true,
      message: 'Evaluation updated successfully',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete evaluation
 * @route DELETE /api/evaluations/:id
 */
exports.deleteEvaluation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const evaluation = await Evaluation.findByPk(id);

    if (!evaluation) {
      return res.status(404).json({
        success: false,
        message: 'Evaluation not found'
      });
    }

    // Only the coach who created it can delete
    if (evaluation.coach_id !== req.user.id && req.user.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own evaluations'
      });
    }

    await evaluation.destroy();

    res.json({
      success: true,
      message: 'Evaluation deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get player evaluation stats/summary
 * @route GET /api/evaluations/player/:playerId/summary
 */
exports.getPlayerEvaluationSummary = async (req, res, next) => {
  try {
    const { playerId } = req.params;

    const player = await Player.findByPk(playerId);
    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Player not found'
      });
    }

    if (req.user.role === ROLES.PARENT && player.parent_id !== req.user.id && player.self_user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const where = { player_id: playerId };
    if (req.user.role === ROLES.COACH) {
      where.coach_id = req.user.id;
    }

    const evaluations = await Evaluation.findAll({
      where,
      order: [['evaluation_date', 'DESC']]
    });

    if (evaluations.length === 0) {
      return res.json({
        success: true,
        data: {
          total_evaluations: 0,
          latest_evaluation: null,
          averages: null
        }
      });
    }

    // Calculate overall averages from detailed evaluations
    const detailed = evaluations.filter(e => e.evaluation_type === 'detailed');
    
    let averages = null;
    if (detailed.length > 0) {
      const skills = ['ball_control', 'passing', 'shooting', 'dribbling', 'speed', 'stamina', 'strength', 'agility', 'attitude', 'discipline', 'teamwork', 'effort'];
      averages = {};
      
      skills.forEach(skill => {
        const values = detailed.map(e => e[skill]).filter(v => v !== null);
        if (values.length > 0) {
          averages[skill] = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
        }
      });

      // Category averages
      const techAvg = detailed.map(e => e.technical_avg).filter(v => v !== null);
      const physAvg = detailed.map(e => e.physical_avg).filter(v => v !== null);
      const mentAvg = detailed.map(e => e.mental_avg).filter(v => v !== null);

      if (techAvg.length > 0) averages.technical = (techAvg.reduce((a, b) => a + parseFloat(b), 0) / techAvg.length).toFixed(2);
      if (physAvg.length > 0) averages.physical = (physAvg.reduce((a, b) => a + parseFloat(b), 0) / physAvg.length).toFixed(2);
      if (mentAvg.length > 0) averages.mental = (mentAvg.reduce((a, b) => a + parseFloat(b), 0) / mentAvg.length).toFixed(2);
    }

    // Quick evaluation average
    const quick = evaluations.filter(e => e.evaluation_type === 'quick' && e.overall_rating);
    const quickAvg = quick.length > 0 
      ? (quick.reduce((sum, e) => sum + e.overall_rating, 0) / quick.length).toFixed(2)
      : null;

    // Overall average rating (from all evaluations with overall_rating)
    const allWithRating = evaluations.filter(e => e.overall_rating);
    const averageRating = allWithRating.length > 0
      ? (allWithRating.reduce((sum, e) => sum + e.overall_rating, 0) / allWithRating.length)
      : 0;

    // Total goals
    const totalGoals = evaluations.reduce((sum, e) => sum + (e.goals || 0), 0);

    res.json({
      success: true,
      data: {
        total_evaluations: evaluations.length,
        totalEvaluations: evaluations.length,
        quick_evaluations: quick.length,
        detailed_evaluations: detailed.length,
        latest_evaluation: evaluations[0],
        quick_average: quickAvg,
        averageRating: averageRating,
        average_rating: averageRating,
        totalGoals: totalGoals,
        total_goals: totalGoals,
        skill_averages: averages
      }
    });
  } catch (error) {
    next(error);
  }
};
