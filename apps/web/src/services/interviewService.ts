import { interviews } from "@/data/mockData";
import type { Interview } from "@/types/domain";

const pause = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));

export async function listInterviews(): Promise<Interview[]> {
  await pause();
  return interviews;
}

export async function getInterview(id: string): Promise<Interview | undefined> {
  await pause();
  return interviews.find((interview) => interview.id === id);
}

export async function createInterview(input: Partial<Interview>): Promise<Interview> {
  await pause(350);
  return {
    ...interviews[0],
    ...input,
    id: "backend-7x92",
  };
}
