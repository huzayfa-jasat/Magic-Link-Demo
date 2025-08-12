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
    db_createOtpCode,
    db_validateOtpCode,
} = require("./funs_db.js");

// Transactional Email Function Imports
const {
    resend_sendWelcomeEmail,
    resend_sendOtpEmail,
    resend_sendPasswordResetEmail,
    resend_sendPasswordResetEmailFromSettings,
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
        // if (!req.body.code) {
        //     return res.status(HttpStatus.FAILED_STATUS).send("Early access code required");
        // }

        // Create user
        const [ok, user_id] = await db_createUser(req.body.em, req.body.pw /*, req.body.code*/);
        if (!ok) return res.status(HttpStatus.FAILED_STATUS).send("Failed to register");


        // Send welcome email
        await resend_sendWelcomeEmail(req.body.em);
        return res.status(HttpStatus.SUCCESS_STATUS).send("User registered successfully");

    } catch (err) {
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}

/**
 * Send OTP code
 */
async function sendOtpCode(req, res) {
    try {
        const { email } = req.body;

        // Validate body
        if (!email) return res.status(HttpStatus.FAILED_STATUS).send("Missing required fields");

        // Send OTP code
        const [ok, otp_code] = await db_createOtpCode(email);
        
        // Send OTP email
        if (ok) {
            const otp_link = `${process.env.FRONTEND_URL_PREFIX}/otp?email=${encodeURIComponent(email)}&code=${encodeURIComponent(otp_code)}`;
            resend_sendOtpEmail(email, otp_link);
        }

        // Don't leak existence / non-existence of users
        // - Same return status even if user DNE
        return res.sendStatus(HttpStatus.SUCCESS_STATUS);

    } catch (err) {
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}

/**
 * Verify OTP code
 */
async function verifyOtpCode(req, res) {
    try {
        const { email, code } = req.body;

        // Validate body
        if (!email || !code) return res.status(HttpStatus.FAILED_STATUS).send("Missing required fields");

        // Validate email and code
        const user = await db_validateOtpCode(email, code);
        if (!user) return res.status(HttpStatus.UNAUTHORIZED_STATUS).send("Invalid or expired OTP code");

        // Login user using passport login
        req.logIn(user, function(err) {
            if (err) {
                return res.status(HttpStatus.MISC_ERROR_STATUS).send("Login failed");
            }
            return res.status(HttpStatus.SUCCESS_STATUS).send("OTP code verified successfully");
        });
        
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

        // Validate body
        if (!email) return res.status(HttpStatus.FAILED_STATUS).json({ error: 'Email is required' });

        // Create password reset code
        const [ok,result] = await db_createPasswordResetCode(email);

        // Don't leak existence / non-existence of users
        // - Same return status even if user DNE
        if (ok) {
            // Send password reset email
            const resetLink = `${process.env.FRONTEND_URL_PREFIX}/forgot-password?email=${encodeURIComponent(email)}&code=${result.code}`;
            await resend_sendPasswordResetEmail(email, resetLink);
        }
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

/**
 * Send password reset email from settings (authenticated users)
 */
async function requestPasswordResetFromSettings(req, res) {
    try {
        // Get user email from authenticated user
        const [ok, userDetails] = await db_getUserDetails(req.user.id);
        if (!ok) return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
        
        const email = userDetails.email;
        
        // Create password reset code
        const [codeOk, result] = await db_createPasswordResetCode(email);
        
        if (codeOk) {
            // Send password reset email - only include code in URL
            const resetLink = `${process.env.FRONTEND_URL_PREFIX}/reset-password?code=${result.code}`;
            await resend_sendPasswordResetEmailFromSettings(email, resetLink);
        }
        
        return res.sendStatus(HttpStatus.SUCCESS_STATUS);
    } catch (err) {
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}

/**
 * Validate password reset code from settings flow
 */
async function validatePasswordResetFromSettings(req, res) {
    try {
        const { code, newPassword } = req.body;
        if (!code || !newPassword) {
            return res.status(HttpStatus.FAILED_STATUS).send("Code and new password are required");
        }
        
        // Get user email from authenticated session
        const [ok, userDetails] = await db_getUserDetails(req.user.id);
        if (!ok) return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
        
        // Validate code and update password
        const [validateOk, result] = await db_validatePassResetCode(userDetails.email, code, newPassword);
        if (!validateOk) return res.status(HttpStatus.UNAUTHORIZED_STATUS).send("Invalid or expired password reset code");
        
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
    sendOtpCode,
    verifyOtpCode,
    changePassword,
    logoutUser,
    requestPasswordReset,
    validatePasswordReset,
    requestPasswordResetFromSettings,
    validatePasswordResetFromSettings
};