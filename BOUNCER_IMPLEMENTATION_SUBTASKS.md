# Bouncer Implementation Subtasks

This document lists all subtasks required to implement the Bouncer email verification system. Each subtask is mutually exclusive (operates on separate files) and collectively exhaustive (completing all subtasks completes the implementation).

## Database Schema Tasks

### Task 1: Database Schema Creation
**File:** `db/bouncer_schema.sql`
**Description:** Create all new database tables for Bouncer integration
**Deliverable:** SQL file with CREATE TABLE statements for:
- Bouncer_Batches
- Bouncer_Queue
- Bouncer_Rate_Limit
- Bouncer_Results
- Bouncer_Dead_Letter_Queue
- Bouncer_Health_Metrics

### Task 2: Database Migration Script
**File:** `db/migrations/add_bouncer_tables.sql`
**Description:** Create migration script to add Bouncer tables to existing database
**Deliverable:** Migration SQL with proper DROP IF EXISTS and CREATE statements

## Core API Integration Tasks

### Task 3: Bouncer API Client
**File:** `backend/services/bouncer-api.js`
**Description:** Create Bouncer API client with all required endpoints
**Deliverable:** Module with functions for:
- createBatch(emails)
- getBatchStatus(batchId)
- downloadBatchResults(batchId)
- API authentication and error handling

### Task 4: Rate Limiter Service
**File:** `backend/services/rate-limiter.js`
**Description:** Implement rate limiting service for API calls
**Deliverable:** RateLimiter class with methods:
- canMakeApiCall()
- recordApiCall()
- getNextAvailableTime()
- cleanupOldRecords()

### Task 5: Circuit Breaker Service
**File:** `backend/services/circuit-breaker.js`
**Description:** Implement circuit breaker pattern for API reliability
**Deliverable:** CircuitBreaker class with:
- executeApiCall()
- onSuccess/onFailure handling
- State management (OPEN/CLOSED/HALF_OPEN)

## Queue Management Tasks

### Task 6: BullMQ Queue Configuration
**File:** `backend/queues/queue-config.js`
**Description:** Configure all BullMQ queues and Redis connection
**Deliverable:** Module exporting:
- Queue instances for all 4 queues
- Queue schedulers
- Redis connection configuration
- Job type constants and priorities

### Task 7: Email Verification Queue Processor
**File:** `backend/queues/processors/email-verification-processor.js`
**Description:** Process email verification jobs (batch creation, retries)
**Deliverable:** Worker implementation for:
- CREATE_BATCH job processing
- RETRY_FAILED_BATCH job processing
- Batch creation logic with rate limiting
- Queue scheduling for status checks

### Task 8: Batch Status Queue Processor
**File:** `backend/queues/processors/batch-status-processor.js`
**Description:** Process batch status checking jobs
**Deliverable:** Worker implementation for:
- CHECK_BATCH_STATUS job processing
- Status monitoring logic
- Download job scheduling when complete
- Retry scheduling for in-progress batches

### Task 9: Batch Download Queue Processor
**File:** `backend/queues/processors/batch-download-processor.js`
**Description:** Process batch result download jobs
**Deliverable:** Worker implementation for:
- DOWNLOAD_BATCH_RESULTS job processing
- Result processing and database storage
- Transaction handling for result updates

### Task 10: Cleanup Queue Processor
**File:** `backend/queues/processors/cleanup-processor.js`
**Description:** Process cleanup and maintenance jobs
**Deliverable:** Worker implementation for:
- CLEANUP_RATE_LIMITS job processing
- HEALTH_CHECK job processing
- Scheduled recurring jobs setup

## Data Access Layer Tasks

### Task 11: Bouncer Database Service
**File:** `backend/services/bouncer-db.js`
**Description:** Database operations for Bouncer-related tables
**Deliverable:** Service with methods for:
- Batch CRUD operations
- Queue item management
- Rate limit record management
- Result storage and retrieval
- Dead letter queue operations

### Task 12: Email Queue Service
**File:** `backend/services/email-queue.js`
**Description:** High-level email queue management service
**Deliverable:** Service with methods for:
- addEmailsToQueue()
- getQueuedEmails()
- optimizeBatchComposition()
- updateContactResults()
- getActiveBatchCount()

