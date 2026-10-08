export type Role = "ADMIN" | "DEPARTMENT" | "LEARNER";

export interface SessionUser {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  role_name: string;
  department_id: number | null;
  department: string | null;
  department_code: string | null;
  learner_id: number | null;
  learner_code?: string;
  designation: string | null;
  unread_notifications: number;
  home: string;
}

export interface Learner {
  id: number;
  learner_code: string;
  employee_id: string;
  full_name: string;
  email: string;
  mobile: string | null;
  designation: string | null;
  qualification: string | null;
  department_id: number;
  department: string;
  department_code: string;
  location: string | null;
  status: string;
  last_activity_at: string | null;
  created_at: string;
  course?: string | null;
  progress?: number | null;
  attendance?: number | null;
  risk_level?: string | null;
}

export interface Batch {
  id: number;
  code: string;
  name: string;
  course_id: number;
  course: string;
  course_code: string;
  department_id: number | null;
  department: string;
  department_code: string | null;
  mode: string;
  location: string | null;
  start_date: string;
  end_date: string;
  capacity: number;
  instructor: string | null;
  status: string;
  enrolled: number | null;
  department_learners?: number;
}

export interface Nomination {
  id: number;
  nomination_no: string;
  status: string;
  training_mode: string;
  eligibility_result: string | null;
  justification: string | null;
  decision_remarks: string | null;
  learner: Learner;
  department_id: number;
  department: string;
  department_code: string;
  course_id: number;
  course: string;
  course_code: string;
  allocated_course_id: number | null;
  allocated_course: string | null;
  allocated_batch_id: number | null;
  allocated_batch: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  created_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  onboarded_at: string | null;
  updated_at: string;
}

export interface EligibilityRule {
  code: string;
  rule: string;
  outcome: "PASS" | "WARN" | "FAIL";
  message: string;
}

export interface NominationDetail extends Nomination {
  history: { id: number; from_status: string | null; to_status: string; action: string; remarks: string | null; user: string; timestamp: string }[];
  eligibility_checks: { id: number; result: string; rules: EligibilityRule[]; checked_by: string; timestamp: string }[];
  available_batches: Batch[];
  onboarding?: { account_created: boolean; account_email: string | null; ndu_learner_ref: string; batch: string };
}

export interface Progress {
  id: number;
  enrollment_id: number;
  learner_id: number;
  learner: string;
  learner_code: string;
  department_id: number;
  department_code: string | null;
  course_id: number;
  course: string;
  course_code: string;
  batch: string | null;
  overall_pct: number;
  expected_pct: number | null;
  schedule_pct: number | null;
  modules_completed: number;
  modules_total: number;
  content_completed: number;
  content_total: number;
  practicals_completed: number;
  practicals_total: number;
  assessments_completed: number;
  assessments_passed: number;
  assessments_failed: number;
  assessments_total: number;
  attendance_pct: number | null;
  sessions_attended: number;
  sessions_marked: number;
  average_score: number | null;
  risk_level: string;
  risk_reasons: string[];
  current_module_id: number | null;
  last_activity_at: string | null;
  last_source: string;
  updated_at: string;
  completion_status?: string | null;
}

export interface ContentItem {
  id: number;
  code: string;
  content_type: string;
  title: string;
  description: string | null;
  course_id: number;
  course: string;
  course_code: string;
  module_id: number | null;
  module: string | null;
  module_sequence: number | null;
  lesson_id: number | null;
  lesson: string | null;
  instructor: string | null;
  duration_minutes: number;
  learning_objective: string | null;
  is_deep_dive: boolean;
  production_status: string;
  production_stage_index: number;
  practical_id: number | null;
  exercise_id: number | null;
  assessment_id: number | null;
  resolution: string | null;
  aspect_ratio: string | null;
  frame_rate: string | null;
  file_format: string | null;
  codec: string | null;
  audio_sample_rate: string | null;
  has_video: boolean;
  has_captions: boolean;
  video_url: string | null;
  captions_url: string | null;
  qc: Record<string, boolean>;
  qc_needs_review: boolean;
  qc_notes: string | null;
  qc_reviewed_by: string | null;
  qc_reviewed_at: string | null;
  overall_status: string;
  ai_used: boolean;
  ai_tool: string | null;
  ai_purpose: string | null;
  ai_human_reviewer: string | null;
  ai_disclosure_text: string | null;
  compliance: Record<string, boolean>;
  updated_at: string;
  practical?: { id: number; code: string; title: string } | null;
  exercise?: { id: number; code: string; title: string } | null;
  assessment?: { id: number; code: string; title: string; type: string } | null;
  technical_compliance?: { label: string; met: boolean }[];
}

