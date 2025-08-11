// Dependencies
import { useCallback, useEffect, useState, useContext } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";

// Utility Imports
import { exportBatch } from "../../utils/exportBatchFuncs";

// API Imports
import { verifyDeliverableBatchCatchalls } from "../../api/batches";

// Context Imports
import { ErrorContext } from "../../ui/Context/ErrorContext";

// Component Imports
import { LoadingCircle } from "../../ui/components/LoadingCircle";
import DetailStats from "./components/DetailStats";
import ResultsTable from "./components/ResultsTable";
import ExportPopupMenu from "./components/ExportPopupMenu";
import ExportLoadingModal from "./components/ExportLoadingModal";
import CreditsModal from "../../ui/components/CreditsModal";

// Hook Imports
import useBatchData from "./hooks/useBatchData";

// Icon Imports
import {
  BACK_ICON, SEARCH_ICON, VERIFY_CATCHALL_ICON,
} from "../../assets/icons";

// Style Imports
import styles from "./styles/Emails.module.css";


// Main Component
export default function EmailsBatchDetailsController({
  checkTyp,
}) {
  const { id } = useParams();
  const errorContext = useContext(ErrorContext);
  const navigate = useNavigate();

  // States
  const [showCreditsModal, setShowCreditsModal] = useState(false);
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

  // Verify catchalls handler
  const handleVerifyCatchalls = useCallback(async () => {
    try {
      const response = await verifyDeliverableBatchCatchalls(id);
      if (response.status === 200) navigate(`/validate`);
      else if (response.status === 402) setShowCreditsModal(true);
      else errorContext.showError();
    } catch (error) {
      console.error('Error creating catchall verification batch:', error);
    }
  }, [id, navigate]);

  // Infinite scroll detection
  const handleScroll = useCallback(() => {
    const scrollPosition = window.innerHeight + document.documentElement.scrollTop;
    const threshold = document.documentElement.offsetHeight - 500;
    
    if (scrollPosition >= threshold && hasMore && !loadingMore && !resultsLoading) {
      loadMore();
    }
  }, [hasMore, loadingMore, resultsLoading, loadMore]);
  
  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Export filtered results using presigned URLs
  const handleExportFiltered = useCallback(
    async (filter, title) => {
      // Show loading modal
      setIsExporting(true);
      setExportProgress({ status: 'starting', message: 'Preparing export...' });

      try {
        await exportBatch({
          batchId: id,
          checkTyp,
          filter,
          title: title || details?.title,
          onProgress: setExportProgress
        });
      } catch (error) {
        console.error('Export failed:', error);
        setExportProgress({ status: 'error' });
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

  console.log("CHECK TYP = ", checkTyp);
  console.log("STATS = ", details.stats);

  // Main Render - batch details page
  return (
    <>
      {/* Export Loading Modal */}
      <ExportLoadingModal 
        isOpen={isExporting} 
        progress={exportProgress} 
      />

      {/* Credits Modal */}
      <CreditsModal 
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        checkType={'catchall'}
      />

      {/* Details Container */}
      <div className={styles.detailsContainer}>
        {/* Navigation back to home */}
        <Link to="/validate" className={styles.backLink}>
          {BACK_ICON}
          Go Back
        </Link>

        {/* Page header with title and export dropdown */}
        <div className={styles.detailsHeader}>
          <h1 className={styles.detailsTitle}>{details.title ?? "Details"}</h1>
          <div className={styles.detailsActions}>
            <ExportPopupMenu
              title={details.title}
              checkTyp={checkTyp}
              handleExport={handleExportFiltered}
              showValid={details.stats.valid} showInvalid={details.stats.invalid} showCatchall={details.stats.catchall}
              showGood={details.stats.good} showRisky={details.stats.risky} showBad={details.stats.bad}
            />
          </div>
        </div>

        <p className={styles.subtitle}>We automatically find & remove duplicates and non-email entries from your list.</p>

        {/* Search input for filtering results */}
        <div className={styles.searchRow}>
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
          {((checkTyp === 'deliverable' || checkTyp === 'verify') && details.stats.catchall > 0) && (
            <button 
              className={`${styles.button} ${styles.buttonCatchall} ${styles.noMobile}`}
              onClick={handleVerifyCatchalls}
            >
              {VERIFY_CATCHALL_ICON}
              Verify all Catch-Alls
            </button>
          )}
        </div>

        {/* Statistics cards showing batch summary */}
        <DetailStats
          checkTyp={checkTyp}
          valid={details.stats.valid} invalid={details.stats.invalid} catchall={details.stats.catchall}
          good={details.stats.good} risky={details.stats.risky} bad={details.stats.bad}
          handleVerifyCatchalls={handleVerifyCatchalls}
        />

        {/* Results table */}
        <div className={styles.tableContainer}>
          {(resultsLoading) ? (
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
      </div>
    </>
  );
}
