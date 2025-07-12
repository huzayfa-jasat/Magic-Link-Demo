// Dependencies
const crypto = require('crypto');
const knex = require('knex')(require('../../knexfile.js').development);
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Constants
const HASH_ITERATIONS = parseInt(process.env.HASH_ITERATIONS);

function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
// -------------------
// CREATE Functions
// -------------------
async function db_createUser(email, pass, early_access_code) {
	let err_code;
	
    // Validate early access code
    const code_result = await knex('Early_Access_Codes')
        .where('txt_code', early_access_code)
        .select('num_credits')
        .first()
        .catch((err) => { if (err) err_code = err });
    
    if (err_code || !code_result) return false;

    // Generate referral code
    const referral_code = crypto.randomBytes(10).toString('hex').toUpperCase().slice(0, 6);

    // Add to user table
	const db_resp = await knex('Users').insert({
		'email': email,
        'referral_code': referral_code,
	}).catch((err)=>{if (err) err_code = err});
	if (err_code) return false;

	// Insert initial balance for new user with early access credits
	const user_id = db_resp[0];
	await knex('Users_Credit_Balance').insert({
		'user_id': user_id,
		'current_balance': code_result.num_credits
	}).catch((err)=>{if (err) err_code = err});
	if (err_code) return false;

    // Record signup event
    if (code_result.num_credits > 0) {
        await knex('Users_Credit_Balance_History').insert({
            'user_id': user_id,
            'credits_used': code_result.num_credits,
            'event_typ': 'signup'
        }).catch((err)=>{if (err) err_code = err});
        if (err_code) return false;
    }

	// Delete used early access code
	await knex('Early_Access_Codes')
		.where('txt_code', early_access_code)
		.del()
		.catch((err)=>{if (err) err_code = err});
	if (err_code) return false;

	// Create password
    const create_pass = await new Promise((resolve, _) => {
        db_createPassword(user_id, pass, function(pw_ok) {
            if (!pw_ok.ok) return resolve(false);
            return resolve(true);
        });
    });
    if (!create_pass) return false;

    // Create Stripe customer
    try {
        await createStripeCustomer(user_id, email);
    } catch (error) {
        console.error('Error creating Stripe customer:', error);
        // Don't fail registration if Stripe customer creation fails
        // The customer can be created later when they make their first purchase
    }

    return true;
}

// Create Stripe customer
async function createStripeCustomer(userId, email) {
    try {
        const customer = await stripe.customers.create({
            email: email,
            metadata: {
                userId: userId
            }
        });
        // Update user with Stripe ID
        await knex('Users')
            .where('id', userId)
            .update({ stripe_id: customer.id });
        return customer.id;
    } catch (error) {
        console.error('Error creating Stripe customer:', error);
        throw error;
    }
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
    db_validatePassResetCode
};  