## Error Handling Tasks

### Task 13: Error Handler Service
**File:** `backend/services/error-handler.js`
**Description:** Centralized error handling for all Bouncer operations
**Deliverable:** ErrorHandler class with:
- classifyError()
- handleBatchError()
- handleRateLimitError()
- handlePaymentError()
- handlePermanentFailure()
- scheduleRetry()

### Task 14: Dead Letter Queue Service
**File:** `backend/services/dead-letter-queue.js`
**Description:** Handle permanently failed items
**Deliverable:** Service with methods for:
- logToDeadLetterQueue()
- getFailedItems()
- retryFailedItems()
- markItemsAsReviewed()

## Monitoring and Management Tasks

### Task 15: Queue Monitor Service
**File:** `backend/services/queue-monitor.js`
**Description:** Queue monitoring and management functionality
**Deliverable:** QueueMonitor class with:
- getQueueStats()
- pauseQueue()
- resumeQueue()
- retryFailedJobs()
- getQueueHealth()

### Task 16: Health Check Service
**File:** `backend/services/health-check.js`
**Description:** System health monitoring
**Deliverable:** Service with methods for:
- performHealthCheck()
- checkRedisHealth()
- checkDatabaseHealth()
- checkBouncerApiHealth()
- storeHealthMetrics()

## Integration Tasks

### Task 17: Queue Manager Main Service
**File:** `backend/services/queue-manager.js`
**Description:** Main orchestration service that ties everything together
**Deliverable:** QueueManager class with:
- initializeQueues()
- startWorkers()
- stopWorkers()
- addEmailVerificationRequest()
- getProcessingStatus()

### Task 18: API Route Integration
**File:** `backend/routes/bouncer-routes.js`
**Description:** Express routes for Bouncer functionality
**Deliverable:** Routes for:
- POST /api/bouncer/verify-emails
- GET /api/bouncer/status/:requestId
- GET /api/bouncer/results/:requestId
- GET /api/bouncer/queue-stats
- POST /api/bouncer/retry-failed

### Task 19: Startup Script
**File:** `backend/scripts/start-bouncer-workers.js`
**Description:** Script to start all Bouncer workers and queues
**Deliverable:** Standalone script that:
- Initializes Redis connection
- Starts all queue workers
- Sets up graceful shutdown handlers
- Configures process management

## Configuration Tasks

### Task 20: Environment Configuration
**File:** `backend/config/bouncer-config.js`
**Description:** Configuration management for Bouncer service
**Deliverable:** Configuration module with:
- Environment variable definitions
- Default values
- Validation
- Export of all Bouncer-related config

### Task 21: Package Dependencies
**File:** `package.json` (update existing)
**Description:** Add required npm dependencies
**Deliverable:** Updated package.json with:
- bullmq
- ioredis
- Additional dependencies as needed

## Optimization Tasks

### Task 22: Batch Optimization Service
**File:** `backend/services/batch-optimizer.js`
**Description:** Implement V2 batch composition optimization
**Deliverable:** Service with methods for:
- optimizeBatchComposition()
- groupByDomain()
- distributeNonHomogeneously()
- calculateOptimizationMetrics()

### Task 23: Multi-Layer Verification Service
**File:** `backend/services/multi-layer-verification.js`
**Description:** Implement multi-layer verification strategy
**Deliverable:** Service with methods for:
- processBasicVerification()
- processDeepVerification()
- identifyRiskyEmails()
- processMultiLayerVerification()

---

## Task Dependencies

While tasks are designed to be mutually exclusive, some logical dependencies exist:

- **Database tasks (1-2)** should be completed before data access tasks (11-12)
- **Queue configuration (6)** should be completed before processor tasks (7-10)
- **Core services (3-5)** should be completed before integration tasks (17-19)

However, all tasks can be developed in parallel as they operate on separate files and can use placeholder implementations where needed.

## Completion Criteria

All subtasks are complete when:
1. All 23 files are created with fully functional implementations
2. All dependencies are added to package.json
3. Database schema is ready for deployment
4. All services integrate properly with the queue system
5. Error handling covers all specified scenarios
6. Monitoring and health checks are operational

This represents a complete, production-ready Bouncer email verification system with robust queue management.