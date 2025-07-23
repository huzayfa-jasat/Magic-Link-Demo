import { useEffect, useState, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { getBatchesList, getVerifyBatchResults } from "../../api/batches";
import getMailServerDisplay from "./getMailServerDisplay";
import styles from "./Emails.module.css";
import { useParams } from "react-router-dom";
import Popup from "reactjs-popup";

const ITEMS_PER_PAGE = 50;

// Constants
const FILTER_MAP = {
  'valid': 'deliverable',
  'invalid': 'undeliverable', 
  'catch-all': 'catchall',
  'all': 'all'
};

export default function HomeController() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { id } = useParams();

  useEffect(() => {
    const fetchRequests = async () => {
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

    fetchRequests();
  }, []);

  const handleExportFiltered = useCallback(
    async (filter) => {
      let allResults = [];
      let page = 1;
      let done = false;

      while (!done) {
        const response = await getVerifyBatchResults(
          id,
          page,
          ITEMS_PER_PAGE,
          'timehl',
          FILTER_MAP[filter] || 'all'
        );
        
        const pageResults = response.data.results || [];
        allResults = [...allResults, ...pageResults];
        
        // Check if we have more pages using metadata
        if (!response.data.metadata?.has_more) {
          done = true;
        } else {
          page++;
        }
      }

      // Build and download CSV - map new result format to old
      const headers = ["Email", "Result", "Mail Server"];
      const csvContent = [
        headers.join(","),
        ...allResults.map((item) => {
          // Map result values: 1=deliverable, 2=catchall, 0=undeliverable
          let resultText;
          if (item.result === 1) resultText = "valid";
          else if (item.result === 2) resultText = "catch-all";
          else resultText = "invalid";
          
          return [
            item.email,
            resultText,
            getMailServerDisplay(item.provider) || ""
          ].join(",");
        }),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `email-results-${filter}-${id}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [id]
  );

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
      <br />
      <div className={styles.grid}>
        {requests.map((request, idx) => (
          <NavLink
            key={request.id}
            to={`/${request.id}/details`}
            className={styles.link}
          >
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.subtitle}>
                  {request.title || `${request.emails} Emails`}
                </div>
                <div style={{display: 'flex', gap: '0.5rem'}}>
                  <div
                    className={`${styles.statusBadge} ${
                      request.category === "deliverable"
                        ? styles.statusComplete
                        : styles.statusProcessing
                    }`}
                  >
                    {request.category === "deliverable" ? "Verify" : "Catchall"}
                  </div>
                  <div
                    className={`${styles.statusBadge} ${
                      request.status === "completed"
                        ? styles.statusComplete
                        : request.status === "processing"
                        ? styles.statusProcessing
                        : styles.statusPending
                    }`}
                  >
                    {request.status === "completed"
                      ? "Complete"
                      : request.status === "processing"
                      ? "Processing"
                      : "Pending"}
                  </div>
                </div>
              </div>
              <div className={styles.stats}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Total</span>
                  <span className={styles.statValue}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke="#000"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="m15.75 9.5-5 5-2.5-2.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                      />
                    </svg>
                    {request.emails}
                  </span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Created</span>
                  <div
                    className={`${styles.metaValue}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke="#000"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M8 12h8m5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                      />
                    </svg>
                    {new Date(request.created).toLocaleDateString()}
                  </div>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Status</span>
                  <div
                    className={`${styles.metaValue}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke="#000"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M8 12h8m5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                      />
                    </svg>
                    {request.status}
                  </div>
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
              <div>
                <Popup
                  trigger={
                    <button
                      className={`${styles.button} ${styles.buttonPrimary}`}
                    >
                      Export ▼
                    </button>
                  }
                  position="bottom left"
                  on={["click"]}
                  closeOnDocumentClick
                >
                  <div className={styles.exportMenu}>
                    <button onClick={() => handleExportFiltered("valid")}>
                      Only Valid
                    </button>
                    <button onClick={() => handleExportFiltered("invalid")}>
                      Only Invalid
                    </button>
                    <button onClick={() => handleExportFiltered("catch-all")}>
                      Only Catch-All
                    </button>
                    <button onClick={() => handleExportFiltered("all")}>
                      All Emails
                    </button>
                  </div>
                </Popup>
              </div>
            </div>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
