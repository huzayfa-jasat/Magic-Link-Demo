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
  return await http.post(`${MODULE_PREFIX}/${checkType}/add`, { emails, title }, {
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
    params: { page, limit, order, filter, search },
    withCredentials: true,
  });
};
async function handler_removeBatch(checkType, batchId) {
  return await http.delete(`${MODULE_PREFIX}/${checkType}/batch/${batchId}/rm`, {
    withCredentials: true,
  });
};
async function handler_addToBatch(checkType, batchId, emails) {
  return await http.post(`${MODULE_PREFIX}/${checkType}/batch/${batchId}/add`, { emails }, {
    withCredentials: true,
  });
};
async function handler_startBatchProcessing(checkType, batchId) {
  return await http.post(`${MODULE_PREFIX}/${checkType}/batch/${batchId}/start`, {}, {
    withCredentials: true,
  });
};
async function handler_pauseBatchProcessing(checkType, batchId) {
  return await http.patch(`${MODULE_PREFIX}/${checkType}/batch/${batchId}/pause`, {}, {
    withCredentials: true,
  });
};
async function handler_resumeBatchProcessing(checkType, batchId) {
  return await http.patch(`${MODULE_PREFIX}/${checkType}/batch/${batchId}/resume`, {}, {
    withCredentials: true,
  });
};
async function handler_createNewBatch(checkType, emailCount, title) {
  return await http.post(`${MODULE_PREFIX}/${checkType}/new`, { emails: emailCount, title }, {
    withCredentials: true,
  });
};

// End Functions

export async function getBatchesList(page, limit, order, category, status) {
  return await http.get(`${MODULE_PREFIX}/list`, {
    params: { page, limit, order, category, status },
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

export async function addToVerifyBatch(batchId, emails) {
  return await handler_addToBatch('deliverable', batchId, emails);
};
export async function addToCatchallBatch(batchId, emails) {
  return await handler_addToBatch('catchall', batchId, emails);
};

export async function startVerifyBatchProcessing(batchId) {
  return await handler_startBatchProcessing('deliverable', batchId);
};
export async function startCatchallBatchProcessing(batchId) {
  return await handler_startBatchProcessing('catchall', batchId);
};

export async function createNewVerifyBatch(emailCount, title) {
  return await handler_createNewBatch('deliverable', emailCount, title);
};
export async function createNewCatchallBatch(emailCount, title) {
  return await handler_createNewBatch('catchall', emailCount, title);
};

export async function pauseVerifyBatchProcessing(batchId) {
  return await handler_pauseBatchProcessing('deliverable', batchId);
};
export async function pauseCatchallBatchProcessing(batchId) {
  return await handler_pauseBatchProcessing('catchall', batchId);
};

export async function resumeVerifyBatchProcessing(batchId) {
  return await handler_resumeBatchProcessing('deliverable', batchId);
};
export async function resumeCatchallBatchProcessing(batchId) {
  return await handler_resumeBatchProcessing('catchall', batchId);
};

export async function checkDuplicateFilename(filename) {
  return await http.post(`${MODULE_PREFIX}/check-duplicate`, { filename }, {
    withCredentials: true,
  });
};

export async function getBatchProgress(checkType, batchId) {
  return await http.get(`${MODULE_PREFIX}/${checkType}/batch/${batchId}/progress`, {
    withCredentials: true,
  });
};

// S3 Upload Functions
export async function getS3UploadUrl(checkType, batchId, fileName, fileSize, mimeType) {
  return await http.post(`${MODULE_PREFIX}/${checkType}/batch/${batchId}/upload-url`, 
    { fileName, fileSize, mimeType }, 
    { withCredentials: true }
  );
};

export async function completeS3Upload(checkType, batchId, s3Key, columnMapping, fileInfo) {
  return await http.post(`${MODULE_PREFIX}/${checkType}/batch/${batchId}/file-key`, 
    { s3Key, columnMapping, ...fileInfo }, 
    { withCredentials: true }
  );
};

export async function getExportUrls(checkType, batchId) {
  return await http.get(`${MODULE_PREFIX}/${checkType}/batch/${batchId}/exports`, {
    withCredentials: true,
  });
};

export async function getEnrichmentProgress(checkType, batchId) {
  return await http.get(`${MODULE_PREFIX}/${checkType}/batch/${batchId}/export-progress`, {
    withCredentials: true,
  });
};