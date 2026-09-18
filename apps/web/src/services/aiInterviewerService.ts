import { interviewers } from "@/data/mockData";
import type { AIInterviewer } from "@/types/domain";

export async function listAIInterviewers(): Promise<AIInterviewer[]> {
  return interviewers;
}

export async function getAIInterviewer(id: string): Promise<AIInterviewer | undefined> {
  return interviewers.find((interviewer) => interviewer.id === id);
}
