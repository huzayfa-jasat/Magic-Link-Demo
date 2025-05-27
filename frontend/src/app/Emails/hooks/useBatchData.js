import { useState, useEffect, useCallback } from "react";
import {
  getVerifyRequestDetails,
  getPaginatedVerifyRequestResults,
} from "../../../api/emails";
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
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Debounced search query (0.5 second delay as per user preference)
  const debouncedSearchQuery = useDebounce(searchQuery, 500);

  // Fetch batch details
  const fetchDetails = useCallback(async () => {
    try {
      const response = await getVerifyRequestDetails(id);
      setDetails(response.data.data);
      return true;
    } catch (err) {
      setError("Failed to load batch details");
      console.error("Error fetching details:", err);
      return false;
    }
  }, [id]);

  // Fetch paginated results
  const fetchResults = useCallback(
    async (page, search = "") => {
      if (!details) return;

      try {
        const response = await getPaginatedVerifyRequestResults(
          id,
          page,
          ITEMS_PER_PAGE,
          search
        );
        const resultData = response.data.data || [];
        setResults(resultData);
        
        // If we're searching, calculate total pages based on whether we got full page
        // If we got less than ITEMS_PER_PAGE, we're on the last page
        if (search && search.trim()) {
          if (resultData.length < ITEMS_PER_PAGE) {
            // This is the last page for search results
            setTotalPages(page);
          } else {
            // We don't know total pages yet, but there's at least one more page
            // This is a limitation without backend total count for searches
            setTotalPages(page + 1);
          }
        } else {
          // No search - use the original total count
          setTotalPages(Math.ceil(details.num_contacts / ITEMS_PER_PAGE));
        }
        
        return true;
      } catch (err) {
        setError("Failed to load results");
        console.error("Error fetching results:", err);
        setResults([]);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [id, details]
  );

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
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

  return {
    // State
    details,
    results,
    loading,
    error,
    currentPage,
    totalPages,
    searchQuery,
    stats,
    
    // Handlers
    setCurrentPage,
    setSearchQuery,
    
    // Functions for potential external use
    refetchDetails: fetchDetails,
    refetchResults: () => fetchResults(currentPage, debouncedSearchQuery),
  };
}
