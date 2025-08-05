# Subscription Implementation Plan

## Overview
This document outlines the implementation of a subscription system with non-rolling monthly credits on top of the existing one-off credit purchase system.

### Key Requirements
- Credits do NOT roll over month-to-month
- Subscription credits expire at the end of each billing period
- Webhook-driven credit allocation (wait for Stripe renewal events)
- Subscription credits are used first, then one-off credits
- Full backwards compatibility with existing one-off purchases

## Phase 1: Database Schema

### Create Core Subscription Tables

```sql
-- 1. Subscription plans catalog
CREATE TABLE Subscription_Plans (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stripe_product_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_price_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    display_price VARCHAR(50) NOT NULL,
    regular_credits_per_period INT NOT NULL DEFAULT 0,
    catchall_credits_per_period INT NOT NULL DEFAULT 0,
    billing_period ENUM('monthly', 'yearly') NOT NULL DEFAULT 'monthly',
    is_active BOOLEAN DEFAULT 1,
    is_live BOOLEAN DEFAULT 0,
    display_order INT DEFAULT 0,
    features JSON, -- For future use (feature list display)
    created_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_active_live (is_active, is_live)
);

-- 2. User's active subscription record
CREATE TABLE User_Subscriptions (
    user_id INT PRIMARY KEY,
    subscription_plan_id INT NOT NULL,
    stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_customer_id VARCHAR(255) NOT NULL,
    status ENUM('active', 'canceled', 'past_due', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid') NOT NULL,
    current_period_start TIMESTAMP NOT NULL,
    current_period_end TIMESTAMP NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT 0,
    canceled_at TIMESTAMP NULL,
    created_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id),
    FOREIGN KEY (subscription_plan_id) REFERENCES Subscription_Plans(id),
    INDEX idx_stripe_sub_id (stripe_subscription_id),
    INDEX idx_status (status)
);

-- 3. Active subscription credits (non-rolling)
CREATE TABLE User_Deliverable_Sub_Credits (
    user_id INT PRIMARY KEY,
    credits_start INT NOT NULL,
    credits_left INT NOT NULL,
    expiry_ts TIMESTAMP NOT NULL,
    created_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id),
    CHECK (credits_left >= 0),
    CHECK (credits_left <= credits_start),
    INDEX idx_expiry (expiry_ts)
);

CREATE TABLE User_Catchall_Sub_Credits (
    user_id INT PRIMARY KEY,
    credits_start INT NOT NULL,
    credits_left INT NOT NULL,
    expiry_ts TIMESTAMP NOT NULL,
    created_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id),
    CHECK (credits_left >= 0),
    CHECK (credits_left <= credits_start),
    INDEX idx_expiry (expiry_ts)
);
```

### Seed Initial Subscription Plans

```sql
-- Development/Test Plans
INSERT INTO Subscription_Plans 
(stripe_product_id, stripe_price_id, name, display_price, regular_credits_per_period, catchall_credits_per_period, billing_period, is_active, is_live, display_order)
VALUES
('prod_test_basic', 'price_test_basic', 'Basic Monthly', '$29/month', 50000, 5000, 'monthly', 1, 0, 1),
('prod_test_pro', 'price_test_pro', 'Pro Monthly', '$99/month', 200000, 20000, 'monthly', 1, 0, 2),
('prod_test_enterprise', 'price_test_enterprise', 'Enterprise Monthly', '$299/month', 1000000, 100000, 'monthly', 1, 0, 3);

-- Production plans will be added after Stripe product creation
```

## Phase 2: Backend Subscription Routes

### Directory Structure
```
/backend/routes/subscriptions/
├── controller.js    # Main route definitions
├── funs_db.js      # Database functions
├── funs_stripe.js  # Stripe API functions
└── validators.js   # Input validation
```

### API Endpoints

#### GET /api/subscriptions/list
Returns available subscription plans filtered by environment (is_live flag).

**Response:**
```json
{
  "plans": [
    {
      "id": 1,
      "name": "Basic Monthly",
      "display_price": "$29/month",
      "regular_credits_per_period": 50000,
      "catchall_credits_per_period": 5000,
      "billing_period": "monthly"
    }
  ],
  "current_subscription": {
    "plan_id": 1,
    "status": "active",
    "cancel_at_period_end": false
  }
}
```

#### POST /api/subscriptions/checkout
Creates a Stripe subscription checkout session.

**Request:**
```json
{
  "plan_id": 1
}
```

