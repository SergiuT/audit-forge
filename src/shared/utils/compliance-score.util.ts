import { ComplianceFinding } from "@/modules/compliance/entities/compliance-finding.entity";
import { ReportSource, SeverityOptions } from "../types/types";

interface CategoryScoreMap {
  [category: string]: number;
}

const severityWeights = {
  [SeverityOptions.HIGH]: 3,
  [SeverityOptions.MEDIUM]: 2,
  [SeverityOptions.LOW]: 1,
};

export function getCategoryScores(findings: ComplianceFinding[]): CategoryScoreMap {
  const categoryGroups: Record<string, ComplianceFinding[]> = {};

  findings.forEach((f) => {
    const categoryKey = f.category.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    if (!categoryGroups[categoryKey]) {
      categoryGroups[categoryKey] = [];
    }
    categoryGroups[categoryKey].push(f);
  });

  const scores: CategoryScoreMap = {};

  for (const [category, groupFindings] of Object.entries(categoryGroups)) {
    const maxPenalty = groupFindings.length * severityWeights[SeverityOptions.HIGH];
    const actualPenalty = groupFindings.reduce((sum, f) => sum + (severityWeights[f.severity] || 0), 0);

    const categoryScore = ((maxPenalty - actualPenalty) / maxPenalty) * 100;
    scores[category] = Math.round(categoryScore);
  }

  return scores;
}

export function getControlScores(findings: ComplianceFinding[]): Record<string, number> {
  const controlMap: Record<string, ComplianceFinding[]> = {};

  for (const f of findings) {
    for (const controlId of f.mappedControls || []) {
      if (!controlMap[controlId]) controlMap[controlId] = [];
      controlMap[controlId].push(f);
    }
  }

  const scores: Record<string, number> = {};

  for (const [controlId, controlFindings] of Object.entries(controlMap)) {
    const maxPenalty = controlFindings.length * severityWeights[SeverityOptions.HIGH];
    const actualPenalty = controlFindings.reduce(
      (sum, f) => sum + (severityWeights[f.severity] || 0),
      0
    );

    const controlScore = ((maxPenalty - actualPenalty) / maxPenalty) * 100;
    scores[controlId] = Math.round(controlScore);
  }

  return scores;
}


export function calculateComplianceScore(findings: ComplianceFinding[]): number {
  if (!findings.length) return 100;

  const maxPenalty = findings.length * severityWeights[SeverityOptions.HIGH];
  const actualPenalty = findings.reduce((sum, f) => sum + (severityWeights[f.severity] || 0), 0);

  const score = ((maxPenalty - actualPenalty) / maxPenalty) * 100;
  return Math.round(score);
}

export function determineReportSourceFromPrefix(prefix: string): ReportSource {
  if (!prefix) return ReportSource.OTHER;

  const normalized = prefix.toLowerCase();

  if (normalized.includes('aws')) return ReportSource.AWS;
  if (normalized.includes('gcp')) return ReportSource.GCP;
  if (normalized.includes('github')) return ReportSource.GITHUB;

  return ReportSource.OTHER;
}