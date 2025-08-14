// Dependencies
const crypto = require('crypto');
const knex = require('knex')(require('../../knexfile.js').development);

// Constants
const HASH_ITERATIONS = parseInt(process.env.HASH_ITERATIONS);
const AUTO_SIGNUP_BONUS = 50000;

// Helper Functions
function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
function calculateSignupBonus(user_id) {
    if (user_id > 500) return 0;
    return AUTO_SIGNUP_BONUS;
}

// -------------------
// CREATE Functions
// -------------------
async function db_createUser(email, pass /*, early_access_code*/) {
	let err_code;
	
    // Validate early access code
    // const code_result = await knex('Early_Access_Codes')
    //     .where('txt_code', early_access_code)
    //     .select('num_credits', 'num_catchall_credits')
    //     .first()
    //     .catch((err) => { if (err) err_code = err });
    // if (err_code || !code_result) return [false, null];

    // Generate referral code
    const referral_code = crypto.randomBytes(10).toString('hex').toUpperCase().slice(0, 6);

    // Add to user table (without API key initially)
	const db_resp = await knex('Users').insert({
		'email': email,
        'referral_code': referral_code,
	}).catch((err)=>{if (err) err_code = err});
	if (err_code) return [false, null];

	// Insert initial balance for new user with early access credits
	const user_id = db_resp[0];
    // if (code_result.num_credits > 0) {
        await knex('Users_Credit_Balance').insert({
            'user_id': user_id,
            'current_balance': signup_bonus // code_result.num_credits
        }).catch((err)=>{if (err) err_code = err});
        if (err_code) return [false, null];
    // }
    // if (code_result.num_catchall_credits > 0) {
        await knex('Users_Catchall_Credit_Balance').insert({
            'user_id': user_id,
            'current_balance': 0 // code_result.num_catchall_credits
        }).catch((err)=>{if (err) err_code = err});
        if (err_code) return [false, null];
    // }

    // Get signup bonus
    const signup_bonus = calculateSignupBonus(user_id);

    // Record signup event
    // if (code_result.num_credits > 0) {
        await knex('Users_Credit_Balance_History').insert({
            'user_id': user_id,
            'credits_used': signup_bonus, // code_result.num_credits
            'event_typ': 'signup'
        }).catch((err)=>{if (err) err_code = err});
        if (err_code) return false;
    // }
    // if (code_result.num_catchall_credits > 0) {
        await knex('Users_Catchall_Credit_Balance_History').insert({
            'user_id': user_id,
            'credits_used': 0, // code_result.num_catchall_credits
            'event_typ': 'signup'
        }).catch((err)=>{if (err) err_code = err});
        if (err_code) return false;
    // }

	// Delete used early access code
	// await knex('Early_Access_Codes')
	// 	.where('txt_code', early_access_code)
	// 	.del()
	// 	.catch((err)=>{if (err) err_code = err});
	// if (err_code) return [false, null];

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

async function db_createPasswordResetCode(email) {
    const maxRetries = 10;
    let retries = 0;
    let success = false;

    while (!success && retries < maxRetries) {
        try {

            const [user] = await knex('Users').where({email}).select('id');
            if (!user) return [false, null];

            const code = generateCode();

            await knex('PassReset_Codes').insert({
                user_id: user.id,
                code: code,
            });

            success = true;
            return [true, {code,user_id: user.id}];
        } catch (err) {
            if (err.code) {
                retries++;
                if (retries === maxRetries) {
                    return [false, null];
                }
            } else {
                return [false, null];
            }
        }
    }
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


// -------------------
// READ Functions
// -------------------
async function db_getUserDetails(user_id) {
	let err_code;

    // Account details
    const db_resp = await knex('Users').where('id',user_id).select('email AS email').limit(1).catch((err)=>{if (err) err_code = err.code});
    if (err_code || db_resp.length <= 0) return [false, null];

    // Format + return data
    return [true, {
        ...db_resp[0],
    }];
}


// -------------------
// UPDATE Functions
// -------------------
async function db_changePassword(user_id, pw, cb) {
    const gen_salt = crypto.randomBytes(128).toString('base64');
    try {
        crypto.pbkdf2(pw, gen_salt, HASH_ITERATIONS, 32, 'sha256', async function(crypto_err, hashedPassword) {
            if (crypto_err) return cb({ok: false, msg: 'Misc Crypto Error'});
            var err_code = null;
            await knex('Users_Auth').where('user_id',user_id).update({"hash": hashedPassword.toString('base64'), "salt": gen_salt}).catch((err)=>{if (err) err_code = err.code});
            if (err_code) return cb({ok: false, msg: 'Error updating password.'});
            else return cb({ok: true});
        });
    } catch (misc_err) {
        return cb({ok: false, msg: 'An unknown error occurred.'});
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


/**
 * Validate a password reset code and update password
 */
async function db_validatePassResetCode(email, code, newPassword) {
    try {
        // Get user ID from email
        const [user] = await knex('Users').where({ email }).select('id');
        if (!user) return [false, "User not found"];

        // Find valid code
        const [resetCode] = await knex('PassReset_Codes')
            .where({
                user_id: user.id,
                code
            })
            .where('created_ts', '>', knex.raw('DATE_SUB(NOW(), INTERVAL 10 MINUTE)'))
            .select('id');

        if (!resetCode) return [false, "Invalid or expired code"];

        // Delete the code entry
        await knex('PassReset_Codes')
            .where({ id: resetCode.id })
            .del();

        // Update password
        await new Promise((resolve, reject) => {
            db_changePassword(user.id, newPassword, (resp) => {
                if (resp.ok) resolve();
                else reject(new Error(resp.msg || "Password change failed"));
            });
        });

        return [true, { user_id: user.id }];
    } catch (err) {
        console.error("Error validating password reset code:", err);
        return [false, "Failed to validate password reset code"];
    }
}

// -------------------
// DELETE Functions
// -------------------



// ----- Export -----
module.exports = {
	db_getUserDetails,
	db_createUser,
	db_changePassword, db_createPassword,
    db_createPasswordResetCode,
    db_validatePassResetCode,
    db_createOtpCode,
    db_validateOtpCode
};  