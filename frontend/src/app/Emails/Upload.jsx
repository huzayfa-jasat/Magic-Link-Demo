// Dependencies
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';

// API Imports
import { 
  createNewVerifyBatch,
  createNewCatchallBatch,
  addToVerifyBatch,
  addToCatchallBatch,
  startVerifyBatchProcessing,
  startCatchallBatchProcessing,
  checkDuplicateFilename,
  getS3UploadUrl,
  completeS3Upload
} from '../../api/batches';

// Context Imports
import { useCreditsContext } from '../../context/useCreditsContext';

// Component Imports
import { LoadingCircle } from '../../ui/components/LoadingCircle';
import CreditsModal from '../../ui/components/CreditsModal';
import DuplicateFileModal from './components/DuplicateFileModal';
import UploadStageFileUploadWithColumn from './UploadStages/FileUploadWithColumn';
import UploadStageFinalize from './UploadStages/Finalize';

// Style Imports
import styles from './styles/Emails.module.css';

// Constants
const CHUNK_SIZE = 10000;

// Main Component
export default function EmailsUploadController() {
  const navigate = useNavigate();
  const { updateEmailBalance, updateCatchallBalance } = useCreditsContext();

  // States
  const [page, setPage] = useState('upload');
  const [file, setFile] = useState(null);
  const [fileData, setFileData] = useState({ headers: [], rows: [] });
  const [selectedColumnIndex, setSelectedColumnIndex] = useState(null);
  const [emails, setEmails] = useState([]);
  const [error, setError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [creditsModalType, setCreditsModalType] = useState('verify');
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);

  // Handle parsing CSV
  const parseCSV = useCallback((text) => {
    try {
      // Split by newlines and filter out empty lines
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      
      if (lines.length === 0) {
        throw new Error('File is empty');
      }
      
      // Parse all rows
      const rows = lines.map(line => {
        // Simple CSV parsing - handles basic comma separation and quoted values
        const columns = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          
          if (char === '"' || char === "'") {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            columns.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        columns.push(current.trim());
        
        return columns;
      });
      
      // Extract headers from first row
      const headers = rows[0] || [];
      const dataRows = rows.slice(1);
      
      return { headers, rows: dataRows };
    } catch (err) {
      console.log("ERR = ", err);
      throw new Error('Failed to parse CSV file.');
    }
  }, []);

  // Handle parsing Excel
  const parseExcel = useCallback((buffer) => {
    try {
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Convert sheet to JSON array
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (data.length === 0) {
        throw new Error('File is empty');
      }
      
      // Extract headers from first row
      const headers = data[0]?.map(h => h?.toString() || '') || [];
      const dataRows = data.slice(1).map(row => 
        row.map(cell => cell?.toString() || '')
      );
      
      return { headers, rows: dataRows };
    } catch (err) {
      console.log("ERR = ", err);
      throw new Error('Failed to parse Excel file.');
    }
  }, []);

  // Handle file change
  const handleFileChange = useCallback(async (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    const fileType = selectedFile.type;
    const fileName = selectedFile.name.toLowerCase();
    
    // Check if file is CSV or Excel
    const isCSV = fileType === 'text/csv' || fileName.endsWith('.csv');
    const isExcel = fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                    fileType === 'application/vnd.ms-excel' || 
                    fileName.endsWith('.xlsx') || 
                    fileName.endsWith('.xls');
    
    if (!isCSV && !isExcel) {
      setError('Please upload a CSV or Excel file (.csv, .xlsx, .xls)');
      return;
    }

    // Check file size (50MB limit)
    const maxFileSize = 50 * 1024 * 1024; // 50MB in bytes
    if (selectedFile.size > maxFileSize) {
      setError('File size must be less than 50MB. Please reduce the file size and try again.');
      return;
    }

    // Show loading while processing file
    setIsProcessingFile(true);
    setError(null);

    try {
      // Check for duplicate filename first
      try {
        const response = await checkDuplicateFilename(selectedFile.name);
        if (response.data.is_duplicate) {
          // Store the file temporarily and show duplicate modal
          setPendingFile(selectedFile);
          setShowDuplicateModal(true);
          setIsProcessingFile(false);
          return;
        }
      } catch (err) {
        console.log('Error checking duplicate:', err);
        // Continue anyway if check fails
      }

      let parsedData;
      
      if (isCSV) {
        const text = await selectedFile.text();
        parsedData = parseCSV(text);
      } else if (isExcel) {
        const buffer = await selectedFile.arrayBuffer();
        parsedData = parseExcel(buffer);
      }
      
      if (parsedData.rows.length === 0) {
        throw new Error('No data found in the file');
      }

      setFile(selectedFile);
      setFileData(parsedData);
      setError(null);
      // Stay on upload page to show combined view

    } catch (err) {
      setError(err.message);
      setFile(null);
      setFileData({ headers: [], rows: [] });
    } finally {
      setIsProcessingFile(false);
    }
  }, [parseCSV, parseExcel]);

  // Handle upload with new 3-step flow: /new, /add, /start
  const handleUpload = async (checkTyp) => {
    if (!emails.length || !file) return;

    setIsUploading(true);
    setError(null);

    try {
      const fileName = file.name || "New Upload";
      
      // Step 1: Create new batch with email count estimate (/new endpoint)
      let createResponse;
      if (checkTyp === 'verify') createResponse = await createNewVerifyBatch(emails.length, fileName);
      else if (checkTyp === 'catchall') createResponse = await createNewCatchallBatch(emails.length, fileName);
      else throw new Error('Invalid upload type');
      
      if (createResponse.status !== 200) throw createResponse;
      const batchId = createResponse.data.id;

      // Step 2: Upload original file to S3
      try {
        // Get pre-signed upload URL
        const checkTypeParam = checkTyp === 'verify' ? 'deliverable' : 'catchall';
        const uploadUrlResponse = await getS3UploadUrl(
          checkTypeParam,
          batchId,
          file.name,
          file.size,
          file.type
        );
        
        if (uploadUrlResponse.status !== 200) throw uploadUrlResponse;
        
        // Upload directly to S3
        const uploadResponse = await fetch(uploadUrlResponse.data.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type
          }
        });
        
        if (!uploadResponse.ok) {
          throw new Error('Failed to upload file to S3');
        }
        
        // Store S3 key reference with column mapping
        const s3CompleteResponse = await completeS3Upload(
          checkTypeParam,
          batchId,
          uploadUrlResponse.data.s3Key,
          { email: selectedColumnIndex },
          {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type
          }
        );
        
        if (s3CompleteResponse.status !== 200) throw s3CompleteResponse;
        
      } catch (s3Error) {
        console.error("S3 Upload Error:", s3Error);
        // S3 upload failure is not critical - continue with batch processing
      }

      // Step 3: Add all emails in chunks using /add endpoint
      for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
        const chunk = emails.slice(i, i + CHUNK_SIZE);
        
        try {
          let addResponse;
          if (checkTyp === 'verify') addResponse = await addToVerifyBatch(batchId, chunk);
          else addResponse = await addToCatchallBatch(batchId, chunk);
          if (addResponse.status !== 200) throw addResponse;
        } catch (chunkError) {
          console.log("CHUNK ERROR = ", chunkError);
          // If this is a 402 status code (insufficient credits), show credits modal
          if (chunkError.status === 402) {
            setCreditsModalType(checkTyp);
            setShowCreditsModal(true);
            return;
          }
          // Re-throw other errors to be handled by outer catch
          throw chunkError;
        }
      }

      // Step 4: Start batch processing (/start endpoint)
      let startResponse;
      if (checkTyp === 'verify') startResponse = await startVerifyBatchProcessing(batchId);
      else startResponse = await startCatchallBatchProcessing(batchId);
      if (startResponse.status !== 200) throw startResponse;

      // Update the appropriate credit balance based on checkType
      if (startResponse.data && startResponse.data.remaining_balance !== undefined) {
        if (checkTyp === 'verify') {
          updateEmailBalance(startResponse.data.remaining_balance);
        } else if (checkTyp === 'catchall') {
          updateCatchallBalance(startResponse.data.remaining_balance);
        }
      }

      // Navigate to home after successful upload and start
      navigate(`/validate`);

    } catch (err) {
      // Check if it's a 402 status code (insufficient credits)
      if (err.status === 402) {
        setCreditsModalType(checkTyp);
        setShowCreditsModal(true);
      } else {
        // Other errors show generic message
        setError(err.message || 'Failed to upload emails. Please try again.');
      }

    } finally {
      setIsUploading(false);
    }
  };

  // Handle column selection
  const handleColumnSelect = useCallback((columnIndex) => {
    try {
      // Extract emails from selected column
      const extractedEmails = fileData.rows
        .map(row => row[columnIndex]?.trim() || '')
        .filter(email => email);
      
      if (extractedEmails.length === 0) {
        throw new Error('No emails found in the selected column');
      }
      
      setSelectedColumnIndex(columnIndex);
      setEmails(extractedEmails);
      setError(null);
      setPage('finalize');
    } catch (err) {
      setError(err.message);
    }
  }, [fileData]);

  // Handle remove file
  const handleRemoveFile = () => {
    setFile(null);
    setFileData({ headers: [], rows: [] });
    setSelectedColumnIndex(null);
    setEmails([]);
    setError(null);
    setPage('upload');
    setPendingFile(null);
  };

  // Handle duplicate modal confirm
  const handleDuplicateConfirm = useCallback(async () => {
    if (pendingFile) {
      setShowDuplicateModal(false);
      setIsProcessingFile(true);
      
      try {
        let parsedData;
        const isCSV = pendingFile.type === 'text/csv' || pendingFile.name.toLowerCase().endsWith('.csv');
        const isExcel = pendingFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                        pendingFile.type === 'application/vnd.ms-excel' || 
                        pendingFile.name.toLowerCase().endsWith('.xlsx') || 
                        pendingFile.name.toLowerCase().endsWith('.xls');
        
        if (isCSV) {
          const text = await pendingFile.text();
          parsedData = parseCSV(text);
        } else if (isExcel) {
          const buffer = await pendingFile.arrayBuffer();
          parsedData = parseExcel(buffer);
        }
        
        if (parsedData.rows.length === 0) {
          throw new Error('No data found in the file');
        }

        setFile(pendingFile);
        setFileData(parsedData);
        setError(null);
        setPendingFile(null);
      } catch (err) {
        setError(err.message);
        setFile(null);
        setFileData({ headers: [], rows: [] });
        setPendingFile(null);
      } finally {
        setIsProcessingFile(false);
      }
    }
  }, [pendingFile, parseCSV, parseExcel]);

  // Handle duplicate modal cancel
  const handleDuplicateCancel = useCallback(() => {
    setShowDuplicateModal(false);
    setPendingFile(null);
    // Clear the file input
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      fileInput.value = '';
    }
  }, []);

  // Render
  return (
    <>
      {(isUploading || isProcessingFile) && <LoadingCircle showBg={true} /> }
      <CreditsModal 
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        checkType={creditsModalType}
      />
      <DuplicateFileModal 
        isOpen={showDuplicateModal}
        onClose={handleDuplicateCancel}
        onConfirm={handleDuplicateConfirm}
      />
      <div className={styles.uploadContainer}>
        <h1 className={styles.title}>
          {(page === 'upload') && 'Upload List'}
          {(page === 'finalize') && 'Choose Validation'}
        </h1>
        {(page === 'upload') && (
          <p className={styles.subtitle}>
            We automatically find & remove duplicates and non-email entries from your list.
          </p>
        )}
        {(page === 'upload') && (
          <UploadStageFileUploadWithColumn
            error={error}
            handleFileChange={handleFileChange}
            file={file}
            fileData={fileData}
            handleColumnSelect={handleColumnSelect}
            handleCancel={handleRemoveFile}
          />
        )}
        {(page === 'finalize') && (
          <UploadStageFinalize
            emailCount={emails.length}
            handleVerifyUpload={()=>{handleUpload('verify')}}
            handleCatchallUpload={()=>{handleUpload('catchall')}}
          />
        )}
      </div>
    </>
  );
}