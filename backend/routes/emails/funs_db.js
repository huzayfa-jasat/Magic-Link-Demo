// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);


// -------------------
// CREATE Functions
// -------------------

/**
 * Create a new verification request or update an existing one
 * @param {number} user_id - The user ID
 * @param {string[]} emails - Array of emails to verify
 * @param {number|null} request_id - Optional existing request ID to update
 * @param {string|null} file_name - Optional file name
 * @returns {Promise<[boolean, number]>} - [success, request_id]
 */
async function db_createVerifyRequest(
  user_id,
  emails,
  request_id = null,
  file_name = null
) {
  let err_code;

	// If request_id is provided, verify it exists and belongs to user
	if (request_id !== null) {
		const existing = await knex('Requests')
			.where({
				'request_id': request_id,
				'user_id': user_id,
				'request_status': 'pending'
			})
			.select('request_id', 'num_contacts', 'num_processed')
			.limit(1)
			.catch(err => { if (err) err_code = err.code });
		
		if (err_code || existing.length === 0) {
			return [false, null];
		}

    // Update existing request with new contacts
    const new_total = existing[0].num_contacts + emails.length;
		await knex('Requests')
		.where('request_id', request_id)
      	.update({
				'num_contacts': new_total
      })
		.catch(err => { if (err) err_code = err.code });

    if (err_code) return [false, null];
    return [true, request_id];
  }

  // Create new request
  const db_resp = await knex("Requests")
    .insert({
      user_id: user_id,
      request_type: emails.length === 1 ? "single" : "bulk",
      request_status: "pending",
      num_contacts: emails.length,
      num_processed: 0,
      file_name: file_name,
    })
    .catch((err) => {
      if (err) err_code = err.code;
    });

	// Insert into global table
	await knex('Contacts_Global').insert(emails.map(email => ({
		'email': email
	}))).catch(err => { if (err) err_code = err.code });
	if (err_code) return [false, null];
	
	// Lookup again tog et global ID's
	const global_ids = await knex('Contacts_Global').whereIn('email', emails).select(
		'global_id',
		'email'
	).catch(err => { if (err) err_code = err.code });
	if (err_code) return [false, null];

	// Insert contacts into request_contacts table
	await knex('Requests_Contacts').insert(emails.map(email => ({
		'request_id': db_resp[0],
		'global_id': global_ids.find(id => id.email === email).global_id
	}))).catch(err => { if (err) err_code = err.code });

	if (err_code) return [false, null];
	return [true, db_resp[0]];
}


// -------------------
// READ Functions
// -------------------
async function db_listVerifyRequests(user_id) {
  let err_code;
  const db_resp = await knex("Requests")
    .where({
      user_id: user_id,
      request_status: "pending",
    })
    .select(
      "request_id",
      "request_type",
      "num_contacts",
      "num_processed",
      "file_name"
    )
    .catch((err) => {
      if (err) err_code = err.code;
    });

  if (err_code) return [false, null];

  // Get counts from Requests_Contacts for each request
  for (let request of db_resp) {
    const counts = await knex("Requests_Contacts")
      .join('Contacts_Global', 'Requests_Contacts.global_id', 'Contacts_Global.global_id')
      .where("Requests_Contacts.request_id", request.request_id)
      .select(
        knex.raw("COUNT(*) as num_processed"),
        knex.raw("SUM(Contacts_Global.latest_result = 'valid') as num_valid"),
        knex.raw("SUM(Contacts_Global.latest_result = 'invalid') as num_invalid"),
        knex.raw("SUM(Contacts_Global.latest_result = 'catch-all') as num_catch_all")
      )
      .first();

    request.num_processed = counts.num_processed || 0;
    request.num_valid = counts.num_valid || 0;
    request.num_invalid = counts.num_invalid || 0;
    request.num_catch_all = counts.num_catch_all || 0;
  }

  return [true, db_resp];
}

