// Dependencies
const express = require('express');
const settingsRouter = express.Router();

// Middleware
const { checkUserAuth } = require('../auth/funs_perms.js');

// Controller Imports
const {
    getProfileDetails,
    getApiKey,
    generateApiKey,
    deleteApiKey,
    updateProfileDetails,
} = require('./controller.js');

// Middleware
settingsRouter.use(checkUserAuth);

// Profile Routes
settingsRouter.get('/profile/dtl', getProfileDetails);
settingsRouter.patch('/profile/:key/touch', updateProfileDetails);

// API Key Routes
settingsRouter.get('/api/keys/view', getApiKey);
settingsRouter.post('/api/keys/generate', generateApiKey);
settingsRouter.delete('/api/keys/delete', deleteApiKey);

// Export
module.exports = settingsRouter;