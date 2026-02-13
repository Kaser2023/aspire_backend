/**
 * Webhook routes for SMS delivery status callbacks.
 * 
 * These endpoints are called by SMS providers (Taqnyat, Plivo) to report
 * delivery status updates. They do NOT require JWT authentication — they
 * use provider-specific verification instead.
 * 
 * Mount at: /api/webhooks
 */

const express = require('express');
const router = express.Router();
const { SMS } = require('../models');
const { Op } = require('sequelize');

// ─────────────────────────────────────────────
//  Taqnyat Delivery Callback
// ─────────────────────────────────────────────
// Configure in Taqnyat portal: Developer → Developer Tools → Webhook URL
// URL: https://yourdomain.com/api/webhooks/taqnyat/delivery
//
// Taqnyat sends delivery status and expects the passPhrase back
// to confirm receipt. If not confirmed, it retries up to 3 times.

router.post('/taqnyat/delivery', async (req, res) => {
  try {
    const { messageId, status, passPhrase } = req.body;

    // Verify the webhook is really from Taqnyat
    const expectedSecret = process.env.TAQNYAT_WEBHOOK_SECRET;
    if (expectedSecret && passPhrase !== expectedSecret) {
      console.warn('[Webhook:taqnyat] Invalid passPhrase — rejecting');
      return res.status(401).json({ error: 'Invalid passPhrase' });
    }

    // Map Taqnyat status to our internal status
    const statusMap = {
      'delivered': 'delivered',
      'sent': 'sent',
      'failed': 'failed',
      'rejected': 'failed',
      'pending': 'pending'
    };

    const internalStatus = statusMap[String(status).toLowerCase()] || 'pending';

    // Find and update the SMS record by the provider messageId
    if (messageId) {
      const [updatedCount] = await SMS.update(
        {
          status: internalStatus,
          provider_response: {
            ...(typeof req.body === 'object' ? req.body : {}),
            webhook_received_at: new Date().toISOString()
          },
          ...(internalStatus === 'delivered' ? { sent_at: new Date() } : {})
        },
        {
          where: {
            [Op.or]: [
              { provider_response: { messageId: String(messageId) } },
              { provider_response: { messageId: Number(messageId) } }
            ]
          }
        }
      );

      console.log(
        `[Webhook:taqnyat] messageId=${messageId} status=${internalStatus} updated=${updatedCount}`
      );
    }

    // Return passPhrase to confirm receipt (Taqnyat requirement)
    res.json({ passPhrase: expectedSecret || 'ok' });
  } catch (error) {
    console.error('[Webhook:taqnyat] Error:', error.message);
    // Still return 200 to prevent Taqnyat from retrying on our errors
    res.status(200).json({ passPhrase: process.env.TAQNYAT_WEBHOOK_SECRET || 'ok' });
  }
});

// ─────────────────────────────────────────────
//  Plivo Delivery Report
// ─────────────────────────────────────────────
// Configure in Plivo console: Messaging → Applications → Message URL
// URL: https://yourdomain.com/api/webhooks/plivo/delivery

router.post('/plivo/delivery', async (req, res) => {
  try {
    const { MessageUUID, Status, To, From, ErrorCode } = req.body;

    // Map Plivo status to our internal status
    const statusMap = {
      'queued': 'pending',
      'sent': 'sent',
      'delivered': 'delivered',
      'undelivered': 'failed',
      'failed': 'failed',
      'rejected': 'failed'
    };

    const internalStatus = statusMap[String(Status).toLowerCase()] || 'pending';

    if (MessageUUID) {
      const [updatedCount] = await SMS.update(
        {
          status: internalStatus,
          provider_response: {
            ...(typeof req.body === 'object' ? req.body : {}),
            webhook_received_at: new Date().toISOString()
          },
          ...(internalStatus === 'failed' ? { error_message: `Plivo error: ${ErrorCode || Status}` } : {}),
          ...(internalStatus === 'delivered' ? { sent_at: new Date() } : {})
        },
        {
          where: {
            provider_response: { messageId: MessageUUID }
          }
        }
      );

      console.log(
        `[Webhook:plivo] MessageUUID=${MessageUUID} status=${internalStatus} updated=${updatedCount}`
      );
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[Webhook:plivo] Error:', error.message);
    res.status(200).send('OK');
  }
});

// ─────────────────────────────────────────────
//  Health check for webhook endpoint
// ─────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Webhook endpoint is active',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
