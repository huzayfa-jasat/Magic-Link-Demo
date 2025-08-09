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
        {isCurrentPlan ? 'Manage Subscription' : 
         isSubscribed ? 'Change Plan' : 
         `Only ${plan.display_price} USD`}
      </button>
    </div>
  );
}