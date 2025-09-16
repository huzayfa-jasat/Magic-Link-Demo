// Dependencies
const crypto = require('crypto');
const knex = require('knex')(require('../../knexfile.js').development);

// Constants
const HASH_ITERATIONS = parseInt(process.env.HASH_ITERATIONS);

// Helper Functions
function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// -------------------
// CREATE Functions
// -------------------
async function db_createUser(email, pass) {
    let err_code;

    // Add user to database
    const db_resp = await knex('Users').insert({
        'email': email
    }).catch((err)=>{if (err) err_code = err});
    if (err_code) return [false, null];

    const user_id = db_resp[0];

    // Create password
    const create_pass = await new Promise((resolve, _) => {
        db_createPassword(user_id, pass, function(pw_ok) {
            if (!pw_ok.ok) return resolve([false, null]);
            return resolve([true, user_id]);
        });
    });
    if (!create_pass) return [false, null];

    // Return
    return [true, user_id];
}

async function db_createOtpCode(email) {
    try {
        const [user] = await knex('Users').where({email}).select('id');
        if (!user) return [false, null];

        const code = generateCode();

        await knex('OTP_Codes')
            .insert({
                user_id: user.id,
                code: code,
            })
            .onConflict('user_id')
            .merge(['code', 'expires_at']);

        return [true, code];
    } catch (err) {
        console.error("Error creating OTP code:", err);
        return [false, null];
    }
}

async function db_validateOtpCode(email, code) {
    try {
        const [user] = await knex('Users').where({email}).select('id');
        if (!user) return false;

        const [otpCode] = await knex('OTP_Codes')
            .where({
                user_id: user.id,
                code
            })
            .where('expires_at', '>', knex.fn.now())
            .select('user_id');

        if (!otpCode) return false;

        await knex('OTP_Codes')
            .where({user_id: user.id})
            .del();

        return { id: user.id, username: email };
    } catch (err) {
        console.error("Error validating OTP code:", err);
        return false;
    }
}

async function db_createPassword(target_user_id, pass, cb) {
    const gen_salt = crypto.randomBytes(128).toString('base64');
    try {
        crypto.pbkdf2(pass, gen_salt, HASH_ITERATIONS, 32, 'sha256', async function(crypto_err, hashedPassword) {
            if (crypto_err) return cb({'ok': false});
            var db_err = null;
            await knex('Users_Auth').insert({'user_id': target_user_id, 'hash': hashedPassword.toString('base64'), 'salt': gen_salt}).catch((err)=>{if (err) db_err = err.code});
            if (db_err) return cb({'ok': false});
            else return cb({'ok': true});
        });
    } catch (misc_err) {
        return cb({'ok': false});
    }
}

// Export functions
module.exports = {
    db_createUser,
    db_createOtpCode,
    db_validateOtpCode
};  