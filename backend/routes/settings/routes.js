// Dependencies
const express = require('express');
const settingsRouter = express.Router();

// Middleware
const { checkUserAuth } = require('../auth/funs_perms.js');

// Controller Imports
const {
    getProfileDetails,
    getApiKey,
    updateProfileDetails,
    updateProfileName,
    updateProfilePicture,
} = require('./controller.js');

// Routes
settingsRouter.use(checkUserAuth);
settingsRouter.get('/profile/dtl', getProfileDetails);
settingsRouter.get('/api-key', getApiKey);
settingsRouter.patch('/profile/name/touch', updateProfileName);
settingsRouter.patch('/profile/profile_picture/touch', updateProfilePicture);
settingsRouter.patch('/profile/:key/touch', updateProfileDetails);

// Export
module.exports = settingsRouter;