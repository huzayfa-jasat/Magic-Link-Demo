// Dependencies
import { http } from "./http";

// Constants
const MODULE_PREFIX = "/batches";

/*
------------------------
> BATCHES API CALLS <
------------------------
*/

// Handlers

async function handler_createBatch(checkType, emails, title) {
  return await http.post(`${MODULE_PREFIX}/${checkType}/new`, { emails, title }, {
    withCredentials: true,
  });
};
async function handler_getBatchDetails(checkType, batchId) {
  return await http.get(`${MODULE_PREFIX}/${checkType}/batch/${batchId}/details`, {
    withCredentials: true,
  });
};
async function handler_getBatchResults(checkType, batchId, page, limit, order, filter, search) {
  return await http.get(`${MODULE_PREFIX}/${checkType}/batch/${batchId}/results`, {
    query: { page, limit, order, filter, search },
    withCredentials: true,
  });
};
async function handler_removeBatch(checkType, batchId) {
  return await http.delete(`${MODULE_PREFIX}/${checkType}/batch/${batchId}/rm`, {
    withCredentials: true,
  });
};

// End Functions

export async function getBatchesList(page, limit, order, category, status) {
  return await http.get(`${MODULE_PREFIX}/list`, {
    query: { page, limit, order, category, status },
    withCredentials: true,
  });
};

export async function createVerifyBatch(emails, title) {
  return await handler_createBatch('deliverable', emails, title);
};
export async function createCatchallBatch(emails, title) {
  return await handler_createBatch('catchall', emails, title);
};

export async function getVerifyBatchDetails(batchId) {
  return await handler_getBatchDetails('deliverable', batchId);
};
export async function getCatchallBatchDetails(batchId) {
  return await handler_getBatchDetails('catchall', batchId);
};

export async function getVerifyBatchResults(batchId, page, limit, order, filter, search) {
  return await handler_getBatchResults('deliverable', batchId, page, limit, order, filter, search);
};
export async function getCatchallBatchResults(batchId, page, limit, order, filter, search) {
  return await handler_getBatchResults('catchall', batchId, page, limit, order, filter, search);
};

export async function removeVerifyBatch(batchId) {
  return await handler_removeBatch('deliverable', batchId);
};
export async function removeCatchallBatch(batchId) {
  return await handler_removeBatch('catchall', batchId);
};