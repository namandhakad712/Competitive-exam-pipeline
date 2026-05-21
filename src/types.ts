export type Exam = string; // Any exam identifier � previously a fixed union of "jeemain" | "neet" | "jeeadv" | "ncert-exemplar"

export type Subject = "physics" | "chemistry" | "mathematics" | "biology";

export type QuestionType = "mcq" | "msq" | "nat" | "assertion-reason";

export type SourceType =
  | "official-pdf"
  | "reconstructed"
  | "imported-kaggle"
  | "imported-dataset";

export type Difficulty = "easy" | "medium" | "hard";

export type SolutionFormat = "plain" | "html" | "markdown" | "latex";

export type PrecisionType = "exact" | "integer-range" | "decimal-range";

export type Confidence = "high" | "medium" | "low";

export type Severity = "error" | "warning" | "info";

export type VerificationStatus = "unverified" | "verified" | "needs-review";

// ---------------------------------------------------------------------------
// SectionConfig
// ---------------------------------------------------------------------------
export interface SectionConfig {
  label: string;
  total: number;
  required: number;
  mandatory: boolean;
}

// ---------------------------------------------------------------------------
// Diagram
// ---------------------------------------------------------------------------
export interface Diagram {
  file: string;
  label: string | null;
  caption: string | null;
}

// ---------------------------------------------------------------------------
// AnswerPrecision
// ---------------------------------------------------------------------------
export interface AnswerPrecision {
  type: PrecisionType;
  value?: string;
  min?: number;
  max?: number;
  unit?: string;
}

// ---------------------------------------------------------------------------
// Passage
// ---------------------------------------------------------------------------
export interface Passage {
  id: string;
  text: string;
  textHi: string | null;
  diagrams: Diagram[] | null;
  questions: string[];
}

// ---------------------------------------------------------------------------
// Question
// ---------------------------------------------------------------------------
export interface Question {
  id: string;
  number: number;
  numberLabel: string | null;
  subject: Subject;
  topic: string;
  section: string | null;
  type: QuestionType;
  text: string;
  textHi: string | null;
  options: string[] | null;
  answer: string;
  answers: string[] | null;
  answerPrecision: AnswerPrecision | null;
  marks: number;
  negativeMarks: number;
  passageId: string | null;
  solution: string | null;
  solutionFormat: SolutionFormat | null;
  hasDiagram: boolean;
  diagrams: Diagram[] | null;
  difficulty: Difficulty | null;
  tags: string[];
  revision: number;
  source: SourceType;
  confidence: Confidence | null;
}

