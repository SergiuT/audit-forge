import { ComplianceFinding } from "@/modules/compliance/entities/compliance-finding.entity";

type DriftComparison = {
  scoreDelta: number;
  newFindings: string[];
  resolvedFindings: string[];
  unchangedFindings: string[];
  controlScoreDelta: Record<string, number>;
  categoryScoreDelta: Record<string, number>;
};

export function generateDriftComparison(
  currentFindings: ComplianceFinding[],
  previousFindings: ComplianceFinding[],
  currentControlScores: Record<string, number>,
  previousControlScores: Record<string, number>,
  currentCategoryScores: Record<string, number>,
  previousCategoryScores: Record<string, number>,
  currentScore: number,
  previousScore: number,
): DriftComparison {
  const currentSet = new Set(currentFindings.map(f => f.rule));
  const previousSet = new Set(previousFindings.map(f => f.rule));

  const newFindings = [...currentSet].filter(rule => !previousSet.has(rule));
  const resolvedFindings = [...previousSet].filter(rule => !currentSet.has(rule));
  const unchangedFindings = [...currentSet].filter(rule => previousSet.has(rule));

  const controlScoreDelta: Record<string, number> = {};
  for (const controlId of new Set([
    ...Object.keys(currentControlScores),
    ...Object.keys(previousControlScores),
  ])) {
    controlScoreDelta[controlId] =
      (currentControlScores[controlId] ?? 0) -
      (previousControlScores[controlId] ?? 0);
  }

  const categoryScoreDelta: Record<string, number> = {};
  for (const category of new Set([
    ...Object.keys(currentCategoryScores),
    ...Object.keys(previousCategoryScores),
  ])) {
    categoryScoreDelta[category] =
      (currentCategoryScores[category] ?? 0) -
      (previousCategoryScores[category] ?? 0);
  }

  return {
    scoreDelta: currentScore - previousScore,
    newFindings,
    resolvedFindings,
    unchangedFindings,
    controlScoreDelta,
    categoryScoreDelta,
  };
}

export function truncateFileContent(content: string, maxTokens: number = 8000): string {
  // Rough estimation: 1 token ≈ 4 characters
  const maxChars = maxTokens * 4;

  if (content.length <= maxChars) {
    return content;
  }

  // Truncate and add indicator
  const truncated = content.substring(0, maxChars);
  const lines = truncated.split('\n');

  // Keep the last few lines to preserve context
  const lastLines = lines.slice(-50).join('\n');

  return `[TRUNCATED - Original content was ${content.length} characters]\n\n${lastLines}`;
}