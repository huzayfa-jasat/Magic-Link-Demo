// Dependencies
import { useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import Popup from "reactjs-popup";

// Component Imports
import useBatchData from "./hooks/useBatchData";
import getMailServerDisplay from "./getMailServerDisplay";

// API Imports
import { getVerifyBatchResults } from "../../api/batches";

// Style Imports
import styles from "./Emails.module.css";

// Constants
const FILTER_MAP = {
  'valid': 'deliverable',
  'invalid': 'undeliverable', 
  'catch-all': 'catchall',
  'all': 'all'
};

// Main Component
export default function EmailsBatchDetailsController() {
  const { id } = useParams();

  // Use custom hook for all batch data management
  const {
    details,
    results,
    loading,
    error,
    currentPage,
    totalPages,
    searchQuery,
    stats,
    setCurrentPage,
    setSearchQuery,
  } = useBatchData(id);

  // Export current page results to CSV
  // const handleExport = useCallback(() => {
  //   if (!results.length) return;

  //   // Set up CSV headers
  //   const headers = ["Email", "Result", "Mail Server"];
    
  //   // Build CSV content from current results
  //   const csvContent = [
  //     headers.join(","),
  //     ...results.map((item) =>
  //       [
  //         item.email || item.global_id,
  //         item.result || "pending",
  //         getMailServerDisplay(item.mail_server) || "",
  //       ].join(",")
  //     ),
  //   ].join("\n");

  //   // Create and trigger download
  //   const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  //   const link = document.createElement("a");
  //   const url = URL.createObjectURL(blob);
  //   link.setAttribute("href", url);
  //   link.setAttribute("download", `email-verification-results-${id}.csv`);
  //   document.body.appendChild(link);
  //   link.click();
  //   document.body.removeChild(link);
  // }, [results, id]);

  // Export filtered results to CSV (fetches all pages for the filter)
  const handleExportFiltered = useCallback(
    async (filter) => {
      const ITEMS_PER_PAGE = 50;
      let allResults = [];
      let page = 1;
      let done = false;

      // Fetch all pages of filtered results
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

      // Build CSV content from all filtered results
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
            getMailServerDisplay(item.provider) || "",
          ].join(",");
        }),
      ].join("\n");

      // Create and trigger download
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

  // Loading state
  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <p className={styles.loadingText}>Loading batch details...</p>
        </div>
      </div>
    );
  }

  // Error state
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

  // Not found state
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

  // Main render - batch details page
  return (
    <div className={styles.detailsContainer}>
      {/* Navigation back to home */}
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

      {/* Page header with title and export dropdown */}
      <div className={styles.detailsHeader}>
        <h1 className={styles.detailsTitle}>Details</h1>
        {/* Simple export button (commented out in favor of dropdown) */}
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

      {/* Search input for filtering results */}
      <div className={styles.searchContainer}>
        <input
          type="text"
          placeholder="Search emails..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
        />
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          fill="none"
          viewBox="0 0 24 24"
          className={styles.searchIcon}
        >
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
          />
        </svg>
      </div>

      {/* Statistics cards showing batch summary */}
      <div className={styles.detailsMeta}>
        <div className={styles.metaCard}>
          <div className={styles.metaLabel}>Total Emails</div>
          <div className={styles.metaValue}>{details.emails}</div>
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

      {/* Results table */}
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
            {results.map((item, index) => {
              // Map result values: 1=deliverable, 2=catchall, 0=undeliverable
              let resultText;
              if (item.result === 1) resultText = "Valid";
              else if (item.result === 2) resultText = "Catch-All";
              else if (item.result === 0) resultText = "Invalid";
              else resultText = "Pending";

              return (
                <tr key={index} className={styles.tableRow}>
                  <td className={styles.tableCell}>
                    {item.email}
                  </td>
                  <td className={`${styles.tableCell} ${styles.tableCellResult}`}>
                    {resultText}
                  </td>
                  <td className={styles.tableCell}>
                    {getMailServerDisplay(item.provider)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
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
