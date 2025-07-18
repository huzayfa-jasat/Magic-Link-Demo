// Dependencies
const express = require('express');
const settingsRouter = express.Router();

// Middleware
const { checkUserAuth } = require('../auth/funs_perms.js');

// Controller Imports
const {
    getProfileDetails,
    getApiKey,
    createApiKey,
    refreshApiKey,
    removeApiKey,
    updateProfileDetails,
} = require('./controller.js');

// Routes
settingsRouter.use(checkUserAuth);
settingsRouter.get('/profile/dtl', getProfileDetails);
settingsRouter.get('/api/keys/view', getApiKey);
settingsRouter.post('/api/keys/new', createApiKey);
settingsRouter.patch('/api/keys/refresh', refreshApiKey);
settingsRouter.delete('/api/keys/rm', removeApiKey);
settingsRouter.patch('/profile/:key/touch', updateProfileDetails);

// Export
module.exports = settingsRouter;