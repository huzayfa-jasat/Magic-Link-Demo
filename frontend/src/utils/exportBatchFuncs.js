// Dependencies
import { getExportUrls, getEnrichmentProgress } from "../api/batches";

// Constants
const POLLING_INTERVAL = 2000; // 2 seconds
const MAX_POLLING_TIME = 600000; // 10 minutes

// Export batch results using presigned URLs
export async function exportBatch({
  batchId,
  checkTyp,
  filter = 'all_emails',
  title,
  onProgress = () => {}
}) {
  try {
    // Map checkTyp to backend format
    const checkType = (checkTyp === 'verify' || checkTyp === 'deliverable') ? 'deliverable' : 'catchall';
    const exportType = filter || 'all_emails';
    
    // First, check if exports are available
    const exportResponse = await getExportUrls(checkType, batchId);
    
    if (exportResponse.data.status === 'processing') {
      // Exports are being generated, poll for progress
      onProgress({ status: 'processing', message: 'Generating export files...' });
      
      const startTime = Date.now();
      let progressData;
      
      while (Date.now() - startTime < MAX_POLLING_TIME) {
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
        
        // Check progress
        const progressResponse = await getEnrichmentProgress(checkType, batchId);
        progressData = progressResponse.data;
        
        if (progressData.status === 'completed') {
          // Export generation completed, fetch URLs
          const finalExportResponse = await getExportUrls(checkType, batchId);
          if (finalExportResponse.data.status === 'completed') {
            return downloadFromPresignedUrl(finalExportResponse.data.exports, exportType, title, checkTyp);
          }
          break;
        } else if (progressData.status === 'error') {
          throw new Error(progressData.errorMessage || 'Export Failed');
        } else if (progressData.status === 'processing') {
          // Update progress
          const percentage = progressData.totalRows > 0 
            ? Math.round((progressData.rowsProcessed / progressData.totalRows) * 100)
            : 0;
          onProgress({ 
            status: 'processing', 
            percentage,
            message: `Processing ${progressData.rowsProcessed} of ${progressData.totalRows} rows...`
          });
        }
      }
      
      if (Date.now() - startTime >= MAX_POLLING_TIME) {
        throw new Error('Export Failed');
      }
    } else if (exportResponse.data.status === 'completed') {
      // Exports are ready, download immediately
      return downloadFromPresignedUrl(exportResponse.data.exports, exportType, title, checkTyp);
    } else {
      // Exports not available
      throw new Error('Export Failed');
    }
  } catch (error) {
    console.error('Export failed:', error);
    throw new Error('Export Failed');
  }
}

// Download file from presigned URL
async function downloadFromPresignedUrl(exports, exportType, title, checkTyp) {
  const exportData = exports[exportType];
  
  if (!exportData || !exportData.url) {
    throw new Error(`Export type "${exportType}" is not available`);
  }
  
  // Create a temporary anchor element to trigger download
  const link = document.createElement('a');
  link.href = exportData.url;
  
  // Use the filename from the export data
  const filename = exportData.fileName;
  link.download = filename;
  
  // Append to body, click, and remove
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  return { 
    success: true, 
    fileName: filename,
    fileSize: exportData.size 
  };
}