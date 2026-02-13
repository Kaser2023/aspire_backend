const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const OTP = sequelize.define('OTP', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    code: {
      type: DataTypes.STRING(10),
      allowNull: false
    },
    purpose: {
      type: DataTypes.ENUM('login', 'register', 'reset_password', 'verify_phone'),
      defaultValue: 'login'
    },
    attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    max_attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 3
    },
    is_used: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    verified_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'otps',
    timestamps: true,
    underscored: true
  });

  // Class methods
  OTP.generateCode = function(length = 6) {
    let code = '';
    for (let i = 0; i < length; i++) {
      code += Math.floor(Math.random() * 10);
    }
    return code;
  };

  OTP.createOTP = async function(phone, purpose = 'login', req = null) {
    // Invalidate existing OTPs for this phone
    await OTP.update(
      { is_used: true },
      { where: { phone, purpose, is_used: false } }
    );

    // Create new OTP
    const code = OTP.generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const otp = await OTP.create({
      phone,
      code,
      purpose,
      expires_at: expiresAt,
      ip_address: req?.ip,
      user_agent: req?.get('user-agent')
    });

    return otp;
  };

  OTP.verifyOTP = async function(phone, code, purpose = 'login') {
    const otp = await OTP.findOne({
      where: {
        phone,
        code,
        purpose,
        is_used: false
      },
      order: [['created_at', 'DESC']]
    });

    if (!otp) {
      return { valid: false, error: 'Invalid OTP code' };
    }

    // Check if expired
    if (new Date() > new Date(otp.expires_at)) {
      return { valid: false, error: 'OTP has expired' };
    }

    // Check attempts
    if (otp.attempts >= otp.max_attempts) {
      return { valid: false, error: 'Maximum attempts exceeded' };
    }

    // Increment attempts
    await otp.increment('attempts');

    // Check if code matches
    if (otp.code !== code) {
      return { valid: false, error: 'Invalid OTP code' };
    }

    // Mark as used
    await otp.update({
      is_used: true,
      verified_at: new Date()
    });

    return { valid: true, otp };
  };

  return OTP;
};

