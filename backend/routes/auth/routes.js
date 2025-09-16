// Dependencies
const express = require('express');
const authRouter = express.Router();

// Middleware
const { checkUserAuth } = require('./funs_perms.js');

// Controller Imports
const {
    registerUser,
    requestMagicLink,
    verifyMagicLink,
    refreshToken,
    logoutUser,
} = require('./controller.js');

// Async handler wrapper
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// ------------
// Auth Routes
// ------------

// Registration
authRouter.post('/register', asyncHandler(registerUser));

// Magic Link Request
authRouter.post('/magic-link/request', asyncHandler(requestMagicLink));

// Magic Link Verification
authRouter.post('/magic-link/verify', asyncHandler(verifyMagicLink));

// Token Refresh
authRouter.post('/refresh', asyncHandler(refreshToken));

// Logout
authRouter.post('/logout', checkUserAuth, asyncHandler(logoutUser));

// Export routes
module.exports = authRouter;