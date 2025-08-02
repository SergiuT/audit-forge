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
    if (!controlFindings.length) {
      scores[controlId] = 100;
      continue;
    }

    const maxScore = 100;
    const totalPenalty = controlFindings.reduce(
      (sum, f) => sum + (severityWeights[f.severity] || 0),
      0
    );
    const maxPossiblePenalty = controlFindings.length * severityWeights[SeverityOptions.HIGH];
    
    const penaltyPercentage = (totalPenalty / maxPossiblePenalty) * 100;
    const score = maxScore - penaltyPercentage;
    
    scores[controlId] = Math.max(0, Math.round(score));
  }

  return scores;
}


export function calculateComplianceScore(findings: ComplianceFinding[]): number {
  if (!findings.length) return 100;

  const maxScore = 100;
  const totalPenalty = findings.reduce((sum, f) => sum + (severityWeights[f.severity] || 0), 0);
  const maxPossiblePenalty = findings.length * severityWeights[SeverityOptions.HIGH];
  
  // More findings/severe findings = lower score
  const penaltyPercentage = (totalPenalty / maxPossiblePenalty) * 100;
  const score = maxScore - penaltyPercentage;
  
  return Math.max(0, Math.round(score));
}

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
    if (!groupFindings.length) {
      scores[category] = 100;
      continue;
    }

    const maxScore = 100;
    const totalPenalty = groupFindings.reduce((sum, f) => sum + (severityWeights[f.severity] || 0), 0);
    const maxPossiblePenalty = groupFindings.length * severityWeights[SeverityOptions.HIGH];
    
    const penaltyPercentage = (totalPenalty / maxPossiblePenalty) * 100;
    const score = maxScore - penaltyPercentage;
    
    scores[category] = Math.max(0, Math.round(score));
  }

  return scores;
}

export function determineReportSourceFromPrefix(prefix: string): ReportSource {
  switch (prefix) {
    case 'aws':
      return ReportSource.AWS;
    case 'gcp':
      return ReportSource.GCP;
    case 'github':
      return ReportSource.GITHUB;
    default:
      return ReportSource.OTHER;
  }
}