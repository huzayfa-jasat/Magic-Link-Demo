// Dependencies
const express = require('express');
const publicRouter = express.Router();

// Middleware
const { checkApiKey } = require('./middleware.js');

// Controller Imports
const {
    getCredits,
    validateEmails,
    validateCatchall
} = require('./controller.js');

// ------------
// Public API Routes
// ------------

// Apply API key middleware to all routes
publicRouter.use(checkApiKey);

// Get user credits
publicRouter.get('/credits', getCredits);

// Validate emails for valid/invalid status
publicRouter.post('/valid', validateEmails);

// Validate emails for catchall detection
publicRouter.post('/catchall', validateCatchall);

// Export routes
module.exports = publicRouter; 