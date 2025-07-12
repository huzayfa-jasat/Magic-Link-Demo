# API Docs

## Create batch request

https://api.usebouncer.com/v1.1/email/verify/batch

```js
const options = {
  method: 'POST',
  headers: {'x-api-key': '<api-key>', 'Content-Type': 'application/json'},
  body: '[{"email":"john@usebouncer.com"},{"email":"jenny@usebouncer.com"}]'
};

fetch('https://api.usebouncer.com/v1.1/email/verify/batch', options)
  .then(response => response.json())
  .then(response => console.log(response))
  .catch(err => console.error(err));
```

200 Response:
```json
{
  "batchId": "4d5fdf6b5ee97c4dbbccbfe1",
  "created": "2023-03-26T18:08:15.033Z",
  "status": "queued",
  "quantity": 2,
  "duplicates": 0
}
```

#### Integration flow

There are 2 ways to integrate with batch, using status endpoint or using callback parameter.

##### Using Status Endpoint

Pseudocode:
```
Client->>Bouncer: POST /v1.1/email/verify/batch

loop every 10-30s until status == 'completed'
    Client->>Bouncer: GET /v1.1/email/verify/batch/<ID>
end

Client->>Bouncer: GET
/v1.1/email/verify/batch/<ID>/download?download=all
```

##### Using Callbacks

Pseudocode:
```
Client->>Bouncer: POST /v1.1/email/verify/batch?callback=<YOUR-URL>

Bouncer->>Client: POST <YOUR-URL>

Client->>Bouncer: GET
/v1.1/email/verify/batch/<ID>/download?download=all
```


## Get batch results

https://api.usebouncer.com/v1.1/email/verify/batch/{batchId}/download

```js
const options = {method: 'GET', headers: {'x-api-key': '<api-key>'}};

fetch('https://api.usebouncer.com/v1.1/email/verify/batch/{batchId}/download', options)
  .then(response => response.json())
  .then(response => console.log(response))
  .catch(err => console.error(err));
```

200 response:
```json
[
  {
    "email": "john@usebouncer.com",
    "status": "deliverable",
    "reason": "accepted_email",
    "domain": {
      "name": "usebouncer.com",
      "acceptAll": "no",
      "disposable": "no",
      "free": "no"
    },
    "account": {
      "role": "no",
      "disabled": "no",
      "fullMailbox": "no"
    },
    "dns": {
      "type": "MX",
      "record": "aspmx.l.google.com."
    },
    "provider": "google.com",
    "score": 100,
    "toxic": "unknown",
    "toxicity": 0
  },
  {
    "email": "jane@usebouncer.com",
    "status": "deliverable",
    "reason": "accepted_email",
    "domain": {
      "name": "usebouncer.com",
      "acceptAll": "no",
      "disposable": "no",
      "free": "no"
    },
    "account": {
      "role": "no",
      "disabled": "no",
      "fullMailbox": "no"
    },
    "dns": {
      "type": "MX",
      "record": "aspmx.l.google.com."
    },
    "provider": "google.com",
    "score": 100,
    "toxic": "unknown",
    "toxicity": 0
  },
  // ...
]
```