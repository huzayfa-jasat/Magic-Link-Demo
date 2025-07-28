// Dependencies
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';

// API Imports
import { 
  createVerifyBatch, 
  createCatchallBatch,
  startVerifyBatchProcessing,
  startCatchallBatchProcessing 
} from '../../api/batches';

// Component Imports
import { LoadingCircle } from '../../ui/components/LoadingCircle';
import CreditsModal from '../../ui/components/CreditsModal';
import UploadStageFileUpload from './UploadStages/FileUpload';
import UploadStageColumnSelect from './UploadStages/ColumnSelect';
import UploadStagePreview from './UploadStages/Preview';
import UploadStageFinalize from './UploadStages/Finalize';

// Style Imports
import styles from './styles/Emails.module.css';

// Main Component
export default function EmailsUploadController() {
  const navigate = useNavigate();

  // States
  const [page, setPage] = useState('upload');
  const [file, setFile] = useState(null);
  const [fileData, setFileData] = useState({ headers: [], rows: [] });
  const [selectedColumnIndex, setSelectedColumnIndex] = useState(null);
  const [emails, setEmails] = useState([]);
  const [error, setError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [creditsModalType, setCreditsModalType] = useState('verify');

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

    // Check file size (10MB limit)
    const maxFileSize = 10 * 1024 * 1024; // 10MB in bytes
    if (selectedFile.size > maxFileSize) {
      setError('File size must be less than 10MB. Please reduce the file size and try again.');
      return;
    }

    try {
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
      setPage('columnSelect');

    } catch (err) {
      setError(err.message);
      setFile(null);
      setFileData({ headers: [], rows: [] });
    }
  }, [parseCSV, parseExcel]);

  // Handle upload
  const handleUpload = async (checkTyp) => {
    if (!emails.length || !file) return;

    setIsUploading(true);
    setError(null);

    try {
      const fileName = file.name || "New Upload";

      // Step 1: Create draft batch
      let createResponse;
      if (checkTyp === 'verify') {
        createResponse = await createVerifyBatch(emails, fileName);
      } else if (checkTyp === 'catchall') {
        createResponse = await createCatchallBatch(emails, fileName);
      } else {
        throw new Error('Invalid upload type');
      }

      if (createResponse.status !== 200) throw new Error(createResponse.data.message);
      
      const batchId = createResponse.data.id;
      
      // Step 2: Start batch processing
      let startResponse;
      if (checkTyp === 'verify') {
        startResponse = await startVerifyBatchProcessing(batchId);
      } else {
        startResponse = await startCatchallBatchProcessing(batchId);
      }

      if (startResponse.status !== 200) throw new Error(startResponse.data.message);

      // Navigate to home after successful upload and start
      navigate(`/home`);

    } catch (err) {
      // Check if it's a credits error
      if (err.response && err.response.status === 400 && err.response.data && err.response.data.includes('credits')) {
        setCreditsModalType(checkTyp);
        setShowCreditsModal(true);
      } else {
        setError('Failed to upload emails. Please try again.');
      }
      console.error('Upload error:', err);

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
  };

  // Render
  return (
    <>
      {(isUploading) && <LoadingCircle showBg={true} /> }
      <CreditsModal 
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        checkType={creditsModalType}
      />
      <div className={styles.uploadContainer}>
        <h1 className={styles.title}>
          {(page === 'upload') && 'Upload File'}
          {(page === 'columnSelect') && 'Select Emails'}
          {(page === 'finalize') && 'Choose Validation'}
        </h1>
        <br/>
        {(page === 'upload') && (
          <UploadStageFileUpload
            error={error}
            handleFileChange={handleFileChange}
          />
        )}
        {(page === 'columnSelect') && (
          <UploadStageColumnSelect
            fileName={file.name || "New Upload"}
            headers={fileData.headers}
            sampleData={fileData.rows}
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