// ---------------------------------------------------------------------------
// Provenance — digital signature for origin verification
// ---------------------------------------------------------------------------
export interface Provenance {
  author: string;
  repo: string;
  license: string;
  pipelineVersion: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// QuestionFile — top-level wrapper
// ---------------------------------------------------------------------------
export interface QuestionFile {
  schema: string;
  exam: Exam;
  year: number | null;
  shift: string | null;
  paper: string | null;
  subjects: Subject[];
  total: number;
  duration: number;
  marksCorrect: number;
  marksIncorrect: number;
  marksUnanswered: number;
  sections: Record<string, SectionConfig>;
  scrapedAt: string;
  answerKeyFound: boolean;
  checksum: string;
  provenance: Provenance;
  questions: Question[];
  passages: Passage[];
}

// ---------------------------------------------------------------------------
// PartialQuestion — before ID assignment and normalization
// ---------------------------------------------------------------------------
export interface PartialQuestion {
  number: number;
  numberLabel: string | null;
  subject: Subject;
  topic: string | null;
  section: string | null;
  type: QuestionType;
  text: string;
  textHi: string | null;
  options: string[] | null;
  answer: string | null;
  answers: string[] | null;
  answerPrecision: AnswerPrecision | null;
  marks: number;
  negativeMarks: number;
  passageId: string | null;
  solution: string | null;
  solutionFormat: SolutionFormat | null;
  hasDiagram: boolean;
  diagrams: Diagram[] | null;
  difficulty: Difficulty | null;
  tags: string[];
  source: SourceType;
  confidence: Confidence | null;
}

// ---------------------------------------------------------------------------
// Validation types
// ---------------------------------------------------------------------------
export interface ValidationFlag {
  field: string;
  severity: Severity;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

export interface ValidationResult {
  questionId: string;
  index: number;
  valid: boolean;
  flags: ValidationFlag[];
}

export type ValidationRuleCheck = (q: Question) => boolean;

export interface ValidationRule {
  field: string;
  check: ValidationRuleCheck;
  severity?: Severity;
  message?: string;
}

// ---------------------------------------------------------------------------
// Integrity
// ---------------------------------------------------------------------------
export interface IntegrityReport {
  totalFiles: number;
  passed: number;
  failed: number;
  missing: number;
  results: IntegrityEntry[];
}

export interface IntegrityEntry {
  filePath: string;
  status: "passed" | "failed" | "missing";
  expectedHash: string | null;
  actualHash: string | null;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------
export interface ExamMetadata {
  exam: Exam;
  sourceUrls: Record<string, string>;
  verificationStatus: Record<string, VerificationStatus>;
  scrapedAt: string;
  lastUpdated: string;
}

export interface ReviewProgress {
  exam: Exam;
  year: number;
  shift: string;
  currentQuestion: number;
  status: {
    accepted: number[];
    edited: number[];
    skipped: number[];
    flagged: { number: number; note: string }[];
  };
  startedAt: string;
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
export interface ApiResponse<T> {
  success: boolean;
  count: number;
  total: number;
  offset: number;
  limit: number;
  sort: string;
  order: "asc" | "desc";
  exam?: Exam;
  year?: number;
  subject?: Subject;
  questions: T[];
}

export interface ApiStats {
  totalQuestions: number;
  byExam: Record<string, number>;
  bySubject: Record<string, number>;
  byType: Record<string, number>;
  totalDiagrams: number;
  totalFiles: number;
  totalSizeBytes: number;
  verificationPct: number;
  verifiedPct: number;
}

// ---------------------------------------------------------------------------
// MinerU types (PDF parsing via mineru.net)
// ---------------------------------------------------------------------------
export type OcrProvider = "mistral" | "mineru";

export interface MineruAgentSubmitRequest {
  url?: string;
  file_name?: string;
  language?: string;
  enable_table?: boolean;
  is_ocr?: boolean;
  enable_formula?: boolean;
  page_range?: string;
}

export interface MineruAgentSubmitResponse {
  code: number;
  msg: string;
  data: {
    task_id: string;
    file_url?: string;
  };
}

export interface MineruAgentResultResponse {
  code: number;
  msg: string;
  data: {
    task_id: string;
    state: "waiting-file" | "uploading" | "pending" | "running" | "done" | "failed";
    markdown_url?: string;
    err_msg?: string;
    err_code?: number;
  };
}

export interface MineruBatchUploadRequest {
  files: Array<{
    name: string;
    is_ocr?: boolean;
    data_id?: string;
    page_ranges?: string;
  }>;
  model_version?: "pipeline" | "vlm" | "MinerU-HTML";
  language?: string;
  enable_table?: boolean;
  enable_formula?: boolean;
  extra_formats?: string[];
}

export interface MineruBatchUploadResponse {
  code: number;
  msg: string;
  data: {
    batch_id: string;
    file_urls: string[];
  };
}

export interface MineruBatchResultResponse {
  code: number;
  msg: string;
  data: {
    batch_id: string;
    extract_result: Array<{
      file_name: string;
      state: string;
      full_zip_url?: string;
      err_msg?: string;
      data_id?: string;
      extract_progress?: {
        extracted_pages: number;
        total_pages: number;
        start_time: string;
      };
    }>;
  };
}

export interface MineruContentItem {
  type: "text" | "image" | "table" | "equation" | "chart" | "code" | "list" | "header" | "footer" | "page_number" | "aside_text" | "page_footnote";
  text?: string;
  text_level?: number;
  img_path?: string;
  image_caption?: string[];
  image_footnote?: string[];
  table_body?: string;
  table_caption?: string[];
  table_footnote?: string[];
  bbox?: [number, number, number, number];
  page_idx: number;
}

// ---------------------------------------------------------------------------
// OCR / extraction types
// ---------------------------------------------------------------------------
export interface PageContent {
  page: number;
  markdown: string;
  isBilingual: boolean;
}

export interface OcrResult {
  pages: PageContent[];
  images: Map<number, string>;
}

export interface CropCoords {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Enhanced OCR types (Mistral structured annotations)
// ---------------------------------------------------------------------------
export interface MistralImage {
  id: string;
  top_left_x: number;
  top_left_y: number;
  bottom_right_x: number;
  bottom_right_y: number;
  image_base64: string;
}

export interface MistralTable {
  id: string;
  content: string;
}

export interface MistralConfidenceScores {
  average_page_confidence_score: number;
  minimum_page_confidence_score: number;
  word_confidence_scores?: Array<{
    word: string;
    confidence: number;
  }>;
}

export interface MistralOcrPage {
  index: number;
  markdown: string;
  images: MistralImage[];
  tables?: MistralTable[];
  header?: string | null;
  footer?: string | null;
  dimensions?: { dpi: number; height: number; width: number };
  hyperlinks?: Array<{ text: string; url: string }>;
  confidence_scores?: MistralConfidenceScores | null;
}

export interface EnhancedOcrResult {
  pages: PageContent[];
  images: Map<number, string>;
  mistralPages: MistralOcrPage[];
  structuredAnnotation: unknown | null;
  bboxAnnotation: unknown | null;
  answerKeyFoundFromAnnotation?: boolean;
  answerKeyFoundFromBbox?: boolean;
}

export type ProviderName =
  | "nvidia"           // legacy, now nvidia-qwen
  | "longcat"          // legacy, now longcat-lite
  | "poolside"         // Unlimited(preview), 131K context
  | "vanchin"
  | "gemini"           // 500 RPD, 15 RPM, 1M context
  | "cerebras"         // 2,400 RPD, 65K context
  | "longcat-lite"     // 50M tokens/day, 256K context
  | "longcat-chat"     // 500K tokens/day, 256K context
  | "nvidia-qwen"      // 2,400 RPD, 262K context
  | "nvidia-mistral"   // 2,400 RPD, multimodal
  | "zai";             // Z.AI GLM-4.7, 200K context, 128K output, free tier

export interface ConsensusCandidate {
  provider: ProviderName;
  questions: PartialQuestion[];
  passages: Passage[];
  answerKeyFound: boolean;
}

export interface Conflict {
  questionNumber: number;
  reason: "missing_from_all" | "low_agreement";
  candidates?: PartialQuestion[];
  consensus?: PartialQuestion;
}

export interface ConsensusResult {
  questions: PartialQuestion[];
  passages: Passage[];
  conflicts: Conflict[];
  answerKeyFound: boolean;
  providerResults: ConsensusCandidate[];
}

// ---------------------------------------------------------------------------
// Scraper types
// ---------------------------------------------------------------------------
export interface ScraperResult {
  shift: string;
  filePath: string;
  url: string;
  success: boolean;
  error?: string;
}

export interface ExamConfig {
  exam: Exam;
  year: number;
  shift?: string;
  paper?: string;
}
