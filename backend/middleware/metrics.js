const { metrics } = require('../config/redis');
const client = require('prom-client');

// Create a Registry
const register = new client.Registry();

// Define metrics
const httpRequestDurationMicroseconds = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

const magicLinkRequestsTotal = new client.Counter({
    name: 'magic_link_requests_total',
    help: 'Total number of magic link requests'
});

const magicLinkVerificationAttemptsTotal = new client.Counter({
    name: 'magic_link_verification_attempts_total',
    help: 'Total number of magic link verification attempts'
});

const magicLinkVerificationFailuresTotal = new client.Counter({
    name: 'magic_link_verification_failures_total',
    help: 'Total number of magic link verification failures'
});

const magicLinkDeliveryFailuresTotal = new client.Counter({
    name: 'magic_link_delivery_failures_total',
    help: 'Total number of magic link delivery failures'
});

const magicLinkDeliveredTotal = new client.Counter({
    name: 'magic_link_delivered_total',
    help: 'Total number of magic links successfully delivered'
});

const magicLinkClickedTotal = new client.Counter({
    name: 'magic_link_clicked_total',
    help: 'Total number of magic links clicked'
});

const magicLinkVerifiedTotal = new client.Counter({
    name: 'magic_link_verified_total',
    help: 'Total number of magic links successfully verified'
});

// Success rate metrics
const magicLinkSuccessRate = new client.Gauge({
    name: 'magic_link_success_rate',
    help: 'Magic link verification success rate (0-1)'
});

// Email delivery latency
const emailDeliveryLatency = new client.Histogram({
    name: 'email_delivery_latency_seconds',
    help: 'Email delivery latency in seconds',
    labelNames: ['provider'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
});

// Register metrics
register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(magicLinkRequestsTotal);
register.registerMetric(magicLinkVerificationAttemptsTotal);
register.registerMetric(magicLinkVerificationFailuresTotal);
register.registerMetric(magicLinkDeliveryFailuresTotal);
register.registerMetric(magicLinkDeliveredTotal);
register.registerMetric(magicLinkClickedTotal);
register.registerMetric(magicLinkVerifiedTotal);
register.registerMetric(magicLinkSuccessRate);
register.registerMetric(emailDeliveryLatency);

// Middleware to track request duration
function metricsMiddleware(req, res, next) {
    const start = Date.now();
    
    // Record end time and duration on response finish
    res.on('finish', () => {
        const duration = Date.now() - start;
        httpRequestDurationMicroseconds
            .labels(req.method, req.route?.path || req.path, res.statusCode)
            .observe(duration / 1000); // Convert to seconds
    });

    next();
}

// Metrics endpoint
function metricsEndpoint(req, res) {
    res.set('Content-Type', register.contentType);
    register.metrics().then(data => res.send(data));
}

// Success rate calculation function
function calculateSuccessRate() {
    try {
        const attemptsData = magicLinkVerificationAttemptsTotal.get();
        const failuresData = magicLinkVerificationFailuresTotal.get();
        
        const attempts = attemptsData.values && attemptsData.values[0] ? attemptsData.values[0].value : 0;
        const failures = failuresData.values && failuresData.values[0] ? failuresData.values[0].value : 0;
        
        const successes = attempts - failures;
        const rate = attempts > 0 ? successes / attempts : 1;
        magicLinkSuccessRate.set(rate);
        return rate;
    } catch (error) {
        console.error('Error calculating success rate:', error);
        magicLinkSuccessRate.set(1); // Default to 100% if calculation fails
        return 1;
    }
}

// Update success rate every 30 seconds
setInterval(calculateSuccessRate, 30000);

module.exports = {
    metricsMiddleware,
    metricsEndpoint,
    metrics: {
        magicLinkRequestsTotal,
        magicLinkVerificationAttemptsTotal,
        magicLinkVerificationFailuresTotal,
        magicLinkDeliveryFailuresTotal,
        magicLinkDeliveredTotal,
        magicLinkClickedTotal,
        magicLinkVerifiedTotal,
        magicLinkSuccessRate,
        emailDeliveryLatency
    }
}; 