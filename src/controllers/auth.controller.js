const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, Session, OTP, Branch, Player } = require('../models');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { generateToken, formatPhoneNumber } = require('../utils/helpers');
const smsService = require('../services/sms.service');
const playersService = require('../services/players.service.js');

/**
 * Generate JWT tokens
 */
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );

  return { accessToken, refreshToken };
};

/**
 * Create user session
 */
const createSession = async (user, accessToken, refreshToken, req) => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  const session = await Session.create({
    user_id: user.id,
    token: accessToken,
    refresh_token: refreshToken,
    ip_address: req.ip,
    user_agent: req.get('user-agent'),
    device_info: {
      platform: req.get('sec-ch-ua-platform'),
      mobile: req.get('sec-ch-ua-mobile')
    },
    expires_at: expiresAt
  });

  return session;
};

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
exports.register = asyncHandler(async (req, res) => {
  const { email, password, first_name, last_name, phone, role } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    throw new AppError('User with this email already exists', 400);
  }

  // Create user (default role is 'parent')
  const user = await User.create({
    email,
    password,
    first_name,
    last_name,
    phone,
    role: role || 'parent'
  });

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user.id);

  // Create session
  await createSession(user, accessToken, refreshToken, req);

  // Update last login
  await user.update({ last_login: new Date() });

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    data: {
      user: user.toJSON(),
      accessToken,
      refreshToken
    }
  });
});

/**
 * @desc    Direct signup for parents/players (no OTP verification)
 * @route   POST /api/auth/signup
 * @access  Public
 * 
 * Player signup has two flows:
 *   1. WITH parent registration code: only name, email, phone, password needed.
 *      Claims existing player record, inherits parent's branch/data.
 *   2. WITHOUT parent code: needs all fields (name, email, phone, password,
 *      date_of_birth, nationality, address, health_notes, branch_id).
 *      Creates a new standalone Player record.
 */
