// Icon Imports
import { COMPLETE_CHECK_ICON, GIFT_ICON, STAR_ICON } from "../../../assets/icons";

// Style Imports
import styles from '../styles/Packages.module.css';

// Helper Functions
const getCreditsDisplayFormatted = (credits) => {
  if (credits >= 1000000) return `${(credits / 1000000).toFixed(0)}M`;
  else if (credits >= 1000) return `${(credits / 1000).toFixed(0)}K`;
  return credits.toLocaleString();
}

const getPricePerCredit = (price_raw, credits) => {
  const price = parseFloat(price_raw.replaceAll('$', '').replaceAll(',', ''));
  return (price / credits).toFixed(5);
}

// Component
export default function SubscriptionCard({ 
  plan, 
  currentPlan, 
  isSubscribed, 
  handleSubscribe,
  handleManage 
}) {
  const isCurrentPlan = currentPlan?.plan_id === plan.id;
  
  return (
    <div className={`${styles.subCard} ${isCurrentPlan ? styles.currentPlanCard : ''}`}>
      <div className={styles.packageTop}>
        <h1 className={styles.packageName}>{plan.name}</h1>
        {(isCurrentPlan) ? (
          <div className={styles.currentPlanBadge}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: '4px' }}>
              <path d="M13.485 1.929a.5.5 0 0 1 .07.606l-6.5 9a.5.5 0 0 1-.757.069l-3.5-3a.5.5 0 1 1 .652-.76l3.071 2.632 6.107-8.457a.5.5 0 0 1 .707-.09z"/>
            </svg>
            Current Plan
          </div>
        ) : (
          (plan.is_popular) ? (
            <div className={styles.popularBadge}>
              {STAR_ICON}
              Most Popular
            </div>
          ) :
          <></>
        )}
      </div>
      
      <h2 className={styles.numCredits}>{getCreditsDisplayFormatted(plan.credits_per_period)}</h2>
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
      
      {/* {currentPlan?.cancel_at_period_end && isCurrentPlan && (
        <p className={styles.cancelNotice} style={{ color: '#ff6b6b', fontSize: '14px', marginTop: '10px' }}>
          Canceling at period end
        </p>
      )} */}

      <div className={styles.featuresContainer}>
        {(plan.trial_days > 0) && 
          <div className={`${styles.feature} ${styles.bonusFeature}`}>
            <div className={styles.featureIcon}>{GIFT_ICON}</div>
            <p className={styles.featureText}>Try free for {plan.trial_days} day{plan.trial_days > 1 ? 's' : ''} ({plan.trial_credits.toLocaleString()} free credits)</p>
          </div>
        }
        <div className={styles.feature}>
          <div className={styles.featureIcon}>{COMPLETE_CHECK_ICON}</div>
          <p className={styles.featureText}>Validate {plan.credits_per_period.toLocaleString()} emails every month</p>
        </div>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>{COMPLETE_CHECK_ICON}</div>
          <p className={styles.featureText}>${getPricePerCredit(plan.display_price, plan.credits_per_period)} per email validated</p>
        </div>
      </div>

      {/* {(plan.trial_days > 0) ? (
        <div className={styles.bonusContainer}>
          <p className={styles.bonus}>
            Try FREE for {plan.trial_days} day{plan.trial_days > 1 ? 's' : ''}
          </p>
          <p className={styles.extraCredits}>
					  {GIFT_ICON}
            <span>+{getCreditsDisplayFormatted(plan.trial_credits)} Credits</span>
          </p>
        </div>
      ) : (
        <></>
      )} */}
      
      {/* <button 
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
          `${plan.display_price} USD / mo.`
        )}
      </button> */}

      <button 
        className={`${styles.buyBtn} ${styles.premium}`}
        onClick={isCurrentPlan ? handleManage : () => handleSubscribe(plan.id)}
        disabled={isSubscribed && !isCurrentPlan}
        style={isSubscribed && !isCurrentPlan ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
      >
        {(isCurrentPlan) ? 'Manage Subscription' : (
          (isSubscribed) ? 'Change Plan' : `${plan.display_price} USD / mo.`
        )}
      </button>
    </div>
  );
}