// Dependencies
const express = require('express');
const emailsRouter = express.Router();

// Middleware
const { checkUserAuth } = require('../auth/funs_perms.js');

// Controller Imports
const {
    verifySingleEmail,
    verifyBulkEmails,
    verifyImportEmails,
    getVerifyRequestDetails,
    listVerifyRequests,
    getPaginatedVerifyRequestResults,
    getPaginatedEmailResults,
} = require('./controller.js');

// Routes
emailsRouter.use(checkUserAuth);
emailsRouter.post('/verify/single', verifySingleEmail);
emailsRouter.post('/verify/bulk', verifyBulkEmails);
emailsRouter.post('/verify/import', verifyImportEmails);
emailsRouter.get('/request/:request_id/dtl', getVerifyRequestDetails);
emailsRouter.get('/requests/list', listVerifyRequests);
emailsRouter.get('/requests/:request_id/results', getPaginatedVerifyRequestResults);
emailsRouter.get('/emails/results', getPaginatedEmailResults);

// Export
module.exports = emailsRouter;