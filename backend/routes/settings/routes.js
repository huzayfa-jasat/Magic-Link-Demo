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

// Routes
settingsRouter.use(checkUserAuth);
settingsRouter.get('/profile/dtl', getProfileDetails);
settingsRouter.get('/api/keys/view', getApiKey);
settingsRouter.post('/api/keys/generate', generateApiKey);
settingsRouter.delete('/api/keys/delete', deleteApiKey);
settingsRouter.patch('/profile/:key/touch', updateProfileDetails);

// Export
module.exports = settingsRouter;