// Middleware Functions

function checkUserAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    return res.sendStatus(401);
}

/**
 * 
 * @param {*} req 
 * @param {*} res 
 * @param {*} next 
 * @returns 
 */

function checkIncomingResultsAuth(req, res, next) {
    if (req.header('x-api-key') === process.env.RESULTS_API_KEY) return next();
    return res.sendStatus(401);
}

module.exports = {
    checkUserAuth,
    checkIncomingResultsAuth
};