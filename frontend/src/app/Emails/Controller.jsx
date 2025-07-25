// Dependencies
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

// API Imports
import { getBatchesList } from "../../api/batches";

// Component Imports
import { LoadingCircle } from "../../ui/components/LoadingCircle";
import BatchCard from "./Components/BatchCard";

// Style Imports
import styles from "./Emails.module.css";

// Icon Imports
import {
  EMAIL_QUESTION_ICON, UPLOAD_ICON
} from "../../assets/icons";

// Main Component
export default function HomeController() {
  // States
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load batches on mount
  const fetchBatches = async () => {
    try {
      const response = await getBatchesList(1, 100, 'timehl', 'all', 'all');
      setRequests(response.data.batches);
    } catch (err) {
      setError("Failed to load verify requests");
      console.error("Error fetching requests:", err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchBatches();
  }, []);

  // TODO: Pagination

  // Render
  if (loading) {
    return (
      <div className={styles.container}>
        <LoadingCircle relative={true} showBg={false} />
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
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            {EMAIL_QUESTION_ICON}
          </div>
          <p className={styles.emptyText}>No emails found</p>
          <p className={styles.emptySubtext}>Start by validating some emails.</p>
          <NavLink to="/upload" className={styles.uploadButton}>
            {UPLOAD_ICON}
            Upload
          </NavLink>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Welcome back!</h1>
      <br />
      <div className={styles.grid}>
        {requests.map((request) => (
          <BatchCard key={request.id} request={request} />
        ))}
      </div>
    </div>
  );
}
