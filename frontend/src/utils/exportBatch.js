// Dependencies
import { getVerifyBatchResults, getCatchallBatchResults } from "../api/batches";

// Constants
const FILTER_MAP = {
  'valid': 'deliverable',
  'invalid': 'undeliverable',
  'catch-all': 'catchall',
  'all': 'all',
  'good': 'good',
  'risky': 'risky',
  'bad': 'bad'
};

// Export batch results to CSV
export async function exportBatchToCSV({
  batchId,
  checkTyp,
  filter = 'all',
  title,
  onProgress = () => {}
}) {
  const ITEMS_PER_PAGE = 1000;
  let allResults = [];
  let page = 1;
  let done = false;

  try {
    // Fetch all pages of filtered results
    while (!done) {
      // Get response (no search / sort)
      let response;
      if (checkTyp === 'verify') {
        response = await getVerifyBatchResults(batchId, page, ITEMS_PER_PAGE, 'timehl', FILTER_MAP[filter] || 'all', '');
      } else if (checkTyp === 'catchall') {
        response = await getCatchallBatchResults(batchId, page, ITEMS_PER_PAGE, 'timehl', FILTER_MAP[filter] || 'all', '');
      }
      
      const pageResults = response.data.results || [];
      allResults = [...allResults, ...pageResults];

      // Update progress based on metadata
      const metadata = response.data.metadata;
      if (metadata) {
        const totalPages = Math.ceil(metadata.total_count / ITEMS_PER_PAGE);
        onProgress({ current: page, total: totalPages });
      }

      // Check if we have more pages using metadata
      if (!response.data.metadata?.has_more) {
        done = true;
      } else {
        page++;
      }
    }
  } catch (error) {
    console.error('Export failed:', error);
    throw error;
  }

  // Build CSV content from all filtered results
  let headers;
  if (checkTyp === 'verify') headers = ["Email", "Result", "Mail Server"];
  else if (checkTyp === 'catchall') headers = ["Email", "Deliverability"];

  // Build CSV content
  const csvContent = [
    headers.join(","),
    ...allResults.map((item) => {
      // Map result values: 1=deliverable, 2=catchall, 0=undeliverable
      let resultText;
      if (checkTyp === 'verify') {
        if (item.result === 1) resultText = "Valid";
        else if (item.result === 2) resultText = "Catch-All";
        else resultText = "Invalid";

        // Return CSV row
        return [ item.email, resultText, item.provider || "" ].join(",");

      } else if (checkTyp === 'catchall') {
        if (item.score === 'good') resultText = "Good";
        else if (item.score === 'risky') resultText = "Risky";
        else if (item.score === 'bad') resultText = "Bad";
        else resultText = "Unknown";

        // Return CSV row
        return [ item.email, resultText ].join(",");
      }
    }),
  ].join("\n");

  // Create and trigger download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  // Generate filename based on filter type
  const batchName = title || batchId;
  let prefix;
  if (filter === 'valid') prefix = 'Valid_Only';
  else if (filter === 'invalid') prefix = 'Invalid_Only';
  else if (filter === 'catch-all') prefix = 'Catchall_Only';
  else if (filter === 'good') prefix = 'Good_Only';
  else if (filter === 'risky') prefix = 'Risky_Only';
  else if (filter === 'bad') prefix = 'Bad_Only';
  else prefix = 'All_Emails';
  const filename = `${(checkTyp === "catchall" ? "Catchall_" : "")}${prefix}_OmniVerifier_${batchName}.csv`;

  // Download file
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Return
  return { success: true, recordCount: allResults.length };
}