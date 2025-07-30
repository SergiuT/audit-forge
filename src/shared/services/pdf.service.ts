// shared/services/pdf.service.ts
import { Injectable } from '@nestjs/common';
import PdfPrinter from 'pdfmake';
import * as path from 'path';
import { ComplianceFinding } from '@/modules/compliance/entities/compliance-finding.entity';

const fonts = {
  Roboto: {
    normal: path.join(__dirname, '../../public/fonts/Roboto-Regular.ttf'),
    bold: path.join(__dirname, '../../public/fonts/Roboto-Medium.ttf'),
    italics: path.join(__dirname, '../../public/fonts/Roboto-Italic.ttf'),
    bolditalics: path.join(
      __dirname,
      '../../public/fonts/Roboto-MediumItalic.ttf',
    ),
  },
};

@Injectable()
export class PdfService {
  async generateComplianceReport(data: {
    summary: string;
    complianceScore: number;
    categoryScores: Record<string, number>;
    findings: {
      rule: string;
      description: string;
      severity: string;
      category: string;
      recommendation: string;
    }[];
  }): Promise<Buffer> {
    const printer = new PdfPrinter(fonts);

    const docDefinition = {
      content: [
        { text: 'Compliance Report', style: 'header' },
        { text: '\nAI Summary', style: 'sectionHeader' },
        { text: data.summary, margin: [0, 5, 0, 15] },

        {
          text: `Overall Compliance Score: ${data.complianceScore}`,
          style: 'score',
        },

        {
          text: '\nCategory Scores:',
          style: 'sectionHeader',
        },
        {
          ul: Object.entries(data.categoryScores).map(
            ([cat, score]) => `${cat}: ${score}`,
          ),
          margin: [0, 0, 0, 15],
        },

        { text: 'Findings', style: 'sectionHeader' },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto', 'auto', '*'],
            body: [
              [
                { text: 'Rule', style: 'tableHeader' },
                { text: 'Description', style: 'tableHeader' },
                { text: 'Severity', style: 'tableHeader' },
                { text: 'Category', style: 'tableHeader' },
                { text: 'Recommendation', style: 'tableHeader' },
              ],
              ...data.findings.map((f) => [
                f.rule,
                f.description,
                {
                  text: f.severity.toUpperCase(),
                  color:
                    f.severity === 'high'
                      ? 'red'
                      : f.severity === 'medium'
                        ? 'orange'
                        : 'green',
                  bold: true,
                },
                f.category,
                f.recommendation,
              ]),
            ],
          },
          layout: {
            fillColor: (rowIndex: number) =>
              rowIndex === 0 ? '#f2f2f2' : null,
          },
        },
      ],
      styles: {
        header: {
          fontSize: 22,
          bold: true,
          margin: [0, 0, 0, 10],
        },
        sectionHeader: {
          fontSize: 16,
          bold: true,
          margin: [0, 10, 0, 5],
        },
        score: {
          fontSize: 14,
          bold: true,
          color: 'blue',
          margin: [0, 0, 0, 10],
        },
        tableHeader: {
          bold: true,
          fillColor: '#eeeeee',
        },
      },
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10,
      },
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      pdfDoc.on('data', (chunk) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.end();
    });
  }

  async generateChecklistPDF(data: {
    checklist: {
      control: string;
      title: string;
      findings?: ComplianceFinding[]
      description: string;
      affectedFindings: string[];
      status: 'resolved' | 'in_progress' | 'unresolved';
    }[];
    summary?: {
      complianceScore: number;
      resolved: number;
      inProgress: number;
      unresolved: number;
      completion: number;
      tagCounts: Record<string, number>;
    };
  }): Promise<Buffer> {
    const printer = new PdfPrinter(fonts);

    const docDefinition = {
      content: [
        { text: 'Compliance Control Checklist', style: 'header' },
        {
          text: `Generated: ${new Date().toLocaleString()}`,
          fontSize: 10,
          margin: [0, 0, 0, 10],
        },
        ...(data.summary
          ? [
              {
                text: 'Summary',
                style: 'sectionHeader',
                margin: [0, 5, 0, 5],
              },
              {
                columns: [
                  {
                    width: '*',
                    stack: [
                      `Compliance Score: ${data.summary.complianceScore}`,
                      `Completion: ${data.summary.completion}%`,
                      `Resolved: ${data.summary.resolved}`,
                      `In Progress: ${data.summary.inProgress}`,
                      `Unresolved: ${data.summary.unresolved}`,
                    ],
                    margin: [0, 0, 0, 5],
                  },
                  {
                    width: '*',
                    stack: [
                      { text: 'Tag Breakdown:', bold: true },
                      ...Object.entries(data.summary.tagCounts).map(
                        ([tag, count]) => `• ${tag}: ${count}`,
                      ),
                    ],
                    margin: [0, 0, 0, 5],
                  },
                ],
              },
              { text: '', margin: [0, 0, 0, 10] },
            ]
        : []),
        ...data.checklist.map((item) => ({
          stack: [
            {
              columns: [
                {
                  text: `${item.control} — ${item.title}`,
                  style: 'controlHeader',
                },
                {
                  text: getStatusText(item.status),
                  style: getStatusStyle(item.status),
                  alignment: 'right',
                },
              ],
            },
            { text: item.description, margin: [0, 0, 0, 5] },
            {
              ul: item.affectedFindings.map((rule) => {
                const matched = item?.findings?.find(f => f.rule === rule);
                const severity = matched?.severity ?? 'unknown';
                const tags = matched?.tags?.join(', ') ?? 'none';
                return `Related Finding: ${rule} (Severity: ${severity}, Tags: ${tags})`;
              }),
            },
            { text: '', margin: [0, 0, 0, 10] },
          ],
        })),
      ],
      styles: {
        header: { fontSize: 22, bold: true, margin: [0, 0, 0, 10] },
        controlHeader: { fontSize: 14, bold: true, margin: [0, 5, 0, 3] },
        statusResolved: { fontSize: 10, bold: true, color: 'green' },
        statusInProgress: { fontSize: 10, bold: true, color: 'orange' },
        statusUnresolved: { fontSize: 10, bold: true, color: 'red' },
        sectionHeader: {
          fontSize: 14,
          bold: true,
          color: '#1a1a1a',
        },
      },
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10,
      },
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      pdfDoc.on('data', (chunk) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.end();
    });

    function getStatusText(status: string): string {
      switch (status) {
        case 'resolved':
          return 'Resolved';
        case 'in_progress':
          return 'In Progress';
        case 'unresolved':
        default:
          return 'Unresolved';
      }
    }

    function getStatusStyle(status: string): string {
      switch (status) {
        case 'resolved':
          return 'statusResolved';
        case 'in_progress':
          return 'statusInProgress';
        case 'unresolved':
        default:
          return 'statusUnresolved';
      }
    }
  }
}
