// Import env variables for development
require('dotenv').config();

// Dependencies
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { metricsMiddleware, metricsEndpoint } = require('./middleware/metrics');
const { securityMiddleware, corsConfig, contentTypeValidation, requestIdMiddleware } = require('./middleware/security');

// App Config
const app = express();

// Security headers middleware (must be first)
app.use(securityMiddleware());

// Request ID middleware for tracking
app.use(requestIdMiddleware);

// Body parser middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Content-Type validation middleware
app.use(contentTypeValidation);

// CORS Middleware with proper configuration
app.use(cors(corsConfig()));

// Metrics middleware
app.use(metricsMiddleware);

// Session Middleware (memory storage for development)
const session = require('express-session');
const authPass = require('./auth_pass/native.js');

const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || "6d8cd4acfa600e9996ce5fc81a9ca07918f5ef2d41dc19fc94e3b2f89bf710ec";

var app_session_config = {
  name: "magic-link-demo.session",
  secret: sessionSecret,
  cookie: {
    maxAge: 60000 * 60 * 24, // 24 hours
    secure: isProduction, // Secure cookies in production (HTTPS only)
    sameSite: isProduction ? "strict" : "lax", // Strict in production
    httpOnly: true, // Prevent XSS attacks
    domain: isProduction ? process.env.COOKIE_DOMAIN : undefined
  },
  saveUninitialized: false, // Don't save uninitialized sessions
  resave: false,
  rolling: true, // Reset expiration on activity
  proxy: isProduction // Trust proxy in production
};

app.use(session(app_session_config));
app.use(authPass.initialize());
app.use(authPass.session());

// Magic Link Auth Routes
const authRoute = require('./routes/auth/routes.js');
app.use('/api/auth/', authRoute);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'magic-link-demo' });
});

// Metrics endpoint
app.get('/metrics', metricsEndpoint);

// Error handling middleware
app.use((err, req, res, next) => {
  const statusCode = err.status || 500;
  const clientMessage = process.env.NODE_ENV === 'production' 
    ? 'An error occurred' 
    : err.message;
  
  // Log detailed error information
  console.error(`[${statusCode}] Global error handler:`, {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });
  
  // Send opaque error to client
  res.status(statusCode).json({
    error: clientMessage,
    timestamp: new Date().toISOString()
  });
});

// Catch unhandled requests
app.all('/*', (_, res) => { res.sendStatus(404); });

// Expose app
const PORT = process.env.PORT || 5050;
var server = app.listen(PORT, () => {
  console.log(`🚀 Magic Link Demo Server listening on port ${PORT}`);
  console.log(`💌 Email service: Resend`);
  console.log(`🔑 Auth: Magic Link + JWT`);
  console.log(`📊 Metrics available at /metrics`);
});

server.setTimeout(330000); // 5min 30s

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
  
  // Force exit after 5 seconds
  setTimeout(() => {
    console.error('⏰ Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 5000);
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});