exports.signup = asyncHandler(async (req, res) => {
  const { 
    email, password, first_name, last_name, phone, branch_id,
    // Self-player fields
    account_type, date_of_birth, nationality, address, health_notes,
    existing_player_code
  } = req.body;

  // Validate required fields (common for both parent and player)
  if (!email || !password || !first_name || !last_name || !phone) {
    throw new AppError('Email, password, first name, last name, and phone are required', 400);
  }

  if (password.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400);
  }

  // Format phone number
  const formattedPhone = formatPhoneNumber(phone);

  const isSelfPlayer = account_type === 'self_player';
  const hasParentCode = isSelfPlayer && existing_player_code && existing_player_code.trim();

  // Self-player WITHOUT parent code requires extra fields
  if (isSelfPlayer && !hasParentCode) {
    if (!date_of_birth) {
      throw new AppError('Date of birth is required for player registration', 400);
    }
    if (!branch_id) {
      throw new AppError('Branch is required for player registration without a parent code', 400);
    }
  }

  // Check if email already exists
  const existingEmail = await User.findOne({ where: { email } });
  if (existingEmail) {
    throw new AppError('User with this email already exists', 400);
  }

  // Check if phone already exists
  const existingPhone = await User.findOne({ where: { phone: formattedPhone } });
  if (existingPhone) {
    throw new AppError('User with this phone number already exists', 400);
  }

  // If player WITH parent code, validate the code BEFORE creating the user
  let existingPlayer = null;
  if (hasParentCode) {
    existingPlayer = await Player.findOne({
      where: { registration_number: existing_player_code.trim() },
      include: [{ association: 'parent', attributes: ['id', 'first_name', 'last_name', 'phone'] }]
    });

    if (!existingPlayer) {
      throw new AppError('Registration code not found. Please check the code and try again.', 404);
    }
    if (existingPlayer.self_user_id) {
      throw new AppError('This player profile has already been claimed by another account', 400);
    }
  }

  // Validate branch if provided (for non-code signups)
  if (branch_id) {
    const branch = await Branch.findByPk(branch_id);
    if (!branch) {
      throw new AppError('Branch not found', 404);
    }
  }

  // Determine the branch_id for the user
  let userBranchId = branch_id || null;
  if (hasParentCode && existingPlayer) {
    // Inherit branch from the existing player record
    userBranchId = existingPlayer.branch_id;
  }

  // Create user with password
  const user = await User.create({
    email,
    phone: formattedPhone,
    password,
    first_name,
    last_name,
    role: 'parent',
    account_type: isSelfPlayer ? 'self_player' : 'parent',
    date_of_birth: isSelfPlayer ? (date_of_birth || null) : null,
    is_verified: false,
    is_active: true,
    branch_id: userBranchId
  });

  // Handle self-player flows
  if (isSelfPlayer) {
    try {
      if (hasParentCode && existingPlayer) {
        // FLOW 1: Player signs up WITH parent code → claim existing player record
        await existingPlayer.update({ self_user_id: user.id });
        // Sync user name to match the player record the parent created
        if (existingPlayer.first_name || existingPlayer.last_name) {
          await user.update({
            first_name: existingPlayer.first_name || user.first_name,
            last_name: existingPlayer.last_name || user.last_name
          });
        }
        console.log(`✅ Self-player ${user.id} claimed existing player ${existingPlayer.id} (code: ${existing_player_code})`);
      } else {
        // FLOW 2: Player signs up WITHOUT parent code → create new Player record
        // Player is their own parent for now (parent can link later)
        const parentId = user.id;

        const playerData = {
          first_name: user.first_name,
          last_name: user.last_name,
          date_of_birth: date_of_birth,
          gender: 'male',
          nationality: nationality || null,
          address: address || null,
          medical_notes: health_notes || null,
          parent_id: parentId,
          self_user_id: user.id,
          branch_id: branch_id,
          status: 'active',
          skill_level: 'beginner',
          join_date: new Date()
        };

        const player = await Player.create(playerData);

        // Handle file uploads for self-player without parent
        // NOTE: upload.fields() returns arrays, so we need [0] to get the single file
        if (req.files) {
          console.log('📁 Files received during signup:', Object.keys(req.files));
          try {
            // Upload avatar if provided
            if (req.files.avatar && req.files.avatar[0]) {
              console.log('📸 Uploading avatar for player:', player.id);
              const avatarResult = await playersService.uploadPhoto(player.id, req.files.avatar[0]);
              console.log('✅ Avatar uploaded:', avatarResult);
            }

            // Upload ID document if provided
            if (req.files.id_document && req.files.id_document[0]) {
              console.log('📄 Uploading ID document for player:', player.id);
              const idResult = await playersService.uploadIdDocument(player.id, req.files.id_document[0]);
              console.log('✅ ID document uploaded:', idResult);
            }

            console.log(`✅ Files uploaded for player ${player.id}`);
          } catch (uploadErr) {
            console.error('File upload error (non-blocking):', uploadErr.message);
            // Don't fail the signup if file upload fails
          }
        } else {
          console.log('📁 No files received during signup');
        }

        console.log(`✅ Auto-created player for self-player user ${user.id} (standalone, no parent linked)`);
      }
    } catch (playerError) {
      if (playerError instanceof AppError) {
        throw playerError;
      }
      console.error('Failed to handle player for self-player:', playerError);
    }
  }

  // If this is a regular parent signup, check if any self-player listed this phone as guardian → auto-link
  if (!isSelfPlayer) {
    try {
      const unlinkedPlayers = await Player.findAll({
        where: {
          self_user_id: { [Op.ne]: null },
          emergency_contact_phone: formattedPhone,
          parent_id: { [Op.col]: 'self_user_id' } // Currently linked to themselves
        }
      });

      for (const player of unlinkedPlayers) {
        await player.update({ parent_id: user.id });
        console.log(`🔗 Auto-linked player ${player.id} to new parent ${user.id}`);
      }
    } catch (linkError) {
      console.error('Error during auto-link check:', linkError);
    }
  }

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user.id);

  // Create session
  await createSession(user, accessToken, refreshToken, req);

  // Update last login
  await user.update({ last_login: new Date() });

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    data: {
      user: user.toJSON(),
      accessToken,
      refreshToken
    }
  });
});

