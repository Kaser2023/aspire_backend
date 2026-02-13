require('dotenv').config();
const http = require('http');
const app = require('./app');
const { sequelize } = require('./models');
const smsScheduler = require('./jobs/scheduler');
const { initSocket } = require('./socket');

const PORT = process.env.PORT || 5000;

// Test database connection and start server
const startServer = async () => {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');

    // Sync models (in development only - use migrations in production)
    if (process.env.NODE_ENV === 'development') {
      // await sequelize.sync({ alter: false }); // Completely disabled due to database constraints
      console.log('📊 Database sync disabled - using existing database schema.');
    }

    // Initialize SMS Scheduler (cron jobs)
    if (process.env.ENABLE_SMS_SCHEDULER !== 'false') {
      smsScheduler.init();
    }

    // Create HTTP server and initialize Socket.IO
    const httpServer = http.createServer(app);
    initSocket(httpServer);

    // Start the server
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 API URL: http://localhost:${PORT}/api`);
      console.log(`🔌 WebSocket server initialized`);
    });
  } catch (error) {
    console.error('❌ Unable to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    sql: error.sql,
    parameters: error.parameters
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', {
    message: reason.message,
    stack: reason.stack,
    name: reason.name,
    sql: reason.sql,
    parameters: reason.parameters
  });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('👋 SIGTERM received. Shutting down gracefully...');
  smsScheduler.stop();
  await sequelize.close();
  process.exit(0);
});

startServer();

