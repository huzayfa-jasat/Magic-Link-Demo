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
    sendOtpCode,
    verifyOtpCode,
    changePassword,
    logoutUser,
    requestPasswordReset,
    validatePasswordReset,
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
authRouter.post('/otp/send', sendOtpCode);
authRouter.post('/otp/verify', verifyOtpCode);
authRouter.patch('/pw/touch', checkUserAuth, changePassword);
authRouter.get('/logout', checkUserAuth, logoutUser);
authRouter.post('/forgot-password/send', requestPasswordReset);
authRouter.post('/forgot-password/validate', validatePasswordReset);

// Export routes
module.exports = authRouter; 