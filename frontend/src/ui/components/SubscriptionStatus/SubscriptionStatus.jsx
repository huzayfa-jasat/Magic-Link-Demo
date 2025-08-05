import { useCreditsContext } from '../../../context/useCreditsContext';
import { createPortalSession } from '../../../api/subscriptions';
import styles from './SubscriptionStatus.module.css';

export default function SubscriptionStatus() {
  const { subscription, subscriptionCredits } = useCreditsContext();

  const handleManageSubscription = async () => {
    try {
      const resp = await createPortalSession();
      if (resp.status === 200) {
        window.open(resp.data.portal_url, '_blank');
      }
    } catch (err) {
      console.error('Could not create portal session:', err);
    }
  };

  if (!subscription) {
    return null;
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Active Subscription</h3>
      
      <div className={styles.planInfo}>
        <div className={styles.planName}>{subscription.plan_name}</div>
        <div className={styles.status}>
          Status: <span className={`${styles.statusBadge} ${styles[subscription.status]}`}>
            {subscription.status}
          </span>
        </div>
      </div>

      {subscription.cancel_at_period_end && (
        <div className={styles.cancelNotice}>
          ⚠️ Your subscription will end on {formatDate(subscription.current_period_end)}
        </div>
      )}

      <div className={styles.periodInfo}>
        <div className={styles.periodItem}>
          <span className={styles.label}>Current period ends:</span>
          <span className={styles.value}>{formatDate(subscription.current_period_end)}</span>
        </div>
      </div>

      <div className={styles.creditsInfo}>
        {subscriptionCredits.regular && (
          <div className={styles.creditItem}>
            <span className={styles.creditLabel}>Email Credits:</span>
            <span className={styles.creditValue}>
              {subscriptionCredits.regular.remaining.toLocaleString()} / {subscriptionCredits.regular.start.toLocaleString()}
            </span>
          </div>
        )}
        {subscriptionCredits.catchall && (
          <div className={styles.creditItem}>
            <span className={styles.creditLabel}>Catchall Credits:</span>
            <span className={styles.creditValue}>
              {subscriptionCredits.catchall.remaining.toLocaleString()} / {subscriptionCredits.catchall.start.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <button className={styles.manageButton} onClick={handleManageSubscription}>
        Manage Subscription
      </button>
    </div>
  );
}