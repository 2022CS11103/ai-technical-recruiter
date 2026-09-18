export type InterviewStatus =
  | "Active"
  | "Draft"
  | "Completed"
  | "Invited"
  | "In Progress"
  | "Pending Review";

export type Recommendation = "Strong Hire" | "Hire" | "Consider" | "No Hire";

export type VoiceState =
  | "IDLE"
  | "CONNECTING"
  | "LISTENING"
  | "THINKING"
  | "SPEAKING"
  | "INTERRUPTED"
  | "ENDED"
  | "ERROR";

export interface AIInterviewer {
  id: string;
  name: string;
  title: string;
  persona: string;
  voice: string;
  rating: string;
  interviewsConducted: number;
  avatar: string;
  accent: string;
}

/** @deprecated Prefer AIInterviewer */
export type Interviewer = AIInterviewer;

export interface Interview {
  id: string;
  name: string;
  role: string;
  company: string;
  candidates: number;
  duration: number;
  questions: number;
  completion: number;
  created: string;
  status: InterviewStatus;
  score: number;
  interviewerId: string;
  skills: string[];
}

/** @deprecated Prefer Interview */
export type InterviewCampaign = Interview;

export interface Candidate {
  id: string;
  name: string;
  email: string;
  role: string;
  score: number;
  status: "Completed" | "In Progress" | "Invited" | "Pending Review";
  recommendation: Recommendation;
  interviewId: string;
  date: string;
  avatar: string;
  skills: Record<string, number>;
  summary: string;
  strengths: string[];
  areasToExplore: string[];
}

export interface Question {
  id: string;
  question: string;
  category: string;
  difficulty: "Easy" | "Medium" | "Hard";
  skills: string[];
  used: number;
}

export interface Evaluation {
  question: string;
  answer: string;
  evaluation: string;
  score: number;
  evidence: string;
}

/** @deprecated Prefer Evaluation */
export type QuestionEvaluation = Evaluation;

export type ActivityPoint = {
  day: string;
  invited: number;
  completed: number;
};
