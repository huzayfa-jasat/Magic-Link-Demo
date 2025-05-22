// Dependencies
const crypto = require('crypto');
const knex = require('knex')(require('../../knexfile.js').development);

// Constants
const HASH_ITERATIONS = parseInt(process.env.HASH_ITERATIONS);


// -------------------
// CREATE Functions
// -------------------
async function db_createUser(email, pass) {
	let err_code;
	
    // Generate referral code
    const referral_code = crypto.randomBytes(10).toString('hex').toUpperCase().slice(0, 6);

    // Add to user table
	const db_resp = await knex('Users').insert({
		'email': email,
        'referral_code': referral_code,
	}).catch((err)=>{if (err) err_code = err});
	if (err_code) return false;

	// Create password
    const create_pass = await new Promise((resolve, _) => {
        db_createPassword(db_resp[0], pass, function(pw_ok) {
            if (!pw_ok.ok) return resolve(false);
            return resolve(true);
        });
    });
    if (!create_pass) return false;
    return true;
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


// -------------------
// DELETE Functions
// -------------------



// ----- Export -----
module.exports = {
	db_getUserDetails,
	db_createUser,
	db_changePassword, db_createPassword,
};