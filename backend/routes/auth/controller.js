// Dependencies
const authPass = require('../../auth_pass/native.js');
const HttpStatus = require('../../types/HttpStatus.js');

// Function Imports
const { db_getUserDetails, db_createUser, db_changePassword } = require("./funs_db.js");

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
        const ok = await db_createUser(req.body.em, req.body.pw);
        if (ok) return res.sendStatus(HttpStatus.SUCCESS_STATUS);
        return res.status(HttpStatus.FAILED_STATUS).send("Failed to register");

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

// Export controllers
module.exports = {
    authPass,
    loginSuccess,
    loginFailure,
    getUserStatus,
    registerUser,
    changePassword,
    logoutUser
};