export interface Rubric {
  id: number;
  title: string;
  course_id: number | null;
  description: string | null;
  criteria: { name: string; max_score: number; descriptor?: string | null }[];
  total_score: number;
}

export interface Submission {
  id: number;
  practical_id: number;
  practical: string;
  practical_code: string;
  learner_id: number;
  learner: string;
  learner_code: string;
  status: string;
  score: number | null;
  max_score: number;
  rubric_scores: Record<string, number> | null;
  remarks: string | null;
  submitted_at: string | null;
  evaluated_at: string | null;
  completed: boolean;
}

export interface Practical {
  id: number;
  code: string;
  title: string;
  course_id: number;
  course: string;
  module_id: number | null;
  module: string | null;
  scenario: string | null;
  objective: string | null;
  instructions: string[];
  tools: string | null;
  max_score: number;
  estimated_minutes: number;
  rubric: Rubric | null;
  submission?: Submission | null;
}

export interface AssessmentDef {
  id: number;
  code: string;
  title: string;
  type: string;
  course_id?: number;
  course?: string;
  module_id: number | null;
  module?: string | null;
  max_score: number;
  pass_percentage: number;
  has_answer_key: boolean;
  rubric: Rubric | null;
  result?: { score: number; max_score: number; percentage: number; passed: boolean; remarks: string | null; evaluated_at: string } | null;
}

export interface AssessmentResult {
  id: number;
  assessment_id: number;
  assessment: string;
  assessment_code: string;
  assessment_type: string;
  learner_id: number;
  learner: string;
  learner_code: string;
  department_code: string | null;
  course_id: number;
  course: string;
  module_id: number | null;
  module: string | null;
  score: number;
  max_score: number;
  percentage: number;
  passed: boolean;
  remarks: string | null;
  evaluator: string | null;
  evaluated_at: string;
}

export interface Exercise {
  id: number;
  code: string;
  title: string;
  type: string;
  description: string | null;
  has_answer_key: boolean;
  max_score: number;
}

export interface CourseTree {
  course: {
    id: number;
    code: string;
    title: string;
    short_title: string;
    description: string | null;
    level: string;
    planned_hours: number;
    target_video_hours: number;
    min_qualification: string | null;
    target_audience: string | null;
    ndu_course_ref: string | null;
    pass_percentage: number;
    min_attendance: number;
    prerequisite: string | null;
  };
  modules: {
    id: number;
    sequence: number;
    title: string;
    description: string | null;
    duration_minutes: number;
    status: string | null;
    lessons: { id: number; sequence: number; title: string; objective: string | null; content: ContentItem[]; exercises: Exercise[] }[];
    content: ContentItem[];
    exercises: Exercise[];
    practicals: Practical[];
    assessments: AssessmentDef[];
  }[];
  course_assessments: AssessmentDef[];
  course_practicals: Practical[];
  counts: Record<string, number>;
  progress: Progress | null;
  enrollment?: Enrollment;
  batch?: Batch | null;
}

export interface Enrollment {
  id: number;
  learner_id: number;
  learner: string;
  learner_code: string;
  course_id: number;
  course: string;
  course_code: string;
  batch_id: number | null;
  batch: string | null;
  status: string;
  allocated_at: string;
  onboarded_at: string | null;
}

