// Dependencies
const express = require('express');
const settingsRouter = express.Router();

// Middleware
const { checkUserAuth } = require('../auth/funs_perms.js');

// Controller Imports
const {
    getProfileDetails,
    updateProfileDetails,
} = require('./controller.js');

// Routes
settingsRouter.use(checkUserAuth);
settingsRouter.get('/profile/dtl', getProfileDetails);
settingsRouter.patch('/profile/:key/touch', updateProfileDetails);

// Export
module.exports = settingsRouter;