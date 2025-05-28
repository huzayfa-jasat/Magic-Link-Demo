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

// App Config
const app = express();

console.log('NODE_ENV:', process.env.NODE_ENV);

// Webhook route needs raw body
const webhookRoute = require('./routes/webhooks/routes.js');
const route_prefix = (process.env.NODE_ENV === "development") ? "/api" : "";
app.use(route_prefix + '/webhooks/', webhookRoute);

// Body parser middleware
app.use(bodyParser.json());

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
    else {
      // Optional: Log rejected origins for debugging
      console.log(`CORS rejected origin: ${origin}`);
      callback(null, false);
    }
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
const emailsRoute = require('./routes/emails/routes.js');
const creditsRoute = require('./routes/credits/routes.js');
const paymentRoute = require('./routes/payment/routes.js');

// Routes
app.use(route_prefix+'/auth/', authRoute);
app.use(route_prefix+'/settings/', settingsRoute);
app.use(route_prefix+'/emails/', emailsRoute);
app.use(route_prefix+'/credits/', creditsRoute);
app.use(route_prefix+'/payment/', paymentRoute);

// Catch unhandled requests
app.all('/*', (_, res) => { res.sendStatus(404); });

// Expose app
const PORT = process.env.PORT || 5050;
var server = app.listen(PORT, () => {
	console.log(`listening to requests on port ${PORT}`);
});
server.setTimeout(330000); // 5min 30s