**Validation:**
- User doesn't have an active subscription
- Plan exists and is_active

**Response:**
```json
{
  "checkout_url": "https://checkout.stripe.com/..."
}
```

#### GET /api/subscriptions/status
Returns comprehensive subscription status including credit balances.

**Response:**
```json
{
  "has_subscription": true,
  "subscription": {
    "plan_name": "Pro Monthly",
    "status": "active",
    "current_period_end": "2024-03-15T00:00:00Z",
    "cancel_at_period_end": false,
    "credits": {
      "regular": {
        "start": 200000,
        "remaining": 150000,
        "expires_at": "2024-03-15T00:00:00Z"
      },
      "catchall": {
        "start": 20000,
        "remaining": 18000,
        "expires_at": "2024-03-15T00:00:00Z"
      }
    }
  }
}
```

#### POST /api/subscriptions/manage
Creates a Stripe billing portal session for subscription management.

**Response:**
```json
{
  "portal_url": "https://billing.stripe.com/..."
}
```

## Phase 3: Stripe Webhook Updates

### New Webhook Events to Handle

#### customer.subscription.created
Initial subscription creation.
```javascript
// Actions:
1. Create User_Subscriptions record
2. Initial credit allocation using current_period_end
```

#### invoice.payment_succeeded
**CRITICAL**: This is where monthly credit renewal happens.
```javascript
// Actions:
1. Get subscription details from event
2. UPSERT new credits with expiry_ts = event.data.lines.data[0].period.end
3. Update User_Subscriptions.current_period_end
```

#### customer.subscription.updated
Handles status changes, plan changes, cancellations.
```javascript
// Actions:
1. Update User_Subscriptions record
2. If canceled, set cancel_at_period_end = true
3. Credits remain active until expiry_ts
```

#### customer.subscription.deleted
Subscription ended (after cancellation period).
```javascript
// Actions:
1. Update User_Subscriptions.status = 'canceled'
2. Credits naturally expire at expiry_ts
```

### Credit Allocation Function
```javascript
async function allocateSubscriptionCredits(userId, planId, periodEnd, trx) {
  // 1. Get plan details
  const plan = await trx('Subscription_Plans').where({ id: planId }).first();
  
  // 2. UPSERT regular credits
  if (plan.regular_credits_per_period > 0) {
    await trx('User_Deliverable_Sub_Credits')
      .insert({
        user_id: userId,
        credits_start: plan.regular_credits_per_period,
        credits_left: plan.regular_credits_per_period,
        expiry_ts: periodEnd
      })
      .onConflict('user_id')
      .merge(['credits_start', 'credits_left', 'expiry_ts', 'updated_ts']);
  }
  
  // 3. UPSERT catchall credits (same pattern)
  if (plan.catchall_credits_per_period > 0) {
    await trx('User_Catchall_Sub_Credits')
      .insert({
        user_id: userId,
        credits_start: plan.catchall_credits_per_period,
        credits_left: plan.catchall_credits_per_period,
        expiry_ts: periodEnd
      })
      .onConflict('user_id')
      .merge(['credits_start', 'credits_left', 'expiry_ts', 'updated_ts']);
  }
}
```

## Phase 4: Credit Usage Updates

### Update Credit Check Function
```javascript
// In /backend/routes/batches/funs_db.js

async function db_checkCreditsOnly(userId, creditType, requiredAmount) {
  // 1. Check subscription credits (if not expired)
  const subTable = creditType === 'catchall' ? 
    'User_Catchall_Sub_Credits' : 'User_Deliverable_Sub_Credits';
    
  const subCredits = await knex(subTable)
    .where({ user_id: userId })
    .where('expiry_ts', '>', knex.fn.now())
    .first();
    
  const subAvailable = subCredits?.credits_left || 0;
  
  // 2. Check one-off credits
  const balanceTable = creditType === 'catchall' ? 
    'Users_Catchall_Credit_Balance' : 'Users_Credit_Balance';
    
  const oneOffCredits = await knex(balanceTable)
    .where({ user_id: userId })
    .first();
    
  const oneOffAvailable = oneOffCredits?.balance || 0;
  
  // 3. Total available
  const totalAvailable = subAvailable + oneOffAvailable;
  
  return totalAvailable >= requiredAmount;
}
```

