import { ComplianceFinding } from "@/modules/compliance/entities/compliance-finding.entity";
import { ComplianceRule } from "@/modules/compliance/entities/compliance-rule.entity";

export interface RequestWithUser extends Request {
  user: { id: number; email: string; role: string };
}

export interface AuthenticatedRequest extends Request {
  user: {
    id: number;
    email: string;
    role: string;
  };
}

export interface TokenPayload {
  sub: number;
  email: string;
  role: string;
  type: 'access' | 'refresh';
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

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

export interface ComplianceAnalysis {
  findings: any[];
  complianceScore: number;
  categoryScores: Record<string, number>;
  controlScores: Record<string, number>;
}

export interface NvdRulesFilters {
  severity?: 'critical' | 'high' | 'medium' | 'low';
  category?: string;
  cveId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export enum LockfileEcosystem {
  NPM = 'npm',
  YARN = 'yarn',
  PNPM = 'pnpm'
}

export enum DependencyType {
  PROD = 'prod',
  DEV = 'dev',
  PEER = 'peer'
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

export interface DriftAnalysis {
  newFindings: any[];
  resolvedFindings: any[];
  unchangedFindings: any[];
  scoreDelta: number;
  categoryScoreDelta: Record<string, number>;
  controlScoreDelta: Record<string, number>;
}