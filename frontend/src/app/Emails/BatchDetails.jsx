import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getVerifyRequestDetails,
  getPaginatedVerifyRequestResults,
  exportBatchResultsCsv,
} from "../../api/emails";
import styles from "./Emails.module.css";

import { getMailServerDisplay } from "./Components/MailServerDisplay";

import Popup from "reactjs-popup";

const ITEMS_PER_PAGE = 50;

// Main Component
export default function EmailsBatchDetailsController() {
  const { id } = useParams();
  const [details, setDetails] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Fetch batch details
  const fetchDetails = useCallback(async () => {
    try {
      const response = await getVerifyRequestDetails(id);
      setDetails(response.data.data);
      return true; // Return success status
    } catch (err) {
      setError("Failed to load batch details");
      console.error("Error fetching details:", err);
      return false; // Return failure status
    }
  }, [id]);

  // Fetch paginated results
  const fetchResults = useCallback(
    async (page) => {
      if (!details) return; // Don't fetch if we don't have details

      try {
        const response = await getPaginatedVerifyRequestResults(
          id,
          page,
          ITEMS_PER_PAGE
        );
        setResults(response.data.data || []);
        setTotalPages(Math.ceil(details.num_contacts / ITEMS_PER_PAGE));
        return true; // Return success status
      } catch (err) {
        setError("Failed to load results");
        console.error("Error fetching results:", err);
        setResults([]);
        return false; // Return failure status
      } finally {
        setLoading(false);
      }
    },
    [id, details]
  );

  // Separate effects for details and results
  useEffect(() => {
    const loadDetails = async () => {
      setLoading(true);
      setError(null);
      const success = await fetchDetails();
      if (!success) {
        setLoading(false);
      }
    };
    loadDetails();
  }, [fetchDetails]);

  // Only fetch results when details are loaded and page changes
  useEffect(() => {
    if (details && !error) {
      fetchResults(currentPage);
    }
  }, [details, currentPage, fetchResults, error]);

  // Calculate result statistics
  const stats = (results || []).reduce(
    (acc, item) => {
      const result = item?.result?.toLowerCase() || "pending";
      acc[result] = (acc[result] || 0) + 1;
      return acc;
    },
    {
      valid: 0,
      invalid: 0,
      catchall: 0,
      pending: 0,
    }
  );

  // Export results to CSV
  // const handleExport = useCallback(() => {
  //   if (!results.length) return;

  //   const headers = ["Email", "Result", "Mail Server"];
  //   const csvContent = [
  //     headers.join(","),
  //     ...results.map((item) =>
  //       [
  //         item.global_id,
  //         item.result || "pending",
  //         item.processed_ts || "",
  //       ].join(",")
  //     ),
  //   ].join("\n");

  //   const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  //   const link = document.createElement("a");
  //   const url = URL.createObjectURL(blob);
  //   link.setAttribute("href", url);
  //   link.setAttribute("download", `email-verification-results-${id}.csv`);
  //   document.body.appendChild(link);
  //   link.click();
  //   document.body.removeChild(link);
  // }, [results, id]);

  // Filtered exports
  const handleExportFiltered = useCallback(
    async (filter) => {
      let allResults = [];
      let page = 1;
      let done = false;

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
          <p className={styles.loadingText}>Loading batch details...</p>
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

  if (!details) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <p className={styles.emptyText}>Batch not found</p>
          <p className={styles.emptySubtext}>
            The requested batch could not be found
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.detailsContainer}>
      <Link to="/home" className={styles.backLink}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
          />
        </svg>
        Back to Home
      </Link>

      <div className={styles.detailsHeader}>
        <h1 className={styles.detailsTitle}>Details</h1>
        {/* <button
          className={`${styles.button} ${styles.buttonPrimary}`}
          onClick={handleExport}
          disabled={!results.length}
        >
          Export
        </button> */}
        <Popup
          trigger={
            <button className={`${styles.button} ${styles.buttonPrimary}`}>
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

      <div className={styles.detailsMeta}>
        <div className={styles.metaCard}>
          <div className={styles.metaLabel}>Total Emails</div>
          <div className={styles.metaValue}>{details.num_contacts}</div>
        </div>
        <div className={styles.metaCard}>
          <div className={styles.metaLabel}>Valid</div>
          <div className={`${styles.metaValue} ${styles.resultValid}`}>
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
            {stats.valid}
          </div>
        </div>
        <div className={styles.metaCard}>
          <div className={styles.metaLabel}>Invalid</div>
          <div className={`${styles.metaValue} ${styles.resultInvalid}`}>
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
            {stats.invalid}
          </div>
        </div>
        <div className={styles.metaCard}>
          <div className={styles.metaLabel}>Catch-All</div>
          <div className={`${styles.metaValue} ${styles.resultCatchAll}`}>
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
            {stats.catchall}
          </div>
        </div>
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead className={styles.tableHeader}>
            <tr>
              <th className={styles.tableHeaderCell}>Email</th>
              <th className={styles.tableHeaderCell}>Result</th>
              <th className={styles.tableHeaderCell}>Mail Server</th>
            </tr>
          </thead>
          <tbody>
            {results.map((item, index) => (
              <tr key={index} className={styles.tableRow}>
                <td className={styles.tableCell}>{item.global_id}</td>
                <td className={`${styles.tableCell} ${styles.tableCellResult}`}>
                  {item.result || "Pending"}
                </td>
                <td className={styles.tableCell}>
                  {getMailServerDisplay(item.mail_server)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={`${styles.paginationButton} ${
              currentPage === 1 ? styles.paginationButtonDisabled : ""
            }`}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          {[...Array(totalPages)].map((_, i) => (
            <button
              key={i}
              className={`${styles.paginationButton} ${
                currentPage === i + 1 ? styles.paginationButtonActive : ""
              }`}
              onClick={() => setCurrentPage(i + 1)}
            >
              {i + 1}
            </button>
          ))}
          <button
            className={`${styles.paginationButton} ${
              currentPage === totalPages ? styles.paginationButtonDisabled : ""
            }`}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