async function db_getVerifyRequestDetails(user_id, request_id) {
  let err_code;

  // Get request object details
  const db_resp = await knex('Requests')
    .where({
      'user_id': user_id,
      'request_id': request_id,
      'request_status': 'pending'
    })
    .select('request_id', 'request_type', 'num_contacts', 'num_processed', 'file_name')
    .catch(err => { if (err) err_code = err.code });

  if (err_code) return [false, null];
  if (!db_resp[0]) return [false, null];

  // Get counts from Requests_Contacts
  const counts = await knex("Requests_Contacts")
    .join('Contacts_Global', 'Requests_Contacts.global_id', 'Contacts_Global.global_id')
    .where("Requests_Contacts.request_id", request_id)
    .select(
      knex.raw("COUNT(*) as num_processed"),
      knex.raw("SUM(Contacts_Global.latest_result = 'valid') as num_valid"),
      knex.raw("SUM(Contacts_Global.latest_result = 'invalid') as num_invalid"),
      knex.raw("SUM(Contacts_Global.latest_result = 'catch-all') as num_catch_all")
    )
    .first();

  db_resp[0].num_processed = counts.num_processed || 0;
  db_resp[0].num_valid = counts.num_valid || 0;
  db_resp[0].num_invalid = counts.num_invalid || 0;
  db_resp[0].num_catch_all = counts.num_catch_all || 0;

  return [true, db_resp[0]];
}

async function db_getPaginatedVerifyRequestResults(
  user_id,
  request_id,
  page,
  per_page,
  search = null
) {
  let err_code;

	// Ensure request ID is associated with user
	const perms_resp = await knex('Requests').where({
		'user_id': user_id,
		'request_id': request_id,
	}).select('request_id').catch(err => { if (err) err_code = err.code });
	if (err_code) console.log("err 1 = ", err_code);
	if (err_code || perms_resp.length <= 0) return [false, err_code];

  // Build query for contacts & statuses from request, joining with Contacts_Global for latest_result
  let query = knex("Requests_Contacts")
    .join(
      "Contacts_Global",
      "Requests_Contacts.global_id",
      "Contacts_Global.global_id"
    )
    .where("Requests_Contacts.request_id", request_id);

  // Add search filter if provided
  if (search && search.trim()) {
    query = query.where("Contacts_Global.email", "like", `%${search.trim()}%`);
  }

  const db_resp = await query
    .select(
      "Requests_Contacts.global_id",
      "Requests_Contacts.processed_ts",
      "Contacts_Global.latest_result as result",
      "Contacts_Global.email",
      "Contacts_Global.last_mail_server as mail_server"
    )
    .orderBy("Requests_Contacts.processed_ts", "asc")
    .limit(per_page)
    .offset((page - 1) * per_page)
    .catch((err) => {
      if (err) err_code = err.code;
    });

	if (err_code) console.log("err 2 = ", err_code);
	if (err_code) return [false, err_code];
	return [true, db_resp];
}

async function db_getPaginatedEmailResults(user_id, page, per_page) {
	let err_code;

	// Get paginated email results by joining Requests_Contacts with Contacts_Global
	const db_resp = await knex('Requests_Contacts')
		.join('Requests', 'Requests_Contacts.request_id', 'Requests.request_id')
		.join('Contacts_Global', 'Requests_Contacts.global_id', 'Contacts_Global.global_id')
		.where('Requests.user_id', user_id)
		.select(
			'Contacts_Global.email',
			'Contacts_Global.latest_result as result',
			'Contacts_Global.last_mail_server as mail_server',
			'Requests_Contacts.processed_ts'
		)
		.orderBy('Requests_Contacts.processed_ts', 'desc')
		.limit(per_page)
		.offset((page - 1) * per_page)
		.catch(err => { if (err) err_code = err.code });

	if (err_code) return [false, null];
	return [true, db_resp];
}

async function db_exportBatchResultsCsv(user_id, request_id, filter, page, per_page) {
	let err_code;
	const offset = (page - 1) * per_page;
	let query = knex('Requests_Contacts as rc')
		.join('Contacts_Global as cg', 'rc.global_id', 'cg.global_id')
		.join('Requests as r', 'rc.request_id', 'r.request_id')
		.where('rc.request_id', request_id)
		.andWhere('r.user_id', user_id)
		.select(
			'cg.email',
			'cg.latest_result as result',
			'cg.last_mail_server as mail_server',
			'rc.processed_ts'
		)
		.offset(offset)
		.limit(per_page)
		.orderBy('rc.processed_ts', 'asc');

	if (filter && filter !== 'all') {
		query = query.andWhere('cg.latest_result', filter);
	}

	const db_resp = await query.catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];
	return [true, db_resp];
}


// -------------------
// UPDATE Functions
// -------------------



// -------------------
// DELETE Functions
// -------------------



// ----- Export -----
module.exports = {
	db_createVerifyRequest,
	db_listVerifyRequests,
	db_getVerifyRequestDetails,
	db_getPaginatedVerifyRequestResults,
	db_getPaginatedEmailResults,
	db_exportBatchResultsCsv,
};