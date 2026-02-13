/**
 * SMS Service - Multi-provider abstraction layer
 * 
 * Providers:
 *   - taqnyat : Production (Saudi local provider, CITC compliant)
 *   - plivo   : Staging / Testing (international, cheap, Node.js SDK)
 *   - mock    : Local development (no real SMS sent)
 * 
 * Fallback: If the primary provider fails, automatically retries 
 * with the fallback provider (configurable via SMS_FALLBACK_PROVIDER).
 */

const axios = require('axios');

class SMSService {
  constructor() {
    this.provider = process.env.SMS_PROVIDER || 'mock';
    this.fallbackProvider = process.env.SMS_FALLBACK_PROVIDER || null;
    this.senderName = process.env.SMS_SENDER_NAME || 'AcademySMS';
    this.maxRetries = 2;
    this.retryDelay = 1000; // ms

    // Lazy-loaded Plivo client
    this._plivoClient = null;
  }

  // ─────────────────────────────────────────────
  // Plivo client (lazy singleton)
  // ─────────────────────────────────────────────
  get plivoClient() {
    if (!this._plivoClient) {
      const plivo = require('plivo');
      this._plivoClient = new plivo.Client(
        process.env.PLIVO_AUTH_ID,
        process.env.PLIVO_AUTH_TOKEN
      );
    }
    return this._plivoClient;
  }

  // ═════════════════════════════════════════════
  //  MAIN SEND — with automatic fallback
  // ═════════════════════════════════════════════

  /**
   * Send a single SMS via the configured provider.
   * If the primary provider fails and a fallback is configured,
   * the message is retried through the fallback provider.
   *
   * @param {string} to      - Phone number (any Saudi format)
   * @param {string} message - Message content (UTF-8, Arabic OK)
   * @returns {Promise<object>} Result with { success, provider, messageId, ... }
   */
  async send(to, message) {
    const formattedPhone = this.formatPhone(to);

    // --- Primary attempt ---
    try {
      return await this._sendViaProvider(this.provider, formattedPhone, message);
    } catch (primaryError) {
      console.error(
        `[SMS:${this.provider}] FAILED to=${formattedPhone} error="${primaryError.message}"`
      );

      // --- Fallback attempt ---
      if (this.fallbackProvider && this.fallbackProvider !== this.provider) {
        console.warn(
          `[SMS] Falling back from ${this.provider} → ${this.fallbackProvider}`
        );
        try {
          const result = await this._sendViaProvider(
            this.fallbackProvider,
            formattedPhone,
            message
          );
          result.fallback = true;
          result.primaryError = primaryError.message;
          return result;
        } catch (fallbackError) {
          console.error(
            `[SMS:${this.fallbackProvider}] FALLBACK ALSO FAILED to=${formattedPhone} error="${fallbackError.message}"`
          );
          // Throw original error with fallback info attached
          const err = new Error(
            `SMS failed on both providers. Primary (${this.provider}): ${primaryError.message} | Fallback (${this.fallbackProvider}): ${fallbackError.message}`
          );
          err.primaryError = primaryError;
          err.fallbackError = fallbackError;
          throw err;
        }
      }

      // No fallback configured — just throw
      throw primaryError;
    }
  }

  /**
   * Route to the correct provider method.
   * @private
   */
  async _sendViaProvider(providerName, to, message) {
    switch (providerName) {
      case 'taqnyat':
        return this.sendViaTaqnyat(to, message);
      case 'plivo':
        return this.sendViaPlivo(to, message);
      case 'mock':
        return this.mockSend(to, message);
      default:
        return this.mockSend(to, message);
    }
  }

  // ═════════════════════════════════════════════
  //  BULK SEND
  // ═════════════════════════════════════════════

