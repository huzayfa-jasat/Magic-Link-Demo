# Bouncer Email Verification Queue System

This directory contains the complete implementation of the Bouncer email verification queue system using BullMQ. The system handles batch processing of email verification with proper rate limiting, error handling, and monitoring.

## Architecture Overview

The system consists of several key components:

- **Email Verification Processor**: Handles batch creation and retry logic
- **Queue Manager**: Orchestrates all queue operations and monitoring
- **Rate Limiter**: Ensures API rate limits are respected
- **Bouncer API Service**: Handles communication with the Bouncer API
- **Database Utils**: Manages database operations and transactions

## Files Structure

```
queues/
├── processors/
│   └── email-verification-processor.js  # Main email verification worker
├── queue-config.js                      # Queue configuration and setup
├── queue-manager.js                     # Queue orchestration and management
├── start-workers.js                     # Worker startup script
├── example-usage.js                     # Usage examples
└── README.md                            # This file

services/
├── rate-limiter.js                      # Rate limiting service
├── bouncer-api.js                       # Bouncer API integration
└── database-utils.js                    # Database operations
```

## Features

### Email Verification Processing
- **Batch Creation**: Processes up to 10,000 emails per batch
- **Concurrent Processing**: Handles up to 15 concurrent batches
- **Rate Limiting**: Respects 200 requests/minute limit with 180 request buffer
- **Retry Logic**: Automatic retry for failed batches with exponential backoff
- **Error Handling**: Comprehensive error classification and handling

### Queue Management
- **5 Concurrent Workers**: Processes multiple jobs simultaneously
- **Priority System**: Critical, High, Normal, Low priority levels
- **Job Scheduling**: Automatic scheduling of status checks and downloads
- **Dead Letter Queue**: Handles permanently failed jobs
- **Graceful Shutdown**: Proper cleanup on application termination

### Monitoring and Health
- **Real-time Statistics**: Queue status and job counts
- **Health Checks**: Continuous monitoring of system health
- **Alerting**: Warnings for concerning queue conditions
- **Metrics Storage**: Historical health metrics

## Installation

1. Ensure Redis is running and accessible
2. Install required dependencies (should already be installed):
   ```bash
   npm install bullmq ioredis
   ```

3. Set up environment variables:
   ```bash
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=your_redis_password
   BOUNCER_API_KEY=your_bouncer_api_key
   BOUNCER_API_BASE_URL=https://api.usebouncer.com/v1.1
   MAX_CONCURRENT_BATCHES=15
   BATCH_SIZE=10000
   ```

## Usage

### Starting the Queue Workers

```bash
node queues/start-workers.js
```

This starts all queue workers and monitoring systems.

### Adding Emails to Queue

```javascript
const { queueManager } = require('./queues/queue-manager');

// Start the queue manager
await queueManager.start();

// Add emails for verification
const emails = [
    { email: 'user@example.com', name: 'User Name' },
    { email: 'another@test.com', name: 'Another User' }
];

const result = await queueManager.addEmailsToQueue(emails, userId, requestId, {
    priority: 'NORMAL',
    delay: 0
});

console.log(`Added ${result.totalEmails} emails in ${result.batchCount} batches`);
```

### Monitoring Queue Status

```javascript
// Get current queue statistics
const stats = await queueManager.getQueueStats();
console.table(stats);

// Get system health status
const health = await queueManager.getHealthStatus();
console.log('System Health:', health);
```

### Queue Operations

```javascript
// Pause a queue
await queueManager.pauseQueue('email-verification');

// Resume a queue
await queueManager.resumeQueue('email-verification');

// Retry failed jobs
const retriedCount = await queueManager.retryFailedJobs('email-verification');

// Clean old failed jobs
const cleanedCount = await queueManager.cleanFailedJobs('email-verification', 24);
```

## Queue Types

### Email Verification Queue (`email-verification`)
- **Purpose**: Handles batch creation and retry operations
- **Concurrency**: 5 workers
- **Rate Limit**: 10 jobs per minute
- **Job Types**: `create-batch`, `retry-failed-batch`