### Update Credit Deduction Function
```javascript
async function db_deductCreditsForActualBatch(userId, creditType, amount, batchId) {
  return await knex.transaction(async (trx) => {
    // 1. Lock and check subscription credits
    const subTable = creditType === 'catchall' ? 
      'User_Catchall_Sub_Credits' : 'User_Deliverable_Sub_Credits';
      
    const subCredits = await trx(subTable)
      .where({ user_id: userId })
      .where('expiry_ts', '>', knex.fn.now())
      .forUpdate()
      .first();
    
    let remainingToDeduct = amount;
    let usedFromSub = 0;
    
    // 2. Use subscription credits first
    if (subCredits && subCredits.credits_left > 0) {
      usedFromSub = Math.min(subCredits.credits_left, remainingToDeduct);
      await trx(subTable)
        .where({ user_id: userId })
        .update({ 
          credits_left: subCredits.credits_left - usedFromSub,
          updated_ts: knex.fn.now()
        });
      remainingToDeduct -= usedFromSub;
    }
    
    // 3. Use one-off credits for remainder
    let usedFromOneOff = 0;
    if (remainingToDeduct > 0) {
      // Existing one-off deduction logic
      const balanceTable = creditType === 'catchall' ? 
        'Users_Catchall_Credit_Balance' : 'Users_Credit_Balance';
      
      await trx(balanceTable)
        .where({ user_id: userId })
        .decrement('balance', remainingToDeduct);
        
      usedFromOneOff = remainingToDeduct;
    }
    
    // 4. Record usage in history with source breakdown
    // Log: usedFromSub, usedFromOneOff
    
    return [true, { 
      total_deducted: amount, 
      from_subscription: usedFromSub, 
      from_one_off: usedFromOneOff 
    }];
  });
}
```

## Phase 5: Frontend Implementation

### Add Subscription Tab to Packages Page

```javascript
// In frontend/src/app/Packages/Controller.jsx

// Add new tab
const tabs = [
  { id: 'validate', label: 'Email Validation' },
  { id: 'catchall', label: 'Catchall Validation' },
  { id: 'subscriptions', label: 'Monthly Plans' } // NEW
];

// Subscription card component
const SubscriptionCard = ({ plan, userSubscription }) => {
  const isCurrentPlan = userSubscription?.subscription_plan_id === plan.id;
  const isSubscribed = !!userSubscription && userSubscription.status === 'active';
  
  return (
    <div className={`package-card ${isCurrentPlan ? 'current-plan' : ''}`}>
      {isCurrentPlan && (
        <div className="current-plan-badge">
          <Icon name="check-circle" /> Current Plan
        </div>
      )}
      
      <h3 className="plan-name">{plan.name}</h3>
      
      <div className="credits-section">
        <div className="credit-amount">
          <span className="number">{plan.regular_credits_per_period.toLocaleString()}</span>
          <span className="label">Email Verification Credits/month</span>
        </div>
        
        {plan.catchall_credits_per_period > 0 && (
          <div className="credit-amount">
            <span className="number">{plan.catchall_credits_per_period.toLocaleString()}</span>
            <span className="label">Catchall Credits/month</span>
          </div>
        )}
      </div>
      
      <button 
        className="premium-button"
        onClick={() => handleSubscribe(plan.id)}
        disabled={isSubscribed}
      >
        {isCurrentPlan ? 'Current Plan' : 
         isSubscribed ? 'Change Plan' : 
         plan.display_price}
      </button>
    </div>
  );
};
```

### Update Credit Balance Display

```javascript
// Show subscription credits with expiration
const CreditDisplay = ({ credits }) => {
  const daysUntilExpiry = credits.subscription?.expires_at ? 
    Math.ceil((new Date(credits.subscription.expires_at) - new Date()) / (1000 * 60 * 60 * 24)) : 0;
    
  return (
    <div className="credit-balance-display">
      {credits.subscription && (
        <div className="subscription-credits">
          <div className="credit-type">Monthly Credits</div>
          <div className="credit-amount">{credits.subscription.remaining.toLocaleString()}</div>
          <div className="expiry-notice">
            Expires in {daysUntilExpiry} days
          </div>
        </div>
      )}
      
      <div className="one-off-credits">
        <div className="credit-type">Purchased Credits</div>
        <div className="credit-amount">{credits.one_off.toLocaleString()}</div>
      </div>
      
      <div className="total-credits">
        <div className="credit-type">Total Available</div>
        <div className="credit-amount">{credits.total.toLocaleString()}</div>
      </div>
    </div>
  );
};
```