export interface EnrollmentBundle extends Enrollment {
  batch_detail: Batch | null;
  progress: Progress | null;
  current_module: { id: number; title: string; sequence: number } | null;
  completion: { status: string; criteria: CompletionCriterion[]; certificate_no: string | null; completed_at: string | null; evaluated_at: string } | null;
  ndu: {
    ndu_learner_ref: string;
    ndu_course_ref: string;
    sync_status: string;
    last_synced_at: string | null;
    ndu_progress_pct: number;
    progress_synced: boolean;
    completion_synced: boolean;
  } | null;
  next_session: { date: string; title: string | null; start_time: string | null; end_time: string | null; mode: string; location: string | null } | null;
}

export interface CompletionCriterion {
  code: string;
  label: string;
  met: boolean;
  detail: string;
}

export interface SyncLog {
  id: number;
  timestamp: string;
  sync_type: string;
  direction: string;
  learner_id: number | null;
  learner: string;
  learner_code: string | null;
  course: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  result: string;
  message: string | null;
  records_processed: number;
  triggered_by: string | null;
}

export interface AuditEntry {
  id: number;
  timestamp: string;
  user: string;
  user_email: string | null;
  role: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  result: string;
  details: string | null;
  ip_address: string | null;
}

export interface LearnerProfile {
  learner: Learner;
  enrollments: EnrollmentBundle[];
  nominations: { id: number; nomination_no: string; course: string; status: string; training_mode: string; created_at: string }[];
  assessment_results: AssessmentResult[];
  practical_submissions: Submission[];
  attendance: { id: number; date: string; session_no: number; title: string | null; batch_id: number; status: string; remarks: string | null }[];
  ndu_sync_logs: SyncLog[];
  activity: AuditEntry[];
  primary_enrollment_id?: number | null;
}

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  category: string;
  severity: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface CourseCard {
  id: number;
  code: string;
  title: string;
  short_title: string;
  level: string;
  learners: number;
  active: number;
  completion_pct: number;
  completed: number;
  average_score: number | null;
  content_count: number;
  video_count: number;
  video_minutes: number;
  practical_count: number;
}

export interface Kpis {
  departments: number;
  learners: number;
  pending_nominations: number;
  approved_nominations: number;
  total_nominations: number;
  nomination_status: Record<string, number>;
  active_batches: number;
  enrolments: number;
  attendance_rate: number | null;
  average_progress: number | null;
  average_score: number | null;
  completed: number;
  completion_rate: number | null;
  eligible_for_completion: number;
  at_risk_learners: number;
  critical_learners: number;
  active_learners: number;
}

export interface ContentSummary {
  total_videos: number;
  total_resources: number;
  total_minutes: number;
  total_hours: number;
  ready_hours: number;
  target_hours: number;
  produced_pct: number;
  videos_ready: number;
  videos_pending: number;
  videos_pending_qc: number;
  videos_pending_assets: number;
  videos_needs_review: number;
  missing_captions: number;
  missing_transcripts: number;
  with_video_file: number;
  practicals: number;
  exercises: number;
  assessments: number;
  rubrics: number;
  by_stage: { stage: string; count: number }[];
  by_course: { course: string; code: string; videos: number; hours: number; target_hours: number }[];
  by_status: { status: string; count: number }[];
}

export interface DashboardCharts {
  learners_by_course: { course: string; code: string; learners: number }[];
  completion_by_course: Record<string, string | number>[];
  assessment_performance: { course: string; code: string; average_score: number; pass_rate: number; results: number }[];
  attendance_trend: { week: string; rate: number | null; marked: number }[];
  risk_distribution: { level: string; key: string; count: number }[];
  progress_distribution: { range: string; learners: number }[];
  department_performance?: {
    department: string;
    name: string;
    learners: number;
    average_progress: number;
    attendance_rate: number;
    average_score: number;
    completed: number;
    at_risk: number;
  }[];
}