/**
 * @desc    Login user with phone + password (Staff)
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.login = asyncHandler(async (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    throw new AppError('Phone number and password are required', 400);
  }

  // Format phone number
  const formattedPhone = formatPhoneNumber(phone);

  // Find user by phone (include branch for sidebar display)
  const user = await User.findOne({ 
    where: { phone: formattedPhone },
    include: [{ association: 'branch', attributes: ['id', 'name', 'name_ar'] }]
  });
  if (!user) {
    throw new AppError('Invalid phone number or password', 401);
  }

  // Check if user has a password (staff users should have passwords)
  if (!user.password) {
    throw new AppError('Please use OTP login for this account', 400);
  }

  // Check if user is active
  if (!user.is_active) {
    throw new AppError('Your account has been deactivated. Please contact support.', 403);
  }

  // Check password
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new AppError('Invalid phone number or password', 401);
  }

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user.id);

  // Create session
  await createSession(user, accessToken, refreshToken, req);

  // Update last login
  await user.update({ last_login: new Date() });

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: user.toJSON(),
      accessToken,
      refreshToken
    }
  });
});

/**
 * @desc    Get current user
 * @route   GET /api/auth/me
 * @access  Private
 */
exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id, {
    include: [{ association: 'branch' }]
  });

  const userData = user.toJSON();

  // For self-player: include their player record info (registration code, parent info)
  if (user.account_type === 'self_player') {
    const playerRecord = await Player.findOne({
      where: { self_user_id: user.id },
      include: [
        { association: 'parent', attributes: ['id', 'first_name', 'last_name', 'phone', 'email'] },
        { association: 'branch', attributes: ['id', 'name', 'name_ar'] }
      ]
    });
    if (playerRecord) {
      userData.player_record = {
        id: playerRecord.id,
        registration_number: playerRecord.registration_number,
        parent_id: playerRecord.parent_id,
        is_linked_to_parent: playerRecord.parent_id !== user.id,
        parent: playerRecord.parent_id !== user.id ? playerRecord.parent : null,
        branch: playerRecord.branch,
        avatar: playerRecord.avatar,
        id_document: playerRecord.id_document
      };
      
      // Also add player data directly for easier access in frontend
      userData.player = {
        id: playerRecord.id,
        avatar: playerRecord.avatar,
        id_document: playerRecord.id_document
      };
    }
  }

  // For parent: include registration codes of children (for sharing with players)
  if (user.account_type === 'parent') {
    const children = await Player.findAll({
      where: { parent_id: user.id },
      attributes: ['id', 'first_name', 'last_name', 'registration_number', 'self_user_id']
    });
    userData.children_codes = children.map(c => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      registration_number: c.registration_number,
      is_claimed: !!c.self_user_id
    }));
  }

  res.json({
    success: true,
    data: userData
  });
});

/**
 * @desc    Update current user
 * @route   PUT /api/auth/me
 * @access  Private
 */
exports.updateMe = asyncHandler(async (req, res) => {
  const { first_name, last_name, phone, preferences } = req.body;

  const user = await User.findByPk(req.user.id);
  
  await user.update({
    first_name: first_name || user.first_name,
    last_name: last_name || user.last_name,
    phone: phone || user.phone,
    preferences: preferences || user.preferences
  });

  // Sync profile between parent ↔ self-player accounts AND Player records
  try {
    if (user.account_type === 'parent') {
      // Parent updated → sync to all linked self-player User accounts AND Player records
      const linkedPlayers = await Player.findAll({
        where: { parent_id: user.id, self_user_id: { [Op.ne]: null } }
      });
      for (const player of linkedPlayers) {
        await User.update(
          { first_name: user.first_name, last_name: user.last_name },
          { where: { id: player.self_user_id } }
        );
        // Also update the Player record name
        await player.update({
          first_name: user.first_name,
          last_name: user.last_name
        });
      }
    } else if (user.account_type === 'self_player') {
      // Self-player updated → sync to Player record AND parent User account
      const playerRecord = await Player.findOne({
        where: { self_user_id: user.id }
      });
      if (playerRecord) {
        // Update the Player record name
        await playerRecord.update({
          first_name: user.first_name,
          last_name: user.last_name
        });
        // Sync to parent User if different user
        if (playerRecord.parent_id !== user.id) {
          await User.update(
            { first_name: user.first_name, last_name: user.last_name },
            { where: { id: playerRecord.parent_id } }
          );
        }
      }
    }
  } catch (syncErr) {
    console.error('Profile sync error (non-blocking):', syncErr.message);
  }

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: user
  });
});

/**
 * @desc    Change password
 * @route   POST /api/auth/change-password
 * @access  Private
 */
