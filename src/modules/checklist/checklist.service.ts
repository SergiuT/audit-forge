import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ComplianceFinding } from '../compliance/entities/compliance-finding.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ComplianceReport } from '../compliance/entities/compliance-report.entity';
import {
  ChecklistStatus,
  ControlChecklistItem,
} from './entities/control-checklist.entity';
import { User } from '../auth/entities/user.entity';
import { PineconeService } from '@/shared/services/pinecone.service';

@Injectable()
export class ChecklistService {
  private readonly logger = new Logger(ChecklistService.name);
  constructor(
    @InjectRepository(ComplianceFinding)
    private findingRepository: Repository<ComplianceFinding>,

    @InjectRepository(ControlChecklistItem)
    private checklistRepository: Repository<ControlChecklistItem>,

    @InjectRepository(ComplianceReport)
    private readonly reportRepository: Repository<ComplianceReport>,

    private readonly pineconeService: PineconeService,
  ) {}

  async getChecklistWithStatuses(reportId: number, user: User): Promise<
    {
      control: string;
      title: string;
      description: string;
      assignedTo: string | null;
      dueDate: Date | null;
      statusUpdatedAt: Date | null;
      projectId: number | null;
      status: ChecklistStatus;
      affectedFindings: string[];
    }[]
  > {
    const checklistItems = await this.checklistRepository.find({
      where: { report: { id: reportId }, projectId: In(user.projects.map(p => p.id)) },
    });

    const findings = await this.findingRepository.find({
      where: { report: { id: reportId }, projectId: In(user.projects.map(p => p.id)) },
    });

    const controlMap: Record<string, string[]> = {};
    findings.forEach((f) =>
      f.mappedControls?.forEach((c) => {
        if (!controlMap[c]) controlMap[c] = [];
        controlMap[c].push(f.rule);
      }),
    );

    const controlIds = checklistItems.map((c) => c.controlId);

    if (!controlIds.length) return [];

    const controls = await this.pineconeService.fetchControlsByIds(controlIds);

    return Array.from(controls.values()).map((control) => {
      const item = checklistItems.find(
        (i) => i.controlId === control.controlId,
      );
      return {
        control: control.controlId,
        title: control.title,
        description: control.description,
        status: item?.status || ChecklistStatus.UNRESOLVED,
        assignedTo: item?.assignedTo || null,
        dueDate: item?.dueDate || null,
        statusUpdatedAt: item?.statusUpdatedAt || null,
        affectedFindings: controlMap[control.controlId] ?? [],
        projectId: item?.projectId || null,
      };
    });
  }

  async createChecklistItemsForReport(report: ComplianceReport, findings: ComplianceFinding[]): Promise<void> {
    const controlSet = new Set<string>();

    findings.forEach((f) => {
      f.mappedControls?.forEach((c) => controlSet.add(c));
    });

    const checklistItems = Array.from(controlSet).map((controlId) =>
      this.checklistRepository.create({
        controlId,
        status: ChecklistStatus.UNRESOLVED,
        report,
        projectId: report.projectId,
      }),
    );

    await this.checklistRepository.save(checklistItems);
  }

  async getChecklistMetrics(reportId: number, user: User): Promise<{
    resolved: number;
    inProgress: number;
    unresolved: number;
    completion: number;
  
    // NEW
    totalControls: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
    controlsBySeverity: Record<'high' | 'medium' | 'low', string[]>;
    severityByControl: Record<string, 'high' | 'medium' | 'low'>;
  }> {
    const checklistItems = await this.checklistRepository.find({
      where: { report: { id: reportId }, projectId: In(user.projects.map(p => p.id)) },
    });
  
    const findings = await this.findingRepository.find({
      where: { report: { id: reportId }, projectId: In(user.projects.map(p => p.id)) },
    });
  
    let resolved = 0;
    let inProgress = 0;
    let unresolved = 0;
  
    checklistItems.forEach((item) => {
      switch (item.status) {
        case 'resolved':
          resolved++;
          break;
        case 'in_progress':
          inProgress++;
          break;
        default:
          unresolved++;
      }
    });
  
    const controlSeverities = new Map<string, 'high' | 'medium' | 'low'>();
  
    for (const f of findings) {
      const severity = f.severity;
      f.mappedControls?.forEach((controlId) => {
        const existing = controlSeverities.get(controlId);
        if (
          !existing ||
          (severity === 'high') ||
          (severity === 'medium' && existing === 'low')
        ) {
          controlSeverities.set(controlId, severity);
        }
      });
    }
  
    const controlsBySeverity: Record<'high' | 'medium' | 'low', string[]> = {
      high: [],
      medium: [],
      low: [],
    };
  
    const severityByControl: Record<string, 'high' | 'medium' | 'low'> = {};
  
    for (const [controlId, severity] of controlSeverities.entries()) {
      controlsBySeverity[severity].push(controlId);
      severityByControl[controlId] = severity;
    }
  
    const total = checklistItems.length;
    const completion = total === 0 ? 0 : Math.round((resolved / total) * 100);
  
    return {
      resolved,
      inProgress,
      unresolved,
      completion,
      totalControls: total,
      highSeverity: controlsBySeverity.high.length,
      mediumSeverity: controlsBySeverity.medium.length,
      lowSeverity: controlsBySeverity.low.length,
      controlsBySeverity,
      severityByControl,
    };
  }

