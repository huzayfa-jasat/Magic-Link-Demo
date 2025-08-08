import { useCreditsContext } from '../../../context/useCreditsContext';
import { createPortalSession } from '../../../api/subscriptions';
import styles from './SubscriptionStatus.module.css';

export default function SubscriptionStatus() {
  const { subscription, subscriptionCredits } = useCreditsContext();

  const handleManageSubscription = async (type) => {
    try {
      const resp = await createPortalSession(type);
      if (resp.status === 200) {
        window.open(resp.data.portal_url, '_blank');
      }
    } catch (err) {
      console.error('Could not create portal session:', err);
    }
  };

  if (!subscription || Object.keys(subscription).length === 0) {
    return null;
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const renderSubscription = (sub, type) => {
    if (!sub) return null;

    return (
      <div className={styles.subscriptionSection} key={type}>
        <h4 className={styles.sectionTitle}>
          {type === 'regular' ? 'Email Verification' : 'Catchall'} Subscription
        </h4>
        
        <div className={styles.planInfo}>
          <div className={styles.planName}>{sub.plan_name}</div>
          <div className={styles.status}>
            Status: <span className={`${styles.statusBadge} ${styles[sub.status]}`}>
              {sub.status}
            </span>
          </div>
        </div>

        {sub.cancel_at_period_end && (
          <div className={styles.cancelNotice}>
            ⚠️ Your subscription will end on {formatDate(sub.current_period_end)}
          </div>
        )}

        <div className={styles.periodInfo}>
          <div className={styles.periodItem}>
            <span className={styles.label}>Current period ends:</span>
            <span className={styles.value}>{formatDate(sub.current_period_end)}</span>
          </div>
        </div>

        <div className={styles.creditsInfo}>
          {subscriptionCredits[type] && (
            <div className={styles.creditItem}>
              <span className={styles.creditLabel}>Credits:</span>
              <span className={styles.creditValue}>
                {subscriptionCredits[type].remaining.toLocaleString()} / {subscriptionCredits[type].start.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <button 
          className={styles.manageButton} 
          onClick={() => handleManageSubscription(type)}
        >
          Manage {type === 'regular' ? 'Email' : 'Catchall'} Subscription
        </button>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Active Subscriptions</h3>
      {renderSubscription(subscription.regular, 'regular')}
      {renderSubscription(subscription.catchall, 'catchall')}
    </div>
  );
}