exports.changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;

  // Need to explicitly select password field since it's excluded by default
  const user = await User.findByPk(req.user.id, {
    attributes: { include: ['password'] }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Check if user has a password set
  if (!user.password) {
    throw new AppError('No password set for this account', 400);
  }

  // Verify current password
  const isMatch = await user.comparePassword(current_password);
  if (!isMatch) {
    throw new AppError('Current password is incorrect', 400);
  }

  // Update password
  user.password = new_password;
  await user.save();

  // Invalidate all other sessions (if session tracking exists)
  if (req.session?.id) {
    await Session.update(
      { is_active: false },
      { where: { user_id: user.id, id: { [Op.ne]: req.session.id } } }
    );
  }

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
});

/**
 * @desc    Forgot password - request reset
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ where: { email } });
  if (!user) {
    // Don't reveal if user exists
    return res.json({
      success: true,
      message: 'If an account exists with this email, you will receive a password reset link'
    });
  }

  // Generate reset token
  const resetToken = generateToken();
  const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await user.update({
    password_reset_token: resetToken,
    password_reset_expires: resetExpires
  });

  // TODO: Send email with reset link
  // For now, just return success
  // In production, send email with: ${FRONTEND_URL}/reset-password?token=${resetToken}

  res.json({
    success: true,
    message: 'If an account exists with this email, you will receive a password reset link',
    // Remove in production:
    ...(process.env.NODE_ENV === 'development' && { resetToken })
  });
});

/**
 * @desc    Reset password
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  const user = await User.findOne({
    where: {
      password_reset_token: token,
      password_reset_expires: { [require('sequelize').Op.gt]: new Date() }
    }
  });

  if (!user) {
    throw new AppError('Invalid or expired reset token', 400);
  }

  // Update password and clear reset token
  user.password = password;
  user.password_reset_token = null;
  user.password_reset_expires = null;
  await user.save();

  // Invalidate all sessions
  await Session.update(
    { is_active: false },
    { where: { user_id: user.id } }
  );

  res.json({
    success: true,
    message: 'Password reset successful. Please login with your new password.'
  });
});

/**
 * @desc    Refresh access token
 * @route   POST /api/auth/refresh-token
 * @access  Public
 */
exports.refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AppError('Refresh token is required', 400);
  }

  // Verify refresh token
  const decoded = jwt.verify(
    refreshToken,
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
  );

  // Find active session with this refresh token
  const session = await Session.findOne({
    where: {
      user_id: decoded.userId,
      refresh_token: refreshToken,
      is_active: true
    }
  });

  if (!session) {
    throw new AppError('Invalid refresh token', 401);
  }

  // Generate new tokens
  const tokens = generateTokens(decoded.userId);

  // Update session
  await session.update({
    token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    last_activity: new Date()
  });

  res.json({
    success: true,
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    }
  });
});

/**
 * @desc    Logout user
 * @route   POST /api/auth/logout
 * @access  Private
 */
