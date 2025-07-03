# Notes

## API AUTH Basics

Just using API key, adding 'x-api-key' in header. For example:
```bash
curl https://api.usebouncer.com/v1.1/email/verify?email=john@usebouncer.com \
  -H 'x-api-key: API-KEY'
```

## API BATCH Basics

This is copied direct from their API docs. It is PSEUDOCODE

```
// psuedocode
while(true) {

  // check status of active batches (created and not completed)
  var batchesActive = getActiveBatches();

  // create batches
  if (batchesActive.size() < 10) {
    // create batch if needed
    var emailsToVerify = prepareBatchOfEmailsToVerify();
    if (emailsToVerify.size() > 0) {
      try {
        var batchStatus = bouncer.batchCreate(emailToVerify);
        storeBatchInformation(batchStatus.batchId, 'active');
      } catch(error) {
        // handle special cases (payment required, rate limit, 5XX errors)
      }
    }
  }

  // check status and download results
  batchesActive.forEach(batch => {
    var batchStatus = bouncer.batchStatus(batch.batchId);
    if (batchStatus.status === 'completed') {
      // download results
      var batchResults = bouncer.batchResults(batch.batchId);
      storeBatchResults(batch.batchId, batchResults);
      storeBatchInformation(batch.batchId, 'done')
    }
  });

  sleepSeconds(10);
}
```


## API Patterns
- ALWAYS use batch endpoints

Upload flow:
- Upload batch
- Check status periodically
- If complete, "download" results


## Implementation Notes

We MUST create a managed queue (maybe BullMQ) such that:
- We are only having 10-20 maximum batches processed simultaneously by Bouncer
- Each batch is 10,000 emails at a time

This queue must:
- Persist between re

## Rate Limits

200 requests (upload & request status & download, combined) per minute
- Manage proper rate limits, given a max of 20 concurrent batches


## Optimizations (V2)

1. More sophisticated queue matching.

Bouncer likes non-homogenous lists. For example, if there are many email addresses from the same domain, and they are all undeliverable, Batcher will slow down (to protect itself against burning too many resources checking undeliverable addresses).

So ideally you can implement kind of some parallel processing on your end and you can manage that and you're like funneling that, you're taking the request from your customers, you're kind of taking portions of each of your customers lists, divide it into, well, put it in the batch of 10,000, send to Bouncer, send another 10,000, send another 10,000 and then you're keeping the whole flow going, right?


2. Running Multiple Layers of Checks

Probably, initially, running non-deep catch-all verification. And then, you can take the risky ones, and run it through the deep catch-all afterwards.