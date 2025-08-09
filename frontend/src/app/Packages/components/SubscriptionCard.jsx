import styles from '../styles/Packages.module.css';

export default function SubscriptionCard({ 
  plan, 
  currentPlan, 
  isSubscribed, 
  handleSubscribe,
  handleManage 
}) {
  const isCurrentPlan = currentPlan?.plan_id === plan.id;
  
  return (
    <div className={`${styles.creditCard} ${isCurrentPlan ? styles.currentPlanCard : ''}`}>
      {isCurrentPlan && (
        <div className={styles.currentPlanBadge}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: '4px' }}>
            <path d="M13.485 1.929a.5.5 0 0 1 .07.606l-6.5 9a.5.5 0 0 1-.757.069l-3.5-3a.5.5 0 1 1 .652-.76l3.071 2.632 6.107-8.457a.5.5 0 0 1 .707-.09z"/>
          </svg>
          Current Plan
        </div>
      )}
      
      <h1 className={styles.packageName}>{plan.name}</h1>
      
      <h2 className={styles.numCredits}>{plan.credits_per_period.toLocaleString()}</h2>
      <p className={styles.verificationText}>Credits per month</p>
      
      {/* Display trial information if available */}
      {/* {plan.trial_days > 0 && (
        <div style={{ marginTop: '10px', padding: '8px', backgroundColor: '#f0f9ff', borderRadius: '6px', border: '1px solid #0369a1' }}>
          <p style={{ fontSize: '14px', fontWeight: '600', color: '#0369a1', marginBottom: '4px' }}>
            {plan.trial_days} Day{plan.trial_days > 1 ? 's' : ''} Free Trial
          </p>
          {plan.trial_credits > 0 && (
            <p style={{ fontSize: '13px', color: '#0369a1' }}>
              {plan.trial_credits.toLocaleString()} trial credits included
            </p>
          )}
        </div>
      )} */}
      
      {currentPlan?.cancel_at_period_end && isCurrentPlan && (
        <p className={styles.cancelNotice} style={{ color: '#ff6b6b', fontSize: '14px', marginTop: '10px' }}>
          Canceling at period end
        </p>
      )}
      
      <button 
        className={`${styles.buyBtn} ${styles.premium}`}
        onClick={isCurrentPlan ? handleManage : () => handleSubscribe(plan.id)}
        disabled={isSubscribed && !isCurrentPlan}
        style={isSubscribed && !isCurrentPlan ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
      >
        {(plan.trial_days > 0) ? (
          <span className={styles.trialBadge}>
            Try free for {plan.trial_days} day{plan.trial_days > 1 ? 's' : ''}
          </span>
        ): (
          isCurrentPlan ? 'Manage Subscription' : 
          isSubscribed ? 'Change Plan' : 
          `Only ${plan.display_price} USD / mo.`
        )}
      </button>
    </div>
  );
}