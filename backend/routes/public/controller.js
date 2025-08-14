// Dependencies
const HttpStatus = require('../../types/HttpStatus.js');

// DB Function Imports
const {
    db_getUserCredits
} = require('./funs_db.js');


/**
 * Get user credits
 */
async function getCredits(req, res) {
    try {
        const [ok, credits] = await db_getUserCredits(req.user.id);
        if (!ok) return res.status(HttpStatus.FAILED_STATUS).send("Failed to retrieve credits");
        return res.status(HttpStatus.SUCCESS_STATUS).json({ credits });

    } catch (err) {
        console.log("MTE = ", err);
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}



// Export controllers
module.exports = {
    getCredits
}; 