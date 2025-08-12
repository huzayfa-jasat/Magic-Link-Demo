// Dependencies
const crypto = require('crypto');
var Passport = require('passport').Passport;
var LocalStrategy = require('passport-local').Strategy;

// Constants
const HASH_ITERATIONS = parseInt(process.env.HASH_ITERATIONS);

// DB
const knex = require('knex')(require('../knexfile.js').development);

// Sign In Logic
async function db_verifyUser(username, password, cb) {
  const email = username;
  try {
    var err_code = null;
    // Try login consultant
    const db_resp = await knex('Users_Auth').join('Users', 'Users_Auth.user_id', 'Users.id').where('Users.email', email).select('Users_Auth.salt AS salt', 'Users_Auth.hash AS hash', 'Users_Auth.user_id AS uid', 'Users.is_banned AS is_banned').limit(1).catch(db_err => { if (db_err) err_code = db_err.code; });
    if (err_code || db_resp.length <= 0) return cb(null, false, { message: 'Misc Login Error' });

    // Check if user is banned
    if (db_resp[0].is_banned === 1) {
      return cb(null, false, { message: 'Incorrect email or password.' });
    }

    crypto.pbkdf2(password, db_resp[0].salt, HASH_ITERATIONS, 32, 'sha256', async function(err, hashed_input) {
      if (err) return cb(null, false, { message: 'Misc Authentication Error' });
      if (db_resp[0].hash !== hashed_input.toString('base64')) return cb(null, false, { message: 'Incorrect email or password.' });

      // Confirmed sign-in
      return cb(null, { 'id': db_resp[0].uid, 'username': email });
    });
  } catch (err) {
    return cb(null, false, {message: "Misc Error"});
  }
}

// Initialize and export Passport
var nativePass = new Passport();

nativePass.use(new LocalStrategy(db_verifyUser));

nativePass.serializeUser(function(user, cb) {
  process.nextTick(function() {
    cb(null, { id: user.id, username: user.username, email: user.username });
  });
});

nativePass.deserializeUser(function(user, cb) {
  process.nextTick(function() {
    return cb(null, { id: user.id, username: user.username, email: user.username });
  });
});

module.exports = nativePass;