exports.logout = asyncHandler(async (req, res) => {
  // Invalidate current session
  await Session.update(
    { is_active: false },
    { where: { id: req.session.id } }
  );

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * @desc    Logout from all devices
 * @route   POST /api/auth/logout-all
 * @access  Private
 */
exports.logoutAll = asyncHandler(async (req, res) => {
  // Invalidate all sessions
  await Session.update(
    { is_active: false },
    { where: { user_id: req.user.id } }
  );

  res.json({
    success: true,
    message: 'Logged out from all devices successfully'
  });
});

// ==================== OTP AUTHENTICATION ====================

/**
 * @desc    Send OTP to phone number
 * @route   POST /api/auth/send-otp
 * @access  Public
 */
exports.sendOTP = asyncHandler(async (req, res) => {
  const { phone, purpose = 'login' } = req.body;

  if (!phone) {
    throw new AppError('Phone number is required', 400);
  }

  // Format phone number
  const formattedPhone = formatPhoneNumber(phone);

  // Validate phone number
  if (!smsService.validatePhoneNumber(formattedPhone)) {
    throw new AppError('Invalid phone number format', 400);
  }

  // Rate limiting: Check if user has requested too many OTPs recently
  const recentOTPs = await OTP.count({
    where: {
      phone: formattedPhone,
      created_at: {
        [Op.gte]: new Date(Date.now() - 60 * 1000) // Last 1 minute
      }
    }
  });

  if (recentOTPs >= 1) {
    throw new AppError('Please wait before requesting another OTP', 429);
  }

  // Check daily limit (10 OTPs per day per phone)
  const dailyOTPs = await OTP.count({
    where: {
      phone: formattedPhone,
      created_at: {
        [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    }
  });

  if (dailyOTPs >= 10) {
    throw new AppError('Daily OTP limit reached. Please try again tomorrow.', 429);
  }

  // Create OTP
  const otp = await OTP.createOTP(formattedPhone, purpose, req);

  // Send OTP via SMS
  try {
    const message = `رمز التحقق الخاص بك هو: ${otp.code}\nThis is your verification code: ${otp.code}\nValid for 5 minutes.`;
    
    await smsService.send(formattedPhone, message);

    res.json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        phone: formattedPhone,
        expires_in: 300, // 5 minutes in seconds
        // Only include OTP in development for testing
        ...(process.env.NODE_ENV === 'development' && { otp: otp.code })
      }
    });
  } catch (error) {
    console.error('SMS send error:', error);
    throw new AppError('Failed to send OTP. Please try again.', 500);
  }
});

/**
 * @desc    Verify OTP and create session
 * @route   POST /api/auth/verify-otp
 * @access  Public
 */
exports.verifyOTP = asyncHandler(async (req, res) => {
  const { phone, code, first_name, last_name } = req.body;

  if (!phone || !code) {
    throw new AppError('Phone number and OTP code are required', 400);
  }

  // Format phone number
  const formattedPhone = formatPhoneNumber(phone);

  // Verify OTP
  const result = await OTP.verifyOTP(formattedPhone, code, 'login');

  if (!result.valid) {
    throw new AppError(result.error, 400);
  }

  // Find or create user
  let user = await User.findOne({ where: { phone: formattedPhone } });
  let isNewUser = false;

  if (!user) {
    // Create new user (parent by default for OTP login)
    if (!first_name || !last_name) {
      // Return a flag indicating user needs to complete registration
      return res.json({
        success: true,
        message: 'OTP verified. Please complete registration.',
        data: {
          phone: formattedPhone,
          requires_registration: true,
          verification_token: jwt.sign(
            { phone: formattedPhone, verified: true },
            process.env.JWT_SECRET,
            { expiresIn: '10m' }
          )
        }
      });
    }

    // Generate a unique email for OTP-only users
    const uniqueEmail = `parent_${Date.now()}@otp.academy.local`;

    user = await User.create({
      phone: formattedPhone,
      email: uniqueEmail,
      first_name,
      last_name,
      role: 'parent',
      is_verified: true,
      password: null // No password for OTP users
    });

    isNewUser = true;
  }

  // Check if user is active
  if (!user.is_active) {
    throw new AppError('Your account has been deactivated. Please contact support.', 403);
  }

  // Mark phone as verified
  if (!user.is_verified) {
    await user.update({ is_verified: true });
  }

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user.id);

  // Create session
  await createSession(user, accessToken, refreshToken, req);

  // Update last login
  await user.update({ last_login: new Date() });

  res.json({
    success: true,
    message: isNewUser ? 'Registration successful' : 'Login successful',
    data: {
      user: user.toJSON(),
      accessToken,
      refreshToken,
      is_new_user: isNewUser
    }
  });
});

/**
 * @desc    Complete registration after OTP verification
 * @route   POST /api/auth/complete-registration
 * @access  Public
 */