  /**
   * Send SMS to multiple recipients.
   * For Taqnyat: uses native bulk endpoint (up to 1000 per request).
   * For Plivo / Mock: iterates and sends individually.
   *
   * @param {Array<{phone: string, message: string}>} messages
   * @returns {Promise<object>} { successful, failed, errors, totalCost }
   */
  async sendBulk(messages) {
    const results = {
      successful: 0,
      failed: 0,
      errors: [],
      totalCost: 0
    };

    // If Taqnyat + all messages have the SAME body, use native bulk
    if (this.provider === 'taqnyat') {
      const uniqueBodies = [...new Set(messages.map(m => m.message))];
      if (uniqueBodies.length === 1) {
        return this._sendBulkViaTaqnyat(
          messages.map(m => m.phone),
          uniqueBodies[0]
        );
      }
    }

    // Otherwise send one-by-one (with small delay to avoid rate limits)
    for (const msg of messages) {
      try {
        const result = await this.send(msg.phone, msg.message);
        results.successful++;
        results.totalCost += result.cost || 0;
      } catch (error) {
        results.failed++;
        results.errors.push({
          phone: msg.phone,
          error: error.message
        });
      }
      // Small delay between messages to be polite to the API
      if (messages.length > 10) {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    return results;
  }

  // ═════════════════════════════════════════════
  //  TAQNYAT PROVIDER
  // ═════════════════════════════════════════════

  /**
   * Send a single SMS via Taqnyat REST API.
   * Docs: https://dev.taqnyat.sa/en/doc/sms/
   *
   * @param {string} to      - Phone in +966XXXXXXXXX format
   * @param {string} message - UTF-8 message body
   */
  async sendViaTaqnyat(to, message) {
    const baseUrl = process.env.TAQNYAT_BASE_URL || 'https://api.taqnyat.sa';
    const bearer = process.env.TAQNYAT_BEARER_TOKEN;
    const sender = process.env.TAQNYAT_SENDER_NAME || this.senderName;

    if (!bearer) {
      throw new Error('TAQNYAT_BEARER_TOKEN is not configured');
    }

    // Taqnyat wants international format WITHOUT + or 00
    const taqnyatPhone = this._toTaqnyatFormat(to);

    const { data } = await axios.post(
      `${baseUrl}/v1/messages`,
      {
        recipients: [taqnyatPhone],
        body: message,
        sender
      },
      {
        headers: {
          'Authorization': `Bearer ${bearer}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (data.statusCode === 201) {
      console.log(
        `[SMS:taqnyat] SENT to=${taqnyatPhone} msgId=${data.messageId} cost=${data.cost} ${data.currency} segments=${data.msgLength}`
      );
      return {
        success: true,
        provider: 'taqnyat',
        messageId: String(data.messageId),
        to: taqnyatPhone,
        cost: data.cost || 0,
        currency: data.currency || 'SAR',
        segments: data.msgLength || 1,
        accepted: data.accepted,
        rejected: data.rejected
      };
    }

    // Taqnyat returned a non-201 status in the body
    throw new Error(data.message || `Taqnyat error: statusCode ${data.statusCode}`);
  }

  /**
   * Taqnyat native bulk send (same message to many recipients).
   * Max 1000 recipients per request — auto-chunks if more.
   * @private
   */
  async _sendBulkViaTaqnyat(phones, message) {
    const baseUrl = process.env.TAQNYAT_BASE_URL || 'https://api.taqnyat.sa';
    const bearer = process.env.TAQNYAT_BEARER_TOKEN;
    const sender = process.env.TAQNYAT_SENDER_NAME || this.senderName;

    const formatted = phones.map(p => this._toTaqnyatFormat(this.formatPhone(p)));

    // Chunk into groups of 1000
    const chunks = [];
    for (let i = 0; i < formatted.length; i += 1000) {
      chunks.push(formatted.slice(i, i + 1000));
    }

    const results = { successful: 0, failed: 0, errors: [], totalCost: 0 };

    for (const chunk of chunks) {
      try {
        const { data } = await axios.post(
          `${baseUrl}/v1/messages`,
          { recipients: chunk, body: message, sender },
          {
            headers: {
              'Authorization': `Bearer ${bearer}`,
              'Content-Type': 'application/json'
            },
            timeout: 60000
          }
        );

        if (data.statusCode === 201) {
          results.successful += data.totalCount || chunk.length;
          results.totalCost += data.cost || 0;
          console.log(
            `[SMS:taqnyat] BULK sent=${data.totalCount} cost=${data.cost} ${data.currency}`
          );
        } else {
          results.failed += chunk.length;
          results.errors.push({ phones: chunk.slice(0, 3), error: data.message });
        }
      } catch (error) {
        results.failed += chunk.length;
        results.errors.push({
          phones: chunk.slice(0, 3),
          error: error.response?.data?.message || error.message
        });
      }
    }

    return results;
  }

  /**
   * Send a scheduled SMS via Taqnyat.
   * @param {string} to            - Phone number
   * @param {string} message       - Message body
   * @param {Date|string} sendAt   - When to send (ISO string or Date)
   * @param {number|null} deleteId - Optional ID to cancel later
   */
  async sendScheduledViaTaqnyat(to, message, sendAt, deleteId = null) {
    const baseUrl = process.env.TAQNYAT_BASE_URL || 'https://api.taqnyat.sa';
    const bearer = process.env.TAQNYAT_BEARER_TOKEN;
    const sender = process.env.TAQNYAT_SENDER_NAME || this.senderName;
    const taqnyatPhone = this._toTaqnyatFormat(this.formatPhone(to));

    // Taqnyat format: yyyy-mm-ddThh:mm
    const dt = new Date(sendAt);
    const scheduledDatetime = dt.toISOString().slice(0, 16);

    const payload = {
      recipients: [taqnyatPhone],
      body: message,
      sender,
      scheduledDatetime
    };
    if (deleteId) payload.deleteId = deleteId;

    const { data } = await axios.post(`${baseUrl}/v1/messages`, payload, {
      headers: {
        'Authorization': `Bearer ${bearer}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    if (data.statusCode === 201) {
      return {
        success: true,
        provider: 'taqnyat',
        messageId: String(data.messageId),
        scheduled: true,
        scheduledAt: scheduledDatetime,
        cost: data.cost || 0
      };
    }

    throw new Error(data.message || `Taqnyat schedule error: ${data.statusCode}`);
  }

  /**
   * Cancel a scheduled Taqnyat SMS by deleteId.
   */
  async cancelScheduledTaqnyat(deleteId) {
    const baseUrl = process.env.TAQNYAT_BASE_URL || 'https://api.taqnyat.sa';
    const bearer = process.env.TAQNYAT_BEARER_TOKEN;

    const { data } = await axios.delete(`${baseUrl}/v1/messages/delete`, {
      headers: {
        'Authorization': `Bearer ${bearer}`,
        'Content-Type': 'application/json'
      },
      data: { deleteId },
      timeout: 15000
    });

    return data;
  }

  /**
   * List active Taqnyat sender names.
   */
  async getTaqnyatSenders() {
    const baseUrl = process.env.TAQNYAT_BASE_URL || 'https://api.taqnyat.sa';
    const bearer = process.env.TAQNYAT_BEARER_TOKEN;

    const { data } = await axios.get(`${baseUrl}/v1/messages/senders`, {
      headers: { 'Authorization': `Bearer ${bearer}` },
      timeout: 15000
    });

    if (data.statusCode === 201 && data.senders) {
      return data.senders;
    }
    return [];
  }

  // ═════════════════════════════════════════════
  //  PLIVO PROVIDER
  // ═════════════════════════════════════════════

  /**
   * Send a single SMS via Plivo Node.js SDK.
   * Docs: https://www.plivo.com/docs/messaging/quickstart/node-quickstart
   *
   * @param {string} to      - Phone in +966XXXXXXXXX format
   * @param {string} message - UTF-8 message body
   */
  async sendViaPlivo(to, message) {
    if (!process.env.PLIVO_AUTH_ID || !process.env.PLIVO_AUTH_TOKEN) {
      throw new Error('PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN is not configured');
    }

    const senderId = process.env.PLIVO_SENDER_ID || this.senderName;
    // Plivo wants E.164 format with +
    const plivoPhone = to.startsWith('+') ? to : `+${to.replace(/\D/g, '')}`;

    const response = await this.plivoClient.messages.create({
      src: senderId,
      dst: plivoPhone,
      text: message
    });

    const msgId = Array.isArray(response.messageUuid)
      ? response.messageUuid[0]
      : response.messageUuid;

    console.log(
      `[SMS:plivo] SENT to=${plivoPhone} msgId=${msgId}`
    );

    return {
      success: true,
      provider: 'plivo',
      messageId: msgId,
      to: plivoPhone,
      cost: null, // Plivo doesn't return cost on send
      currency: 'USD'
    };
  }

  // ═════════════════════════════════════════════
  //  MOCK PROVIDER (development)
  // ═════════════════════════════════════════════

  /**
   * Mock send for local development — no real SMS sent.
   */
  async mockSend(to, message) {
    const preview = message.length > 50 ? message.substring(0, 50) + '...' : message;
    console.log(`[SMS:mock] To: ${to}, Message: ${preview}`);

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      success: true,
      provider: 'mock',
      messageId: `mock_${Date.now()}`,
      to,
      cost: 0,
      currency: 'SAR'
    };
  }

  // ═════════════════════════════════════════════
  //  BALANCE
  // ═════════════════════════════════════════════

  /**
   * Get SMS account balance from the active provider.
   */
  async getBalance() {
    switch (this.provider) {
      case 'taqnyat':
        return this._getTaqnyatBalance();
      case 'plivo':
        return this._getPlivoBalance();
      default:
        return { balance: 9999, currency: 'SAR', credits: 99999 };
    }
  }

  /** @private */
  async _getTaqnyatBalance() {
    const baseUrl = process.env.TAQNYAT_BASE_URL || 'https://api.taqnyat.sa';
    const bearer = process.env.TAQNYAT_BEARER_TOKEN;

    try {
      const { data } = await axios.get(`${baseUrl}/account/balance`, {
        headers: { 'Authorization': `Bearer ${bearer}` },
        timeout: 10000
      });

      if (data.statusCode === 200) {
        const balance = parseFloat(data.balance);
        return {
          balance,
          currency: data.currency || 'SAR',
          credits: Math.floor(balance / 0.09), // approximate SMS count
          accountStatus: data.accountStatus,
          expiryDate: data.accountExpiryDate
        };
      }
      return { balance: 0, currency: 'SAR', credits: 0 };
    } catch (error) {
      console.error('[SMS:taqnyat] Balance check failed:', error.message);
      return { balance: 0, currency: 'SAR', credits: 0, error: error.message };
    }
  }

  /** @private */
  async _getPlivoBalance() {
    try {
      const account = await this.plivoClient.accounts.get();
      const balance = parseFloat(account.cashCredits);
      return {
        balance,
        currency: 'USD',
        credits: Math.floor(balance / 0.007) // approximate SA SMS count
      };
    } catch (error) {
      console.error('[SMS:plivo] Balance check failed:', error.message);
      return { balance: 0, currency: 'USD', credits: 0, error: error.message };
    }
  }

  // ═════════════════════════════════════════════
  //  COST ESTIMATION
  // ═════════════════════════════════════════════

  /**
   * Estimate the cost of sending a message.
   * Arabic text uses Unicode (UCS-2) = 70 chars/segment.
   * English text uses GSM-7 = 160 chars/segment.
   *
   * @param {string} message        - The message text
   * @param {number} recipientCount - Number of recipients
   * @returns {{ segments, costPerMessage, totalCost, currency, isUnicode }}
   */
  calculateCost(message, recipientCount = 1) {
    const isUnicode = /[^\x00-\x7F]/.test(message);
    const segmentLength = isUnicode ? 70 : 160;
    const segments = Math.ceil(message.length / segmentLength) || 1;

    let costPerSegment = 0;
    let currency = 'SAR';

    switch (this.provider) {
      case 'taqnyat':
        costPerSegment = 0.09; // SAR (varies by package)
        break;
      case 'plivo':
        costPerSegment = 0.007 * 3.75; // USD → SAR
        currency = 'SAR';
        break;
      default:
        costPerSegment = 0;
        break;
    }

    return {
      segments,
      costPerMessage: parseFloat((segments * costPerSegment).toFixed(4)),
      totalCost: parseFloat((segments * costPerSegment * recipientCount).toFixed(4)),
      currency,
      isUnicode
    };
  }

  // ═════════════════════════════════════════════
  //  PHONE UTILITIES
  // ═════════════════════════════════════════════

  /**
   * Validate a Saudi mobile number.
   * Saudi mobile numbers start with 5 and have 9 digits after the country code.
   */
  validatePhoneNumber(phone) {
    const saudiPattern = /^(\+966|966|0)?5[0-9]{8}$/;
    return saudiPattern.test(phone.replace(/\s/g, ''));
  }

  /**
   * Format any Saudi phone input to international format: +966XXXXXXXXX
   */
  formatPhone(phone) {
    let cleaned = String(phone).replace(/\D/g, '');

    if (cleaned.startsWith('00')) {
      cleaned = cleaned.substring(2);
    } else if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }

    if (!cleaned.startsWith('966')) {
      cleaned = '966' + cleaned;
    }

    return '+' + cleaned;
  }

  /**
   * Convert to Taqnyat format: 966XXXXXXXXX (no + or 00).
   * @private
   */
  _toTaqnyatFormat(phone) {
    return String(phone).replace(/\D/g, '').replace(/^0+/, '') || phone;
  }

  // ═════════════════════════════════════════════
  //  COMPATIBILITY — used by schedule.service.js
  // ═════════════════════════════════════════════

  /**
   * Send SMS using the object-based signature that schedule.service.js uses:
   *   smsService.sendSMS({ recipient_type, recipients: [{phone, user_id}], message })
   *
   * This bridges the old calling convention to our standard send() method.
   */
  async sendSMS({ recipients, message }) {
    if (!recipients || !recipients.length || !message) {
      throw new Error('sendSMS requires recipients[] and message');
    }

    const results = { successful: 0, failed: 0, errors: [] };

    for (const r of recipients) {
      try {
        await this.send(r.phone, message);
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({ phone: r.phone, error: error.message });
      }
    }

    return results;
  }

  // ═════════════════════════════════════════════
  //  PROVIDER INFO
  // ═════════════════════════════════════════════

  /**
   * Get the current provider configuration summary (safe for logging / admin UI).
   */
  getProviderInfo() {
    return {
      provider: this.provider,
      fallbackProvider: this.fallbackProvider || 'none',
      senderName: this.senderName,
      hasTaqnyatConfig: !!process.env.TAQNYAT_BEARER_TOKEN,
      hasPlivoConfig: !!(process.env.PLIVO_AUTH_ID && process.env.PLIVO_AUTH_TOKEN)
    };
  }
}

module.exports = new SMSService();