### Batch Status Queue (`batch-status-check`)
- **Purpose**: Monitors batch processing status
- **Concurrency**: 10 workers
- **Rate Limit**: 50 jobs per minute
- **Job Types**: `check-batch-status`

### Batch Download Queue (`batch-download`)
- **Purpose**: Downloads completed batch results
- **Concurrency**: 3 workers
- **Rate Limit**: 20 jobs per minute
- **Job Types**: `download-batch-results`

### Cleanup Queue (`cleanup-tasks`)
- **Purpose**: Housekeeping and health monitoring
- **Concurrency**: 1 worker
- **Job Types**: `cleanup-rate-limits`, `health-check`

## Rate Limiting

The system implements sophisticated rate limiting to respect Bouncer API limits:

- **Window**: 60-second sliding window
- **Limit**: 180 requests per minute (20 request buffer)
- **Tracking**: Database-backed request tracking
- **Deferral**: Automatic job rescheduling when limits are hit
- **Cleanup**: Automatic cleanup of old rate limit records

## Error Handling

The system classifies and handles different types of errors:

- **Rate Limit (429)**: Automatic deferral and retry
- **Payment Required (402)**: Move to dead letter queue
- **API Errors (5xx)**: Exponential backoff retry
- **Network Errors**: Retry with exponential backoff
- **Permanent Failures (4xx)**: No retry, immediate failure

## Database Integration

The system integrates with the following database tables:

- `Bouncer_Batches`: Batch tracking and status
- `Bouncer_Queue`: Email queue management
- `Bouncer_Rate_Limit`: Rate limiting tracking
- `Bouncer_Results`: Detailed verification results
- `Bouncer_Dead_Letter_Queue`: Failed job tracking
- `Bouncer_Health_Metrics`: System health monitoring

## Monitoring

### Queue Statistics
- Waiting jobs count
- Active jobs count
- Completed jobs count
- Failed jobs count

### Health Metrics
- Redis connectivity
- Database connectivity
- Bouncer API availability
- Rate limit utilization
- Memory usage
- System uptime

### Alerting Thresholds
- Queue backlog > 1000 items
- Failed jobs > 50
- Rate limit utilization > 90%
- Memory usage alerts

## Production Considerations

### Scaling
- Multiple worker instances can be run simultaneously
- Redis clustering for high availability
- Database read replicas for monitoring queries

### Security
- API key rotation support
- Redis password authentication
- Database connection encryption
- Error message sanitization

### Performance
- Batch optimization for better API performance
- Connection pooling for database operations
- Memory usage monitoring and optimization
- Efficient job serialization

## Troubleshooting

### Common Issues

1. **Redis Connection Issues**
   - Check Redis server status
   - Verify connection parameters
   - Check firewall settings

2. **High Memory Usage**
   - Adjust removeOnComplete/removeOnFail settings
   - Monitor job payload sizes
   - Consider Redis memory limits

3. **Rate Limit Errors**
   - Verify API key validity
   - Check rate limit configuration
   - Monitor API usage patterns

4. **Database Connection Issues**
   - Check database server status
   - Verify connection pool settings
   - Monitor connection counts

### Debugging

Enable debug logging:
```bash
DEBUG=bull* node queues/start-workers.js
```

Check queue status:
```bash
node -e "
const { queueManager } = require('./queues/queue-manager');
queueManager.getQueueStats().then(console.table);
"
```

## Example Output

```
Bouncer Email Verification Queue Workers
==================================================
Configuration:
  Environment: development
  Redis Host: localhost
  Redis Port: 6379
  Bouncer API URL: https://api.usebouncer.com/v1.1
  Max Concurrent Batches: 15
  Batch Size: 10000

✓ Queue workers started successfully
✓ Email verification processor is running with 5 concurrent workers
✓ Rate limiting is active (180 requests/minute)
✓ Health monitoring is active

Queue workers are now processing jobs...
Press Ctrl+C to stop gracefully
```

## Support

For issues or questions regarding the queue system:

1. Check the logs for error messages
2. Verify environment configuration
3. Monitor queue statistics
4. Review API rate limits
5. Check database connectivity

The system is designed to be robust and self-healing, with comprehensive error handling and monitoring to ensure reliable email verification processing.