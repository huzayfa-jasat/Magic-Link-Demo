// Middleware Functions

function checkUserAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    return res.sendStatus(401);
}

module.exports = {
    checkUserAuth
};