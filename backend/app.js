// Import env variables (development if necessary)
require('dotenv').config();
if (process.env.NODE_ENV === "development") {
  const result = require("dotenv").config({ path: ".env.dev" });
  process.env = {...process.env, ...result.parsed};
}

// Dependencies
const express = require('express');
var bodyParser = require('body-parser');
var cors = require('cors');

// Queue Imports
const { initializeQueue, shutdownQueue } = require('./queue');

// App Config
const app = express();

// Webhook route needs raw body - MUST come before body parser middleware
const webhooksRoute = require('./routes/webhooks/routes.js');
const route_prefix = (process.env.NODE_ENV === "development") ? "/api" : "";
app.use(route_prefix+'/wh/', webhooksRoute);

// Body parser middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// CORS Middleware
var corsWL = [
  'https://api.omniverifier.com', 
  'https://app.omniverifier.com',
]; //white list consumers
if (process.env.NODE_ENV === "development") corsWL = [...corsWL, 'http://localhost', 'http://localhost:80', 'http://localhost:28528', 'http://localhost:5050', 'http://127.0.0.1', 'http://127.0.0.1:80', 'http://127.0.0.1:28528', 'http://127.0.0.1:5050'];
// Allow requests from any port in development
if (process.env.NODE_ENV === "development") {
  corsWL = [...corsWL, ...corsWL.map(url => url.includes('localhost') || url.includes('127.0.0.1') ? url : '')].filter(Boolean);
}
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if the origin is in our whitelist
    if (corsWL.indexOf(origin) !== -1) callback(null, true);
    else callback(null, false);
  },
  methods: ['GET', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
  credentials: true, //Credentials are cookies, authorization headers or TLS client certificates.
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'device-remember-token', 'Access-Control-Allow-Origin', 'Origin', 'Accept']
}));

// Session Middleware
const session = require('express-session');
const authPass = require('./auth_pass/native.js');
var app_session_config = {
  'name': "omniverifier.user.session",
  'secret': "6d8cd4acfa600e9996ce5fc81a9ca07918f5ef2d41dc19fc94e3b2f89bf710ec",
  'cookie': {
    'maxAge': 60000 * 60 * 24, // 24 hours
    'secure': false,
    'sameSite': "lax"
  },
  'saveUninitialized': true,
  'resave': false
};
if (process.env.NODE_ENV !== "development") {
  var RedisStore = require('connect-redis').default;
  const Redis = require('ioredis');
  const CACHE_SERVER = new Redis({ host: process.env.CACHE_SERVER_HOSTNAME, port: process.env.CACHE_SERVER_PORT });
  app_session_config['store'] = new RedisStore({
    client: CACHE_SERVER,
    prefix: "omniverifier-user-ssn:",
  });
}
app.use(session(app_session_config));
app.use(authPass.initialize());
app.use(authPass.session());

// Middleware Routes
const authRoute = require('./routes/auth/routes.js');
const settingsRoute = require('./routes/settings/routes.js');
const creditsRoute = require('./routes/credits/routes.js');
const catchallCreditsRoute = require('./routes/catchall-credits/routes.js');
const paymentRoute = require('./routes/payment/routes.js');
const batchesRoute = require('./routes/batches/routes.js');
const publicRoute = require('./routes/public/routes.js');
const subscriptionsRoute = require('./routes/subscriptions/routes.js');

// Routes
app.use(route_prefix+'/auth/', authRoute);
app.use(route_prefix+'/settings/', settingsRoute);
app.use(route_prefix+'/credits/', creditsRoute);
app.use(route_prefix+'/catchall-credits/', catchallCreditsRoute);
app.use(route_prefix+'/pay/', paymentRoute);
app.use(route_prefix+'/subscriptions/', subscriptionsRoute);
app.use(route_prefix+'/batches/', batchesRoute);
app.use(route_prefix+'/validate/', publicRoute);

// Catch unhandled requests
app.all('/*', (_, res) => { res.sendStatus(404); });

// Expose app
const PORT = process.env.PORT || 5050;
var server = app.listen(PORT, async () => {
  console.log(`listening to requests on port ${PORT}`);
  
  // Initialize queue system after server starts
  await startupQueue();
});
server.setTimeout(330000); // 5min 30s

// Queue startup handling
async function startupQueue() {
  console.log('Starting Bouncer Queue System...');
  try {
    const queueStarted = await initializeQueue();
    if (queueStarted) console.log('✅ Bouncer Queue System started successfully');
    else console.log('⚠️ Failed to start Bouncer Queue System - continuing without queue');
  } catch (error) {
    console.error('❌ Error starting Bouncer Queue System:', error.message);
    console.log('⚠️ Server will continue without queue system');
  }
}

// Queue shutdown handling
async function gracefulShutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Close server first
    console.log('Closing HTTP server...');
    server.close(async () => {
      console.log('✅ HTTP server closed');
      
      // Shutdown queue system
      console.log('Shutting down queue system...');
      try {
        await shutdownQueue();
        console.log('✅ Queue system shutdown complete');
      } catch (error) {
        console.error('❌ Error shutting down queue system:', error.message);
      }
      
      console.log('🎯 Graceful shutdown complete');
      process.exit(0);
    });
    
    // Force exit after 10 seconds if graceful shutdown fails
    setTimeout(() => {
      console.error('⏰ Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    console.error('💥 Error during graceful shutdown:', error.message);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});