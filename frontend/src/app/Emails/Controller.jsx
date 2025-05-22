import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { listVerifyRequests } from '../../api/emails';
import styles from './Emails.module.css';

export default function HomeController() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const response = await listVerifyRequests();
        setRequests(response.data.data);
      } catch (err) {
        setError('Failed to load verify requests');
        console.error('Error fetching requests:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, []);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <p className={styles.loadingText}>Loading verify requests...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <p className={styles.emptyText}>{error}</p>
          <p className={styles.emptySubtext}>Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className={styles.container}>
        {/* <h1 className={styles.title}>Email Verification Requests</h1> */}
        <div className={styles.empty}>
          <p className={styles.emptyText}>No verify requests found</p>
          <p className={styles.emptySubtext}>Start by verifying some emails</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Welcome back!</h1>
      <br/>
      <div className={styles.grid}>
        {requests.map((request, idx) => (
          <NavLink
            key={request.request_id}
            to={`/${request.request_id}/details`}
            className={styles.link}
          >
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.subtitle}>
                  {request.request_type === 'single' ? 'Single Email' : `${request.num_contacts} Emails`}
                </div>
                <div className={`${styles.statusBadge} ${
                  request.num_processed === request.num_contacts
                    ? styles.statusComplete
                    : request.num_processed > 0
                    ? styles.statusProcessing
                    : styles.statusPending
                }`}>
                  {request.num_processed === request.num_contacts
                    ? 'Complete'
                    : request.num_processed > 0
                    ? 'Processing'
                    : 'Pending'}
                </div>
              </div>
              <div className={styles.stats}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Valid</span>
                  <span className={styles.statValue}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                      <path stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="m15.75 9.5-5 5-2.5-2.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
                    </svg>
                    {request.num_processed}
                  </span>
                </div>
                {/* <div className={styles.stat}>
                  <span className={styles.statLabel}>Processed</span>
                  <span className={styles.statValue}>{request.num_processed}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Progress</span>
                  <span className={styles.statValue}>
                    {request.num_contacts > 0
                      ? Math.round((request.num_processed / request.num_contacts) * 100)
                      : 0}%
                  </span>
                </div> */}
              </div>
            </div>
          </NavLink>
        ))}
      </div>
    </div>
  );
}