### Subscription Management UI

```javascript
// Add subscription status component
const SubscriptionStatus = () => {
  const [status, setStatus] = useState(null);
  
  useEffect(() => {
    fetchSubscriptionStatus();
  }, []);
  
  const handleManageSubscription = async () => {
    const { portal_url } = await api.post('/subscriptions/manage');
    window.open(portal_url, '_blank');
  };
  
  if (!status?.has_subscription) return null;
  
  return (
    <div className="subscription-status">
      <h3>Your Subscription</h3>
      <div className="plan-info">
        <span>{status.subscription.plan_name}</span>
        <span className="status">{status.subscription.status}</span>
      </div>
      
      {status.subscription.cancel_at_period_end && (
        <div className="cancellation-notice">
          Subscription will end on {formatDate(status.subscription.current_period_end)}
        </div>
      )}
      
      <button onClick={handleManageSubscription}>
        Manage Subscription
      </button>
    </div>
  );
};
```

## Phase 6: Testing Checklist

### Critical Test Scenarios

1. **No-Rollover Verification**
   - Create subscription with test card
   - Use partial credits
   - Trigger renewal via Stripe CLI: `stripe trigger invoice.payment_succeeded`
   - Verify old credits are inaccessible
   - Verify new full allocation exists

2. **Mixed Credit Usage**
   - Have both subscription (50k) and one-off credits (30k)
   - Process batch requiring 60k credits
   - Verify 50k deducted from subscription, 10k from one-off
   - Verify correct balance remaining

3. **Expiry Handling**
   - Set subscription credits with past expiry_ts
   - Verify credit check ignores expired credits
   - Verify only one-off credits used

4. **Cancellation Flow**
   - Cancel subscription via Stripe portal
   - Verify cancel_at_period_end flag set
   - Verify credits remain until expiry_ts
   - Verify no renewal after period end

5. **Edge Cases**
   - Multiple rapid deductions (race condition test)
   - Webhook replay handling
   - Plan change mid-period
   - Failed payment recovery

### Test Commands

```bash
# Stripe CLI webhook testing
stripe listen --forward-to localhost:3001/webhooks/stripe

# Trigger specific events
stripe trigger invoice.payment_succeeded
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted

# Test with specific subscription ID
stripe trigger invoice.payment_succeeded --override subscription:sub_xxxxx
```

## Phase 7: Deployment Steps

### 1. Database Migration
```bash
# Run migrations in this order
mysql -u root -p omniverifier < create_subscription_tables.sql
mysql -u root -p omniverifier < seed_test_plans.sql
```

### 2. Environment Variables
```bash
# Add to .env if not already present
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_SECRET_KEY=sk_test_xxxxx
```

### 3. Backend Deployment
1. Deploy subscription routes
2. Update webhook handler
3. Update credit deduction logic
4. Test webhook endpoint with Stripe CLI

### 4. Stripe Configuration
1. Create subscription products in Stripe Dashboard
2. Update Subscription_Plans table with real IDs
3. Configure webhook endpoint in Stripe
4. Enable required webhook events

### 5. Frontend Deployment
1. Deploy with feature flag initially
2. Test with internal users
3. Monitor for errors
4. Gradual rollout

### 6. Monitoring
- Set up alerts for webhook failures
- Monitor subscription conversion rates
- Track credit expiration patterns
- Check for unusual deduction patterns

## Key Design Decisions

1. **No Rollover Implementation**: Using `expiry_ts` timestamp naturally prevents rollover without complex logic
2. **Webhook-Driven**: Relying on Stripe webhooks ensures we're always in sync with billing
3. **UPSERT Pattern**: Using ON CONFLICT ensures idempotent credit allocation
4. **Credit Priority**: Always use subscription credits first to maximize value for subscribers
5. **Simple Schema**: One active record per user keeps queries fast and logic simple

## Security Considerations

1. Always verify Stripe webhook signatures
2. Use database transactions for credit operations
3. Implement row-level locking to prevent race conditions
4. Never trust client-side subscription status
5. Log all credit operations for audit trail

## Future Enhancements

1. **Credit History**: Add dedicated history tables for subscription credit usage
2. **Proration**: Handle plan upgrades/downgrades with credit proration
3. **Trial Periods**: Support free trials with limited credits
4. **Annual Plans**: Add yearly billing options with discounts
5. **Credit Alerts**: Notify users when subscription credits are running low