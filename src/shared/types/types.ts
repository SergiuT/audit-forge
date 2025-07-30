import { ComplianceFinding } from "@/modules/compliance/entities/compliance-finding.entity";

export interface ComplianceReportWithExtras {
  id: number;
  userId: number;
  reportData: any;
  status: string;
  fileDataKey: string;
  createdAt: Date;
  updatedAt: Date;
  aiSummary?: string;
  fileContent: string;
  findings: ComplianceFinding[];
  complianceScore: number;
  categoryScores: Record<string, number>;
}

export enum SeverityOptions {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export enum ReportSource {
  AWS = 'AWS',
  GCP = 'GCP',
  GITHUB = 'GitHub',
  OTHER = 'Other'
}

export interface GitHubRepo {
  name: string;
  full_name: string;
  private: boolean;
  pushed_at: string;
  html_url: string;
}

export interface ComplianceFindingResult {
  rule: string;
  description: string;
  severity: SeverityOptions;
  category: string;
  tags: string[];
  mappedControls: string[];
}

export interface RequestWithUser extends Request {
  user: { id: number; email: string; role: string };
}