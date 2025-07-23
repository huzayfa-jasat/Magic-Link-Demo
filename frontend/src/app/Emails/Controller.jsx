import { useEffect, useState, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { listVerifyRequests, exportBatchResultsCsv } from "../../api/emails";
import styles from "./Emails.module.css";
import { useParams, Link } from "react-router-dom";
import Popup from "reactjs-popup";

const ITEMS_PER_PAGE = 50;

export default function HomeController() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { id } = useParams();

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        // TODO: Use new batches endpoint
        
        // const response = await listVerifyRequests();
        setRequests(response.data.data);
        // console.log(requests);
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

      // TODO: Handle export
      // - just download all pages & format once done

      while (!done) {
        const response = await exportBatchResultsCsv(
          id,
          page,
          ITEMS_PER_PAGE,
          filter
        );
        const pageResults = response.data.data || [];
        allResults = [...allResults, ...pageResults];
        if (pageResults.length < ITEMS_PER_PAGE) done = true;
        else page++;
      }

      // Build and download CSV
      const headers = ["Email", "Result", "Mail Server"];
      const csvContent = [
        headers.join(","),
        ...allResults.map((item) =>
          [
            item.email,
            item.result || "pending",
            item.mail_server || "",
          ].join(",")
        ),
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
            key={request.request_id}
            to={`/${request.request_id}/details`}
            className={styles.link}
          >
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.subtitle}>
                  {request.request_type === "single"
                    ? "Single Email"
                    : `${request.num_contacts} Emails`}
                </div>
                <div
                  className={`${styles.statusBadge} ${
                    request.num_processed === request.num_contacts
                      ? styles.statusComplete
                      : request.num_processed > 0
                      ? styles.statusProcessing
                      : styles.statusPending
                  }`}
                >
                  {request.num_processed === request.num_contacts
                    ? "Complete"
                    : request.num_processed > 0
                    ? "Processing"
                    : "Pending"}
                </div>
              </div>
              <div className={styles.stats}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Valid</span>
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
                    {request.num_processed}
                  </span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Invalid</span>
                  <div
                    className={`${styles.metaValue} ${styles.resultInvalid}`}
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
                        d="M9.172 14.828 12 12m0 0 2.828-2.828M12 12 9.172 9.172M12 12l2.828 2.828M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                      />
                    </svg>
                    {request.num_invalid}
                  </div>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Catch-All</span>
                  <div
                    className={`${styles.metaValue} ${styles.resultCatchAll}`}
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
                    {request.num_catch_all}
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
