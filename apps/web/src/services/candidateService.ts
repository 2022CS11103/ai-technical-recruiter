import { candidates } from "@/data/mockData";
import type { Candidate } from "@/types/domain";

export async function listCandidates(): Promise<Candidate[]> {
  return candidates;
}

export async function getCandidate(id: string): Promise<Candidate | undefined> {
  return candidates.find((candidate) => candidate.id === id);
}
