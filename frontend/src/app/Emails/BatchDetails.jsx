import { useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import styles from "./Emails.module.css";
import getMailServerDisplay from "./getMailServerDisplay";
import  useBatchData  from "./hooks/useBatchData";

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

  // Export results to CSV
  const handleExport = useCallback(() => {
    if (!results.length) return;

    const headers = ["Email", "Result", "Mail Server"];
    const csvContent = [
      headers.join(","),
      ...results.map((item) =>
        [
          item.email || item.global_id,
          item.result || "pending",
          getMailServerDisplay(item.mail_server) || "",
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `email-verification-results-${id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [results, id]);

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
          <p className={styles.emptySubtext}>The requested batch could not be found</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.detailsContainer}>
      <Link to="/home" className={styles.backLink}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
          <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/>
        </svg>
        Back to Home
      </Link>

      <div className={styles.detailsHeader}>
        <h1 className={styles.detailsTitle}>
          {details.file_name || 'Details'}
        </h1>
        <button
          className={`${styles.button} ${styles.buttonPrimary}`}
          onClick={handleExport}
          disabled={!results.length}
        >
          Export
        </button>
      </div>

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

      <div className={styles.detailsMeta}>
        <div className={styles.metaCard}>
          <div className={styles.metaLabel}>Total Emails</div>
          <div className={styles.metaValue}>{details.num_contacts}</div>
        </div>
        <div className={styles.metaCard}>
          <div className={styles.metaLabel}>
            Valid
          </div>
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
          <div className={styles.metaLabel}>
            Catch-All
          </div>
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
                <td className={styles.tableCell}>
                  {item.email || item.global_id}
                </td>
                <td className={`${styles.tableCell} ${styles.tableCellResult}`}>
                  {item.result || 'Pending'}
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
            className={`${styles.paginationButton} ${currentPage === 1 ? styles.paginationButtonDisabled : ''}`}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          {[...Array(totalPages)].map((_, i) => (
            <button
              key={i}
              className={`${styles.paginationButton} ${currentPage === i + 1 ? styles.paginationButtonActive : ''}`}
              onClick={() => setCurrentPage(i + 1)}
            >
              {i + 1}
            </button>
          ))}
          <button
            className={`${styles.paginationButton} ${currentPage === totalPages ? styles.paginationButtonDisabled : ''}`}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}