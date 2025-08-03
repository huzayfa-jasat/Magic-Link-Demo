// Dependencies
import { useCallback, useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import Popup from "reactjs-popup";

// Utility Imports
import { exportBatchToCSV } from "../../utils/exportBatch";

// Component Imports
import { LoadingCircle } from "../../ui/components/LoadingCircle";
import DetailStats from "./components/DetailStats";
import ResultsTable from "./components/ResultsTable";
import ExportPopupMenu from "./components/ExportPopupMenu";
import ExportLoadingModal from "./components/ExportLoadingModal";

// Hook Imports
import useBatchData from "./hooks/useBatchData";

// Icon Imports
import {
  BACK_ICON, SEARCH_ICON,
} from "../../assets/icons";

// Style Imports
import styles from "./styles/Emails.module.css";


// Main Component
export default function EmailsBatchDetailsController({
  checkTyp,
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // Export loading state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });

  // Use custom hook for all batch data management
  const {
    details,
    results,
    loading,
    resultsLoading,
    loadingMore,
    hasMore,
    error,
    searchQuery,
    setSearchQuery,
    loadMore,
  } = useBatchData(id, checkTyp);

  // Check if batch is completed and navigate back if not
  useEffect(() => {
    if (details && details.status !== 'completed' && details.status !== 'complete') {
      navigate('/validate');
    }
  }, [details, navigate]);

  // Infinite scroll detection
  const handleScroll = () => {
    if (
      window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 500 && // 500px before bottom
      hasMore && !loadingMore && !resultsLoading
    ) loadMore();
  };
  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasMore, loadingMore, resultsLoading, loadMore]);

  // Export filtered results to CSV (uses shared utility)
  const handleExportFiltered = useCallback(
    async (filter, title) => {
      // Show loading modal
      setIsExporting(true);
      setExportProgress({ current: 0, total: 0 });

      try {
        await exportBatchToCSV({
          batchId: id,
          checkTyp,
          filter,
          title: title || details?.title,
          onProgress: setExportProgress
        });
      } catch (error) {
        console.error('Export failed:', error);
      } finally {
        setIsExporting(false);
      }
    },
    [id, checkTyp, details?.title]
  );

  // Loading state
  if (loading) {
    return (
      <div className={styles.container}>
        <LoadingCircle relative={true} showBg={false} />
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
          <p className={styles.emptyText}>Not found</p>
          <p className={styles.emptySubtext}>
            The requested list could not be found.
          </p>
        </div>
      </div>
    );
  }

  // Main render - batch details page
  return (
    <div className={styles.detailsContainer}>
      {/* Navigation back to home */}
      <Link to="/validate" className={styles.backLink}>
        {BACK_ICON}
        Go Back
      </Link>

      {/* Page header with title and export dropdown */}
      <div className={styles.detailsHeader}>
        <h1 className={styles.detailsTitle}>{details.title ?? "Details"}</h1>
        {(checkTyp === 'verify') && (
          <ExportPopupMenu
            title={details.title}
            handleExport={handleExportFiltered}
            showValid={details.stats.valid}
            showInvalid={details.stats.invalid}
            showCatchall={details.stats.catchall}
          />
        )}
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
        {SEARCH_ICON}
      </div>

      {/* Statistics cards showing batch summary */}
      {(checkTyp === 'verify') && (
        <DetailStats
          valid={details.stats.valid}
          invalid={details.stats.invalid}
          catchall={details.stats.catchall}
        />
      )}

      {/* Results table */}
      <div className={styles.tableContainer}>
        {resultsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <LoadingCircle relative={true} />
          </div>
        ) : (
          <ResultsTable typ={checkTyp} results={results} />
        )}
      </div>

      {/* Infinite scroll loading indicator */}
      {(loadingMore) && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <LoadingCircle relative={true} />
        </div>
      )}
      
      {/* End of results indicator */}
      {/* {(!hasMore && results.length > 0) && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem', color: '#666' }}>
          <p>No more results to load</p>
        </div>
      )} */}
      
      {/* Export Loading Modal */}
      <ExportLoadingModal 
        isOpen={isExporting} 
        progress={exportProgress} 
      />
    </div>
  );
}
