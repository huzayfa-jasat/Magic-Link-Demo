import { useState, useEffect, useCallback } from "react";
import {
  getVerifyBatchDetails,
  getVerifyBatchResults,
} from "../../../api/batches";
import  useDebounce  from "./useDebounce";

const ITEMS_PER_PAGE = 50;

/**
 * Custom hook for managing batch data, pagination, and search
 * @param {string} id - The batch ID
 * @returns {object} - Object containing state and handlers
 */

export default function useBatchData(id) {
  // State
  const [details, setDetails] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Debounced search query (0.5 second delay as per user preference)
  const debouncedSearchQuery = useDebounce(searchQuery, 500);

  // Fetch batch details
  const fetchDetails = useCallback(async () => {
    try {
      const response = await getVerifyBatchDetails(id);
      setDetails(response.data);
      return true;
    } catch (err) {
      setError("Failed to load batch details");
      console.error("Error fetching details:", err);
      return false;
    }
  }, [id]);

  // Fetch paginated results
  const fetchResults = useCallback(
    async (page, search = "", append = false) => {
      if (!details) return;

      if (append) {
        setLoadingMore(true);
      } else {
        setResultsLoading(true);
      }
      
      try {
        const response = await getVerifyBatchResults(
          id,
          page,
          ITEMS_PER_PAGE,
          'timehl',
          'all',
          search
        );
        
        const resultData = response.data.results || [];
        
        if (append) {
          setResults(prev => [...prev, ...resultData]);
        } else {
          setResults(resultData);
        }
        
        // Use metadata from new API for pagination
        if (response.data.metadata) {
          setTotalPages(response.data.metadata.total_pages);
          setHasMore(response.data.metadata.has_more);
        } else {
          // Fallback calculation
          setTotalPages(Math.ceil(details.emails / ITEMS_PER_PAGE));
          setHasMore(page < Math.ceil(details.emails / ITEMS_PER_PAGE));
        }
        
        return true;
      } catch (err) {
        setError("Failed to load results");
        console.error("Error fetching results:", err);
        if (!append) {
          setResults([]);
        }
        return false;
      } finally {
        setResultsLoading(false);
        setLoadingMore(false);
        setLoading(false);
      }
    },
    [id, details]
  );

  // Load more results for infinite scroll
  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && !resultsLoading) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      fetchResults(nextPage, debouncedSearchQuery, true);
    }
  }, [currentPage, debouncedSearchQuery, fetchResults, hasMore, loadingMore, resultsLoading]);

  // Reset page and results when search changes
  useEffect(() => {
    setCurrentPage(1);
    setResults([]);
    setHasMore(true);
  }, [debouncedSearchQuery]);

  // Load details on mount
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

  // Load results when details are loaded and page or search changes
  useEffect(() => {
    if (details && !error) {
      fetchResults(currentPage, debouncedSearchQuery);
    }
  }, [details, currentPage, debouncedSearchQuery, fetchResults, error]);

  // Calculate result statistics
  const stats = (results || []).reduce(
    (acc, item) => {
      // Map new result format: 1=deliverable, 2=catchall, 0=undeliverable
      if (item.result === 1) {
        acc.valid = (acc.valid || 0) + 1;
      } else if (item.result === 2) {
        acc.catchall = (acc.catchall || 0) + 1;
      } else if (item.result === 0) {
        acc.invalid = (acc.invalid || 0) + 1;
      } else {
        acc.pending = (acc.pending || 0) + 1;
      }
      return acc;
    },
    {
      valid: 0,
      invalid: 0,
      catchall: 0,
      pending: 0,
    }
  );

  return {
    // State
    details,
    results,
    loading,
    resultsLoading,
    loadingMore,
    hasMore,
    error,
    currentPage,
    totalPages,
    searchQuery,
    stats,
    
    // Handlers
    setCurrentPage,
    setSearchQuery,
    loadMore,
    
    // Functions for potential external use
    refetchDetails: fetchDetails,
    refetchResults: () => fetchResults(currentPage, debouncedSearchQuery),
  };
}
