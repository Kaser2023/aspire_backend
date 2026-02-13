/**
 * Payment Service - Multi-provider abstraction layer
 * 
 * Providers:
 *   - moyasar : Production (Saudi local provider, SAMA licensed)
 *   - tap     : Alternative (MENA region, good plugin support)
 *   - mock    : Local development (no real payments)
 * 
 * Supports: Mada, STC Pay, Apple Pay, Visa/Mastercard
 * 
 * Configuration via .env:
 *   PAYMENT_PROVIDER=moyasar|tap|mock
 */

const axios = require('axios');

class PaymentService {
  constructor() {
    this.provider = process.env.PAYMENT_PROVIDER || 'mock';
    
    // Provider configurations
    this.config = {
      moyasar: {
        baseUrl: 'https://api.moyasar.com/v1',
        secretKey: process.env.MOYASAR_SECRET_KEY,
        publishableKey: process.env.MOYASAR_PUBLISHABLE_KEY,
        callbackUrl: process.env.PAYMENT_CALLBACK_URL || `${process.env.BACKEND_URL}/api/payments/callback`,
      },
      tap: {
        baseUrl: 'https://api.tap.company/v2',
        secretKey: process.env.TAP_SECRET_KEY,
        publishableKey: process.env.TAP_PUBLISHABLE_KEY,
        callbackUrl: process.env.PAYMENT_CALLBACK_URL || `${process.env.BACKEND_URL}/api/payments/callback`,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  MAIN METHODS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create a payment session/charge
   * @param {object} options Payment options
   * @param {number} options.amount - Amount in smallest currency unit (halalas for SAR)
   * @param {string} options.currency - Currency code (default: SAR)
   * @param {string} options.description - Payment description
   * @param {object} options.metadata - Additional metadata (subscription_id, player_id, etc.)
   * @param {string} options.source - Payment source type (optional, for specific methods)
   * @param {string} options.callbackUrl - Override callback URL (optional)
   * @returns {Promise<object>} Payment session with redirect URL or form data
   */
  async createPayment(options) {
    const { amount, currency = 'SAR', description, metadata = {}, callbackUrl } = options;

    console.log(`[Payment:${this.provider}] Creating payment: ${amount} ${currency} - ${description}`);

    switch (this.provider) {
      case 'moyasar':
        return this._createMoyasarPayment({ amount, currency, description, metadata, callbackUrl });
      case 'tap':
        return this._createTapPayment({ amount, currency, description, metadata, callbackUrl });
      case 'mock':
        return this._createMockPayment({ amount, currency, description, metadata });
      default:
        throw new Error(`Unknown payment provider: ${this.provider}`);
    }
  }

  /**
   * Verify/fetch payment status
   * @param {string} paymentId - Payment ID from the provider
   * @returns {Promise<object>} Payment status and details
   */
  async getPayment(paymentId) {
    console.log(`[Payment:${this.provider}] Fetching payment: ${paymentId}`);

    switch (this.provider) {
      case 'moyasar':
        return this._getMoyasarPayment(paymentId);
      case 'tap':
        return this._getTapPayment(paymentId);
      case 'mock':
        return this._getMockPayment(paymentId);
      default:
        throw new Error(`Unknown payment provider: ${this.provider}`);
    }
  }

  /**
   * Process refund
   * @param {string} paymentId - Original payment ID
   * @param {number} amount - Amount to refund (optional, full refund if not specified)
   * @returns {Promise<object>} Refund result
   */
  async refund(paymentId, amount = null) {
    console.log(`[Payment:${this.provider}] Refunding payment: ${paymentId}, amount: ${amount || 'full'}`);

    switch (this.provider) {
      case 'moyasar':
        return this._refundMoyasar(paymentId, amount);
      case 'tap':
        return this._refundTap(paymentId, amount);
      case 'mock':
        return this._refundMock(paymentId, amount);
      default:
        throw new Error(`Unknown payment provider: ${this.provider}`);
    }
  }

  /**
   * Verify webhook signature
   * @param {object} payload - Webhook payload
   * @param {string} signature - Signature from headers
   * @returns {boolean} Whether signature is valid
   */
  verifyWebhook(payload, signature) {
    switch (this.provider) {
      case 'moyasar':
        return this._verifyMoyasarWebhook(payload, signature);
      case 'tap':
        return this._verifyTapWebhook(payload, signature);
      case 'mock':
        return true;
      default:
        return false;
    }
  }

  /**
   * Get frontend configuration (publishable keys, etc.)
   * @returns {object} Frontend-safe configuration
   */
  getFrontendConfig() {
    const baseConfig = {
      provider: this.provider,
      currency: 'SAR',
      supportedMethods: ['mada', 'creditcard', 'applepay', 'stcpay'],
    };

    switch (this.provider) {
      case 'moyasar':
        return {
          ...baseConfig,
          publishableKey: this.config.moyasar.publishableKey,
          supportedMethods: ['mada', 'creditcard', 'applepay', 'stcpay'],
        };
      case 'tap':
        return {
          ...baseConfig,
          publishableKey: this.config.tap.publishableKey,
          supportedMethods: ['mada', 'creditcard', 'applepay', 'stcpay'],
        };
      case 'mock':
        return {
          ...baseConfig,
          publishableKey: 'mock_pk_test',
        };
      default:
        return baseConfig;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  MOYASAR IMPLEMENTATION
  // ═══════════════════════════════════════════════════════════════

  async _createMoyasarPayment({ amount, currency, description, metadata, callbackUrl }) {
    const config = this.config.moyasar;
    
    try {
      const response = await axios.post(
        `${config.baseUrl}/payments`,
        {
          amount: amount, // Amount in halalas (1 SAR = 100 halalas)
          currency: currency,
          description: description,
          callback_url: callbackUrl || config.callbackUrl,
          metadata: metadata,
          source: {
            type: 'creditcard', // Will be overridden by frontend form
          },
        },
        {
          auth: {
            username: config.secretKey,
            password: '',
          },
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      return this._normalizeMoyasarPayment(response.data);
    } catch (error) {
      console.error('[Payment:moyasar] Create payment error:', error.response?.data || error.message);
      throw this._handleMoyasarError(error);
    }
  }

  async _getMoyasarPayment(paymentId) {
    const config = this.config.moyasar;

    try {
      const response = await axios.get(
        `${config.baseUrl}/payments/${paymentId}`,
        {
          auth: {
            username: config.secretKey,
            password: '',
          },
        }
      );

      return this._normalizeMoyasarPayment(response.data);
    } catch (error) {
      console.error('[Payment:moyasar] Get payment error:', error.response?.data || error.message);
      throw this._handleMoyasarError(error);
    }
  }

  async _refundMoyasar(paymentId, amount) {
    const config = this.config.moyasar;

    try {
      const payload = amount ? { amount } : {};
      const response = await axios.post(
        `${config.baseUrl}/payments/${paymentId}/refund`,
        payload,
        {
          auth: {
            username: config.secretKey,
            password: '',
          },
        }
      );

      return {
        success: true,
        refundId: response.data.id,
        amount: response.data.amount,
        status: response.data.status,
        provider: 'moyasar',
      };
    } catch (error) {
      console.error('[Payment:moyasar] Refund error:', error.response?.data || error.message);
      throw this._handleMoyasarError(error);
    }
  }

  _normalizeMoyasarPayment(data) {
    return {
      id: data.id,
      status: this._normalizeMoyasarStatus(data.status),
      amount: data.amount,
      currency: data.currency,
      description: data.description,
      metadata: data.metadata || {},
      source: {
        type: data.source?.type,
        company: data.source?.company,
        lastFour: data.source?.number?.slice(-4),
      },
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      provider: 'moyasar',
      raw: data,
    };
  }

  _normalizeMoyasarStatus(status) {
    const statusMap = {
      initiated: 'pending',
      paid: 'completed',
      failed: 'failed',
      authorized: 'authorized',
      captured: 'completed',
      refunded: 'refunded',
      voided: 'cancelled',
    };
    return statusMap[status] || status;
  }

  _verifyMoyasarWebhook(payload, signature) {
    const crypto = require('crypto');
    const secret = this.config.moyasar.secretKey;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    return signature === expectedSignature;
  }

  _handleMoyasarError(error) {
    if (error.response) {
      const data = error.response.data;
      const err = new Error(data.message || 'Moyasar payment error');
      err.code = data.type || 'PAYMENT_ERROR';
      err.statusCode = error.response.status;
      err.details = data.errors || [];
      return err;
    }
    return error;
  }

  // ═══════════════════════════════════════════════════════════════
  //  TAP IMPLEMENTATION
  // ═══════════════════════════════════════════════════════════════

  async _createTapPayment({ amount, currency, description, metadata, callbackUrl }) {
    const config = this.config.tap;

    try {
      const response = await axios.post(
        `${config.baseUrl}/charges`,
        {
          amount: amount / 100, // Tap uses major currency units (SAR, not halalas)
          currency: currency,
          description: description,
          metadata: metadata,
          receipt: {
            email: true,
            sms: true,
          },
          redirect: {
            url: callbackUrl || config.callbackUrl,
          },
          source: {
            id: 'src_all', // Accept all payment methods
          },
        },
        {
          headers: {
            Authorization: `Bearer ${config.secretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return this._normalizeTapPayment(response.data);
    } catch (error) {
      console.error('[Payment:tap] Create payment error:', error.response?.data || error.message);
      throw this._handleTapError(error);
    }
  }

  async _getTapPayment(paymentId) {
    const config = this.config.tap;

    try {
      const response = await axios.get(
        `${config.baseUrl}/charges/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${config.secretKey}`,
          },
        }
      );

      return this._normalizeTapPayment(response.data);
    } catch (error) {
      console.error('[Payment:tap] Get payment error:', error.response?.data || error.message);
      throw this._handleTapError(error);
    }
  }

  async _refundTap(paymentId, amount) {
    const config = this.config.tap;

    try {
      const payload = {
        charge_id: paymentId,
        reason: 'requested_by_customer',
      };
      if (amount) {
        payload.amount = amount / 100; // Convert to major units
      }

      const response = await axios.post(
        `${config.baseUrl}/refunds`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${config.secretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        refundId: response.data.id,
        amount: response.data.amount * 100, // Convert back to halalas
        status: response.data.status,
        provider: 'tap',
      };
    } catch (error) {
      console.error('[Payment:tap] Refund error:', error.response?.data || error.message);
      throw this._handleTapError(error);
    }
  }

  _normalizeTapPayment(data) {
    return {
      id: data.id,
      status: this._normalizeTapStatus(data.status),
      amount: Math.round(data.amount * 100), // Convert to halalas for consistency
      currency: data.currency,
      description: data.description,
      metadata: data.metadata || {},
      source: {
        type: data.source?.payment_method,
        company: data.source?.payment_type,
        lastFour: data.source?.last_four,
      },
      redirectUrl: data.transaction?.url,
      createdAt: data.transaction?.created,
      provider: 'tap',
      raw: data,
    };
  }

  _normalizeTapStatus(status) {
    const statusMap = {
      INITIATED: 'pending',
      CAPTURED: 'completed',
      AUTHORIZED: 'authorized',
      FAILED: 'failed',
      CANCELLED: 'cancelled',
      DECLINED: 'failed',
      REFUNDED: 'refunded',
    };
    return statusMap[status] || status.toLowerCase();
  }

  _verifyTapWebhook(payload, signature) {
    const crypto = require('crypto');
    const secret = this.config.tap.secretKey;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    return signature === expectedSignature;
  }

  _handleTapError(error) {
    if (error.response) {
      const data = error.response.data;
      const err = new Error(data.errors?.[0]?.description || 'Tap payment error');
      err.code = data.errors?.[0]?.code || 'PAYMENT_ERROR';
      err.statusCode = error.response.status;
      err.details = data.errors || [];
      return err;
    }
    return error;
  }

  // ═══════════════════════════════════════════════════════════════
  //  MOCK IMPLEMENTATION (Development)
  // ═══════════════════════════════════════════════════════════════

  async _createMockPayment({ amount, currency, description, metadata }) {
    const paymentId = `mock_pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[Payment:mock] Created mock payment: ${paymentId}`);

    // Store in memory for retrieval (in real app, use Redis or DB)
    if (!global._mockPayments) {
      global._mockPayments = {};
    }
    
    const payment = {
      id: paymentId,
      status: 'pending',
      amount: amount,
      currency: currency,
      description: description,
      metadata: metadata,
      source: {
        type: 'mock',
        company: 'Mock Bank',
        lastFour: '4242',
      },
      createdAt: new Date().toISOString(),
      provider: 'mock',
    };

    global._mockPayments[paymentId] = payment;

    return {
      ...payment,
      redirectUrl: `${process.env.FRONTEND_URL}/payment/mock?payment_id=${paymentId}`,
    };
  }

  async _getMockPayment(paymentId) {
    if (!global._mockPayments || !global._mockPayments[paymentId]) {
      throw new Error(`Mock payment not found: ${paymentId}`);
    }
    return global._mockPayments[paymentId];
  }

  async _refundMock(paymentId, amount) {
    if (!global._mockPayments || !global._mockPayments[paymentId]) {
      throw new Error(`Mock payment not found: ${paymentId}`);
    }

    const payment = global._mockPayments[paymentId];
    payment.status = 'refunded';

    return {
      success: true,
      refundId: `mock_ref_${Date.now()}`,
      amount: amount || payment.amount,
      status: 'refunded',
      provider: 'mock',
    };
  }

  /**
   * Complete a mock payment (for testing)
   * @param {string} paymentId - Mock payment ID
   * @param {boolean} success - Whether payment should succeed
   */
  async completeMockPayment(paymentId, success = true) {
    if (this.provider !== 'mock') {
      throw new Error('completeMockPayment only works with mock provider');
    }

    if (!global._mockPayments || !global._mockPayments[paymentId]) {
      throw new Error(`Mock payment not found: ${paymentId}`);
    }

    global._mockPayments[paymentId].status = success ? 'completed' : 'failed';
    return global._mockPayments[paymentId];
  }
}

// Singleton instance
const paymentService = new PaymentService();

module.exports = paymentService;