exports.completeOTPRegistration = asyncHandler(async (req, res) => {
  const { 
    verification_token, first_name, last_name, password, phone, branch_id,
    // Self-player fields
    account_type, date_of_birth, guardian_name, guardian_phone, guardian_relation,
    existing_player_code
  } = req.body;

  if (!first_name || !last_name || !password) {
    throw new AppError('First name, last name, and password are required', 400);
  }

  if (password.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400);
  }

  const isSelfPlayer = account_type === 'self_player';

  // Self-player requires DOB and guardian info
  if (isSelfPlayer) {
    if (!date_of_birth) {
      throw new AppError('Date of birth is required for player registration', 400);
    }
    if (!guardian_name || !guardian_phone) {
      throw new AppError('Guardian name and phone are required for player registration', 400);
    }
  }

  let verifiedPhone = phone;

  // If verification token provided, decode it
  if (verification_token) {
    try {
      const decoded = jwt.verify(verification_token, process.env.JWT_SECRET);
      if (decoded.verified && decoded.phone) {
        verifiedPhone = decoded.phone;
      }
    } catch (error) {
      throw new AppError('Invalid or expired verification token', 400);
    }
  }

  if (!verifiedPhone) {
    throw new AppError('Phone number is required', 400);
  }

  // Format phone number
  verifiedPhone = formatPhoneNumber(verifiedPhone);

  // Check if user already exists with this phone
  let user = await User.findOne({ where: { phone: verifiedPhone } });

  if (user) {
    throw new AppError('User already registered with this phone number', 400);
  }

  // Validate branch if provided
  if (branch_id) {
    const branch = await Branch.findByPk(branch_id);
    if (!branch) {
      throw new AppError('Branch not found', 404);
    }
  }

  // Generate unique email
  const emailPrefix = isSelfPlayer ? 'player' : 'parent';
  const userEmail = `${emailPrefix}_${Date.now()}@otp.academy.local`;

  // Create user with password
  user = await User.create({
    phone: verifiedPhone,
    email: userEmail,
    first_name,
    last_name,
    password,
    role: 'parent',
    account_type: isSelfPlayer ? 'self_player' : 'parent',
    date_of_birth: isSelfPlayer ? date_of_birth : null,
    is_verified: true,
    branch_id: branch_id || null
  });

  // If self-player, handle Player record (claim existing OR create new)
  if (isSelfPlayer && branch_id) {
    try {
      const formattedGuardianPhone = formatPhoneNumber(guardian_phone);

      // Option A: Claim an existing player (parent already added them)
      let claimedExisting = false;
      if (existing_player_code) {
        const existingPlayer = await Player.findOne({
          where: { registration_number: existing_player_code }
        });

        if (existingPlayer) {
          if (existingPlayer.self_user_id) {
            // Already claimed by someone else
            throw new AppError('This player profile has already been claimed by another account', 400);
          }
          // Claim this player: set self_user_id so the player can manage themselves
          await existingPlayer.update({
            self_user_id: user.id,
            emergency_contact_name: guardian_name || existingPlayer.emergency_contact_name,
            emergency_contact_phone: formattedGuardianPhone || existingPlayer.emergency_contact_phone,
            emergency_contact_relation: guardian_relation || existingPlayer.emergency_contact_relation
          });
          claimedExisting = true;
          console.log(`✅ Self-player ${user.id} claimed existing player ${existingPlayer.id} (code: ${existing_player_code})`);
        } else {
          // Code provided but not found → fail with clear error
          // Delete the user we just created since the claim failed
          await user.destroy();
          throw new AppError('Registration code not found. Please check the code and try again.', 404);
        }
      }

      // If no code provided → create a new Player record
      if (!claimedExisting) {
        // Check if a parent with guardian's phone already exists → auto-link
        let parentId = user.id; // Default: player is their own parent

        const existingParent = await User.findOne({
          where: { phone: formattedGuardianPhone, role: 'parent', account_type: 'parent', is_active: true }
        });

        if (existingParent) {
          parentId = existingParent.id; // Link to existing parent
        }

        // Generate registration number
        const count = await Player.count();
        const year = new Date().getFullYear();
        const registrationNumber = `PLR-${year}-${String(count + 1).padStart(5, '0')}`;

        await Player.create({
          registration_number: registrationNumber,
          first_name: user.first_name,
          last_name: user.last_name,
          date_of_birth: date_of_birth,
          gender: 'male',
          parent_id: parentId,
          self_user_id: user.id,
          branch_id: branch_id,
          status: 'active',
          skill_level: 'beginner',
          join_date: new Date(),
          emergency_contact_name: guardian_name,
          emergency_contact_phone: formattedGuardianPhone,
          emergency_contact_relation: guardian_relation || 'parent'
        });

        console.log(`✅ Auto-created player for self-player user ${user.id}${existingParent ? ` (linked to parent ${existingParent.id})` : ''}`);
      }
    } catch (playerError) {
      console.error('Failed to handle player for self-player:', playerError);
      // Don't fail the registration, player can be linked manually
    }
  }

  // If this is a regular parent signup, check if any self-player listed this phone as guardian → auto-link
  if (!isSelfPlayer) {
    try {
      const unlinkedPlayers = await Player.findAll({
        where: {
          self_user_id: { [Op.ne]: null },
          emergency_contact_phone: verifiedPhone,
          parent_id: { [Op.col]: 'self_user_id' } // Currently linked to themselves
        }
      });

      for (const player of unlinkedPlayers) {
        await player.update({ parent_id: user.id });
        console.log(`🔗 Auto-linked player ${player.id} to new parent ${user.id}`);
      }
    } catch (linkError) {
      console.error('Error during auto-link check:', linkError);
    }
  }

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user.id);

  // Create session
  await createSession(user, accessToken, refreshToken, req);

  // Update last login
  await user.update({ last_login: new Date() });

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    data: {
      user: user.toJSON(),
      accessToken,
      refreshToken
    }
  });
});

