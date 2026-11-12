import type {
  DocumentArithmeticVerification,
  DocumentFileFormat,
  DocumentTargetType,
  ExtractedFieldConfidence,
  ExtractedLineItem,
} from '../document-parser.util.js';

export interface DuplicateMatchWarning {
  matchType: 'FILE_CHECKSUM' | 'DOCUMENT_NUMBER' | 'SIMILAR_RECORD';
  recordId: string;
  documentNumber: string | null;
  counterpartyName: string | null;
  issueDate: string | null;
  totalAmount: string | null;
  currency?: string | null;
  status: string | null;
  reason: string;
}

export interface PreviousExtractionInfo {
  previouslyExtracted: boolean;
  extractionCount: number;
  lastExtractedAt: string | null;
  message: string;
}

export interface DuplicateWarningsReport {
  hasPotentialDuplicate: boolean;
  checksumMatched: boolean;
  documentNumberConflict: boolean;
  similarRecordMatch: boolean;
  previouslyExtractedNotSaved: boolean;
  previousExtractionInfo: PreviousExtractionInfo | null;
  matches: DuplicateMatchWarning[];
}

export type DocumentExtractionMethod =
  | 'PDF_EMBEDDED_TEXT'
  | 'PDF_SCANNED_OCR'
  | 'IMAGE_OCR'
  | 'MULTIMODAL_VISION_AI'
  | 'OCR_AND_VISION_AI';

export interface DocumentImportExtractionResponse {
  success: boolean;
  savedToDatabase: false;
  ledgerMutationPerformed: false;
  documentType: DocumentTargetType;
  fileMetadata: {
    fileName: string;
    mimeType: string;
    detectedFormat: DocumentFileFormat;
    sizeBytes: number;
    checksumSha256: string;
  };
  extractionMetadata: {
    extractionMethod: DocumentExtractionMethod;
    extractedCharCount: number;
    pageCount: number | null;
    ocrConfidence: number | null;
    provider: string;
    externalVisionConfigured: boolean;
    warnings: string[];
    limitations: string[];
  };
  extractedTextPreview: string;
  extractedDocument: {
    documentType: DocumentTargetType;
    documentNumber: string | null;
    counterpartyName: string | null;
    counterpartyEmail: string | null;
    category: string;
    department: string | null;
    issueDate: string | null;
    dueDate: string | null;
    currency: string;
    currencySource: 'DOCUMENT' | 'ORGANIZATION_DEFAULT';
    subtotalAmount: string | null;
    taxRate: string | null;
    taxAmount: string | null;
    totalAmount: string | null;
    notes: string | null;
  };
  lineItems: ExtractedLineItem[];
  fieldConfidence: ExtractedFieldConfidence;
  arithmeticVerification: DocumentArithmeticVerification;
  duplicateWarnings: DuplicateWarningsReport;
  sanitizationFlags: string[];
  aiOrchestration: {
    workflowRunId: string;
    taskClassification: string;
    durationMs: number;
    isApproved: boolean;
    requiresHumanReview: boolean;
    validationErrors: string[];
    confidenceScore: number;
  };
}
