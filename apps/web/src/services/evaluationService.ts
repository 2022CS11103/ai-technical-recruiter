import { evaluations } from "@/data/mockData";
import type { Evaluation } from "@/types/domain";

export async function getEvaluation(): Promise<Evaluation[]> {
  return evaluations;
}
