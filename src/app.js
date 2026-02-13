const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Import routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const playerRoutes = require('./routes/player.routes');
const branchRoutes = require('./routes/branch.routes');
const programRoutes = require('./routes/program.routes');
const paymentRoutes = require('./routes/payment.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const smsRoutes = require('./routes/sms.routes');
const announcementRoutes = require('./routes/announcement.routes');
const automaticAnnouncementRoutes = require('./routes/automaticAnnouncement.routes');
const branchAnnouncementRoutes = require('./routes/branchAnnouncement.routes');
const statsRoutes = require('./routes/stats.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const notificationRoutes = require('./routes/notification.routes');
const scheduleRoutes = require('./routes/schedule.routes');
const evaluationRoutes = require('./routes/evaluation.routes');
const expenseRoutes = require('./routes/expense.routes');
const accountantAutoAnnouncementRoutes = require('./routes/accountantAutoAnnouncement.routes');
const discountRoutes = require('./routes/discount.routes');
const subscriptionFreezeRoutes = require('./routes/subscriptionFreeze.routes');
const webhookRoutes = require('./routes/webhook.routes');
const productRoutes = require('./routes/product.routes');
const auditLogRoutes = require('./routes/auditLog.routes');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const { notFound } = require('./middleware/notFound');

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploads (with CORS headers for images)
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, '../uploads')));

// API Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Academy ASP API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/automatic-announcements', automaticAnnouncementRoutes);
app.use('/api/branch-announcements', branchAnnouncementRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/accountant-auto-announcements', accountantAutoAnnouncementRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/subscription-freezes', subscriptionFreezeRoutes);
app.use('/api/webhooks', webhookRoutes); // SMS delivery callbacks (no JWT auth)
app.use('/api/products', productRoutes);
app.use('/api/audit-logs', auditLogRoutes);

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

module.exports = app;

