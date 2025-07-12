// Dependencies
const authPass = require('../../auth_pass/native.js');
const HttpStatus = require('../../types/HttpStatus.js');

// DB Function Imports
const {
    db_getUserDetails,
    db_createUser,
    db_changePassword,
    db_createPasswordResetCode,
    db_validatePassResetCode,
} = require("./funs_db.js");

// Transactional Email Function Imports
const {
    sendWelcomeEmail,
    sendPasswordResetEmail
} = require('../../external_apis/resend.js');

/**
 * Handle login success
 */
function loginSuccess(_req, res, _next) {
    return res.sendStatus(HttpStatus.SUCCESS_STATUS);
}

/**
 * Handle login failure
 */
function loginFailure(err, _req, res, _next) {
    if (err.status !== 401) return res.sendStatus(HttpStatus.MISC_ERROR_STATUS);
    else return res.sendStatus(HttpStatus.UNAUTHORIZED_STATUS);
}

/**
 * Get user status
 */
async function getUserStatus(req, res) {
    try {
        // Get user details
        const [ok, resp] = await db_getUserDetails(req.user.id);
        // Return results
        if (!ok) return res.sendStatus(HttpStatus.FAILED_STATUS);
        return res.status(HttpStatus.SUCCESS_STATUS).json(resp);

    } catch (err) {
        console.log("MTE = ", err);
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}

/**
 * Register new user
 */
async function registerUser(req, res) {
    try {
        // Validate early access code
        if (!req.body.code) {
            return res.status(HttpStatus.FAILED_STATUS).send("Early access code required");
        }

        // Create user
        const [ok, user_id] = await db_createUser(req.body.em, req.body.pw, req.body.code);
        if (!ok) return res.status(HttpStatus.FAILED_STATUS).send("Failed to register");


        // Send welcome email
        await sendWelcomeEmail(req.body.em);
        return res.status(HttpStatus.SUCCESS_STATUS).send("User registered successfully");

    } catch (err) {
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}

/**
 * Change password
 */
async function changePassword(req, res) {
    try {
        await db_changePassword(req.user.id, req.body.p, function (resp) {
            if (resp.ok) return res.sendStatus(HttpStatus.SUCCESS_STATUS);
            else return res.status(HttpStatus.MISC_ERROR_STATUS).send(resp.msg ?? HttpStatus.MISC_ERROR_MSG);
        });

    } catch (err) {
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}

/**
 * Logout user
 */
function logoutUser(req, res, _next) {
    req.logout(function(err) {
        if (err) return res.sendStatus(HttpStatus.MISC_ERROR_STATUS);
        return res.sendStatus(HttpStatus.SUCCESS_STATUS);
    });
}

/**
 * Send password reset email
 */
async function requestPasswordReset(req, res) {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(HttpStatus.FAILED_STATUS).json({ error: 'Email is required' });
        }

        const [ok,result] = await db_createPasswordResetCode(email);
        if (!ok) {
            return res.status(HttpStatus.FAILED_STATUS).json({ error: 'User not found' });
        }
        const resetLink = `${process.env.FRONTEND_URL_PREFIX}/auth/reset-password?email=${encodeURIComponent(email)}&code=${result.code}`;
        await sendPasswordResetEmail(email, resetLink);

        return res.sendStatus(HttpStatus.SUCCESS_STATUS);
    } catch (err) {
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}

/**
 * Validate password reset code
 */
async function validatePasswordReset(req, res) {
    try {
        const { email, code, newPassword } = req.body;
        if (!email || !code || !newPassword) {
            return res.status(HttpStatus.FAILED_STATUS).send("Email, code, and new password are required");
        }
        // Validate code and update password
        const [ok, result] = await db_validatePassResetCode(email, code, newPassword);
        if (!ok) return res.status(HttpStatus.UNAUTHORIZED_STATUS).send("Invalid or expired password reset code");

        return res.sendStatus(HttpStatus.SUCCESS_STATUS);
    } catch (err) {
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}
// Export controllers
module.exports = {
    authPass,
    loginSuccess,
    loginFailure,
    getUserStatus,
    registerUser,
    changePassword,
    logoutUser,
    requestPasswordReset,
    validatePasswordReset
};