  async getPrioritizedControls(reportId: number, user: User): Promise<
    {
      control: string;
      title: string;
      severityScore: number;
      affectedFindings: { rule: string; severity: string }[];
    }[]
  > {
    const findings = await this.findingRepository.find({
      where: { report: { id: reportId }, projectId: In(user.projects.map(p => p.id)) },
    });

    const controlToFindings: Record<string, ComplianceFinding[]> = {};

    findings.forEach((f) => {
      f.mappedControls?.forEach((controlId) => {
        if (!controlToFindings[controlId]) controlToFindings[controlId] = [];
        controlToFindings[controlId].push(f);
      });
    });

    const controlsMap = await this.pineconeService.fetchControlsByIds(Array.from(Object.keys(controlToFindings)));

    const severityScoreMap = { high: 3, medium: 2, low: 1 };

    return Array.from(controlsMap.values()).map((control) => {
      const relatedFindings = controlToFindings[control.controlId] || [];

      const score = relatedFindings.reduce((sum, f) => {
        return sum + (severityScoreMap[f.severity] || 0);
      }, 0);

      return {
        control: control.controlId,
        title: control.title,
        severityScore: score,
        affectedFindings: relatedFindings.map((f) => ({
          rule: f.rule,
          severity: f.severity,
        })),
      };
    }).sort((a, b) => b.severityScore - a.severityScore);
  }

  async exportChecklistCSV(
    reportId: number,
    user: User
  ): Promise<string> {
    const checklist = await this.getChecklistWithStatuses(reportId, user);
    const report = await this.reportRepository.findOne({
      where: { id: reportId },
      relations: ['findings', 'project'],
    });

    if (!report) throw new NotFoundException('Report not found');

    const metrics = await this.getChecklistMetrics(reportId, user);
    const tagCountMap: Record<string, number> = {};
    const severityMap: Record<string, number> = {}; // High = 3, Medium = 2, Low = 1

    report.findings?.forEach((f) => {
      f.tags?.forEach((tag) => {
        tagCountMap[tag] = (tagCountMap[tag] || 0) + 1;
      });
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const metadataRows = [
      ['Report ID', report.id],
      ['Project', report.project?.name || 'N/A'],
      ['Created At', report.createdAt.toISOString()],
      ['Compliance Score', report.complianceScore || 'N/A'],
      ['Completion', `${metrics.completion}%`],
      ['Resolved Controls', metrics.resolved],
      ['Unresolved Controls', metrics.unresolved],
      ['In Progress Controls', metrics.inProgress],
      [],
      ['Tag Breakdown'],
      ...Object.entries(tagCountMap).map(([tag, count]) => [tag, count]),
      [],
    ];

    
    const csvRows = [
      ...metadataRows,
      [
        'Control ID',
        'Framework',
        'Title',
        'Status',
        'Assigned To',
        'Due Date',
        'Severity',
        'Affected Findings',
        'Tags',
        'Actions',
      ],
      ...checklist.map((item) => {
        const findingSubset = report.findings.filter((f) =>
          f.mappedControls?.includes(item.control),
        );

        const tags = [
          ...new Set(findingSubset.flatMap((f) => f.tags || [])),
        ].join(', ');

        const actions = findingSubset
          .flatMap((f) =>
            f.actions?.map((a) => `[${a.status.toUpperCase()}] ${a.recommendation}`) || [],
          )
          .join('\n');

        const severities = findingSubset.map((f) =>
          f.severity === 'high' ? 3 : f.severity === 'medium' ? 2 : 1,
        );

        const severity =
          Math.max(...severities, 0) === 3
            ? 'high'
            : Math.max(...severities, 0) === 2
            ? 'medium'
            : 'low';

        return [
          item.control,
          item.control.split('-')[0],
          item.title,
          item.status,
          item.assignedTo || '',
          item.dueDate || '',
          severity,
          item.affectedFindings.join('; '),
          tags,
          actions,
        ];
      }),
    ];
  
    const csvContent = csvRows
      .map((row) =>
        row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(','),
      )
      .join('\n');

    return csvContent;
  }

  async updateChecklistItem(
    reportId: number,
    controlId: string,
    update: {
      assignedTo?: string;
      dueDate?: Date;
      status?: ChecklistStatus;
    },
  ): Promise<ControlChecklistItem> {
    const item = await this.checklistRepository.findOne({
      where: {
        report: { id: reportId },
        controlId,
      },
    });

    if (!item) throw new NotFoundException('Checklist item not found');

    if (update.assignedTo !== undefined) item.assignedTo = update.assignedTo;
    if (update.dueDate !== undefined) item.dueDate = update.dueDate;
    if (update.status !== undefined) {
      item.status = update.status;
      item.statusUpdatedAt = new Date();
    }

    return await this.checklistRepository.save(item);
  }
}