/**
 * @desc    Resend OTP
 * @route   POST /api/auth/resend-otp
 * @access  Public
 */
exports.resendOTP = asyncHandler(async (req, res) => {
  // Just call sendOTP with the same logic
  return exports.sendOTP(req, res);
});

// ==================== ADMIN REGISTRATION ====================

/**
 * @desc    Check setup status (if first admin exists)
 * @route   GET /api/auth/setup-status
 * @access  Public
 */
exports.checkSetupStatus = asyncHandler(async (req, res) => {
  // Check if any owner or super_admin exists
  const adminCount = await User.count({
    where: {
      role: { [Op.in]: ['owner', 'super_admin'] }
    }
  });

  res.json({
    success: true,
    data: {
      isFirstSetup: adminCount === 0,
      hasAdmins: adminCount > 0
    }
  });
});

/**
 * @desc    Verify admin setup key
 * @route   POST /api/auth/verify-setup-key
 * @access  Public
 */
exports.verifySetupKey = asyncHandler(async (req, res) => {
  const { setup_key } = req.body;

  if (!setup_key) {
    throw new AppError('Setup key is required', 400);
  }

  // Get setup key from environment variable
  const validSetupKey = process.env.ADMIN_SETUP_KEY || 'ASPIRE-ADMIN-2024-SETUP';

  // Verify the setup key
  if (setup_key !== validSetupKey) {
    throw new AppError('Invalid setup key', 401);
  }

  res.json({
    success: true,
    message: 'Setup key verified successfully'
  });
});

/**
 * @desc    Register admin account (Super Admin or Owner)
 * @route   POST /api/auth/register-admin
 * @access  Public (requires setup key)
 */
exports.registerAdmin = asyncHandler(async (req, res) => {
  const { 
    first_name, 
    last_name, 
    name_ar,
    email, 
    phone, 
    password, 
    role,
    setup_key 
  } = req.body;

  // Check if this is first setup (no admins exist)
  const adminCount = await User.count({
    where: {
      role: { [Op.in]: ['owner', 'super_admin'] }
    }
  });
  
  const isFirstSetup = adminCount === 0;

  // If not first setup, verify setup key
  if (!isFirstSetup) {
    const validSetupKey = process.env.ADMIN_SETUP_KEY || 'ASPIRE-ADMIN-2024-SETUP';
    if (!setup_key || setup_key !== validSetupKey) {
      throw new AppError('Invalid setup key', 401);
    }
  }

  // Validate required fields
  if (!first_name || !last_name || !email || !phone || !password) {
    throw new AppError('All fields are required', 400);
  }

  if (password.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400);
  }

  // Validate role
  const allowedRoles = ['super_admin', 'owner'];
  const userRole = role || (isFirstSetup ? 'owner' : 'super_admin');
  
  if (!allowedRoles.includes(userRole)) {
    throw new AppError('Invalid role specified', 400);
  }

  // Format phone number
  const formattedPhone = formatPhoneNumber(phone);

  // Check if email already exists
  const existingEmail = await User.findOne({ where: { email } });
  if (existingEmail) {
    throw new AppError('User with this email already exists', 400);
  }

  // Check if phone already exists
  const existingPhone = await User.findOne({ where: { phone: formattedPhone } });
  if (existingPhone) {
    throw new AppError('User with this phone number already exists', 400);
  }

  // Create admin user
  const user = await User.create({
    email,
    phone: formattedPhone,
    password,
    first_name,
    last_name,
    name_ar: name_ar || `${first_name} ${last_name}`,
    role: userRole,
    is_verified: true,
    is_active: true
  });

  res.status(201).json({
    success: true,
    message: `${userRole === 'owner' ? 'Owner' : 'Super Admin'} account created successfully`,
    data: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role
    }
  });
});

