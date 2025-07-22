// Dependencies
const HttpStatus = require('../../types/HttpStatus.js');

// DB Function Imports
const {
    db_getUserCredits,
    db_getBatchStatus,
    db_downloadBatchResults
} = require('./funs_db.js');

// Controller Imports
const {
    createBatch,
} = require('../batches/controller.js');


/**
 * Get user credits
 */
async function getCredits(req, res) {
    try {
        const [ok, credits] = await db_getUserCredits(req.apiUser.user_id);
        if (!ok) return res.status(HttpStatus.FAILED_STATUS).send("Failed to retrieve credits");
        return res.status(HttpStatus.SUCCESS_STATUS).json({ credits });

    } catch (err) {
        console.log("MTE = ", err);
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}

/**
 * Validate emails for valid/invalid status
 */
async function validateEmails(req, res) {
    try {
        // Use existing controller
        return createBatch({
            ...req,
            user: { id: req.apiUser.user_id, },
            params: { checkType: 'deliverable' }
        }, res);

    } catch (err) {
        console.log("MTE = ", err);
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}

/**
 * Validate emails for catchall detection
 */
async function validateCatchall(req, res) {
    try {
        // Use existing controller
        return createBatch({
            ...req,
            user: { id: req.apiUser.user_id, },
            params: { checkType: 'catchall' }
        }, res);

    } catch (err) {
        console.log("MTE = ", err);
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}

async function getDeliverableBatchStatus(req, res) {
    try {
        const { batchId } = req.params;

        // Get batch status
        const [ok, status] = await db_getBatchStatus(batchId, 'deliverable');
        if (!ok) return res.status(HttpStatus.FAILED_STATUS).send("Failed to get batch status");
        return res.status(HttpStatus.SUCCESS_STATUS).json({ status });

    } catch (err) {
        console.log("MTE = ", err);
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}

async function getCatchallBatchStatus(req, res) {
    try {
        const { batchId } = req.params;

        // Get batch status
        const [ok, status] = await db_getBatchStatus(batchId, 'catchall');
        if (!ok) return res.status(HttpStatus.FAILED_STATUS).send("Failed to get batch status");
        return res.status(HttpStatus.SUCCESS_STATUS).json({ status });

    } catch (err) {
        console.log("MTE = ", err);
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}

async function downloadDeliverableBatchResults(req, res) {
    try {
        const { batchId } = req.params;

        // Get batch results
        const [ok, results] = await db_downloadBatchResults(batchId, 'deliverable');
        if (!ok) return res.status(HttpStatus.FAILED_STATUS).send("Failed to get batch results");
        return res.status(HttpStatus.SUCCESS_STATUS).json({ results });

    } catch (err) {
        console.log("MTE = ", err);
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}

async function downloadCatchallBatchResults(req, res) {
    try {
        const { batchId } = req.params;

        // Get batch results
        const [ok, results] = await db_downloadBatchResults(batchId, 'catchall');
        if (!ok) return res.status(HttpStatus.FAILED_STATUS).send("Failed to get batch results");
        return res.status(HttpStatus.SUCCESS_STATUS).json({ results });

    } catch (err) {
        console.log("MTE = ", err);
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}

// Export controllers
module.exports = {
    getCredits,
    validateEmails,
    validateCatchall,
    getDeliverableBatchStatus,
    getCatchallBatchStatus,
    downloadDeliverableBatchResults,
    downloadCatchallBatchResults
}; 