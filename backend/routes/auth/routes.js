// Dependencies
const express = require('express');
const authRouter = express.Router();

// Middleware
const { checkUserAuth } = require('./funs_perms.js');

// Controller Imports
const {
    authPass,
    loginSuccess, loginFailure,
    getUserStatus,
    registerUser,
    changePassword,
    logoutUser
} = require('./controller.js');

// ------------
// Auth Routes
// ------------

authRouter.post('/login', authPass.authenticate('local', {failureMessage: true, failWithError: true}),
    loginSuccess,
    loginFailure
);

authRouter.get('/status', checkUserAuth, getUserStatus);
authRouter.post('/register', registerUser);
authRouter.patch('/pw/touch', checkUserAuth, changePassword);
authRouter.get('/logout', checkUserAuth, logoutUser);

// Export routes
module.exports = authRouter; 