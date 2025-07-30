export const API_ROUTES_KNOWLEDGE = `
# AI Compliance Platform API Routes Documentation

## Authentication & Security
All routes (except health and auth) require JWT authentication via Bearer token.
Failed authentication returns 401 Unauthorized.

## Health & System Monitoring

### GET /health
**Purpose:** System health status with database, AI services, and external integrations
**Authentication:** None required
**Response:** SystemHealth object with overall status (healthy/unhealthy)
**Use Case:** Kubernetes health checks, monitoring systems

### GET /health/metrics  
**Purpose:** Detailed system metrics including circuit breakers, cache statistics, uptime
**Authentication:** None required
**Response:** Detailed metrics object with performance data
**Use Case:** Observability dashboards, performance monitoring

### GET /health/ready
**Purpose:** Kubernetes readiness probe - checks if system ready to accept traffic
**Authentication:** None required
**Response:** {status: "ready"/"not ready", ready: boolean}

### GET /health/live
**Purpose:** Kubernetes liveness probe - basic health check
**Authentication:** None required
**Response:** {status: "alive", timestamp: ISO string}

## Authentication

### POST /auth/register
**Purpose:** Register new user account
**Authentication:** None required
**Body:** {username: string, email: string, password: string}
**Response:** User creation confirmation
**Use Case:** New user onboarding

### POST /auth/login
**Purpose:** User authentication and JWT token generation
**Authentication:** None required
**Body:** {email: string, password: string}
**Response:** JWT token for authenticated requests
**Use Case:** User login flow

## Compliance Management (Core Features)

### GET /compliance
**Purpose:** List all compliance reports across projects
**Authentication:** JWT required
**Query Params:** Optional filtering
**Response:** Array of ComplianceReport objects
**Use Case:** Dashboard overview, reporting

### GET /compliance/:id
**Purpose:** Get specific compliance report with full details
**Authentication:** JWT required
**Path:** id (number) - Report ID
**Response:** Complete report with findings, scores, file content
**Use Case:** Detailed report analysis, audit review

### GET /compliance/:id/findings/filter
**Purpose:** Advanced filtering of findings within a report
**Authentication:** JWT required
**Path:** id (number) - Report ID
**Query Params:**
  - severity: string[] (critical, high, medium, low)
  - category: string[] (access-control, monitoring, etc.)
  - controlIds: string[] (SOC2-CC6.1, ISO-A.9.1.2, etc.)
  - topicTags: string[] (encryption, authentication, etc.)
  - search: string (text search in descriptions)
**Response:** Filtered array of ComplianceFinding objects
**Use Case:** Risk prioritization, control-specific analysis

### GET /compliance/rules/nvd
**Purpose:** Get all compliance rules from database (including NVD CVEs)
**Authentication:** JWT required
**Response:** Array of ComplianceRule objects with patterns and mappings
**Use Case:** Rule management, compliance logic review

### GET /compliance/topics/controls
**Purpose:** Get all control topics for categorization and tagging
**Authentication:** JWT required
**Response:** Array of ControlTopic objects with embeddings
**Use Case:** Control categorization, topic-based filtering

### POST /compliance/rules/nvd-sync
**Purpose:** Synchronize CVE rules from National Vulnerability Database
**Authentication:** JWT required
**Response:** {inserted: number} - Count of new rules added
**Use Case:** Security vulnerability updates, rule maintenance

### POST /compliance
**Purpose:** Create new compliance report with file upload
**Authentication:** JWT required
**Content-Type:** multipart/form-data
**Body:** 
  - file: .txt file (required, max 10MB)
  - createComplianceReportDto: report metadata
**Response:** Created ComplianceReport with findings and scores
**Use Case:** New compliance assessment, scan result processing

### GET /compliance/:id/export-pdf
**Purpose:** Generate and download PDF report
**Authentication:** JWT required
**Path:** id (number) - Report ID
**Response:** PDF file download
**Headers:** Content-Type: application/pdf, Content-Disposition: attachment
**Use Case:** Executive reporting, audit documentation

### POST /compliance/:id/summary
**Purpose:** Generate AI-powered summary of compliance report
**Authentication:** JWT required
**Path:** id (number) - Report ID
**Query Params:**
  - regenerate: string ('true' to force regeneration)
  - tone: 'executive' | 'technical' | 'remediation' | 'educational'
**Response:** {summary: string} - AI-generated summary
**Use Case:** Executive dashboards, stakeholder communication

### GET /compliance/project/:projectId/reports
**Purpose:** Get all compliance reports for a specific project
**Authentication:** JWT required + ProjectAccessGuard
**Path:** projectId (number) - Project ID
**Response:** Array of reports filtered by project
**Use Case:** Project-specific compliance tracking

### POST /compliance/:id
**Purpose:** Update existing compliance report data
**Authentication:** JWT required
**Path:** id (number) - Report ID
**Body:** Partial report update object
**Response:** Updated ComplianceReport
**Use Case:** Report maintenance, metadata updates

### DELETE /compliance/:id
**Purpose:** Delete compliance report and all associated findings
**Authentication:** JWT required
**Path:** id (number) - Report ID
**Response:** Deletion confirmation
**Use Case:** Data cleanup, report management

## Findings Analysis

### GET /findings/search
**Purpose:** Search findings across all reports by tags, severity, category
**Authentication:** JWT required
**Query Params:**
  - tags: string (comma-separated tags)
  - severity: string (critical, high, medium, low)
  - category: string (finding category)
  - reportId: string (specific report ID)
**Response:** Array of matching findings
**Use Case:** Cross-report analysis, trend identification

### GET /findings/tags
**Purpose:** Get tag occurrence counts across all findings
**Authentication:** JWT required
**Response:** Object with tag names and occurrence counts
**Use Case:** Tag analytics, most common issues identification

### GET /findings/:id/grouped
**Purpose:** Group findings by compliance control for a report
**Authentication:** JWT required
**Path:** id (number) - Report ID
**Response:** Findings grouped by control ID
**Use Case:** Control-based remediation planning

### GET /findings/tags/:tag/explanation
**Purpose:** Get AI explanation of what a specific tag means (cached)
**Authentication:** JWT required
**Path:** tag (string) - Tag name
**Query Params:** regenerate: string ('true' to force regeneration)
**Response:** {tag: string, explanation: string}
**Use Case:** Tag education, compliance training

### GET /findings/checklist/:id
**Purpose:** Generate control checklist for a compliance report
**Authentication:** JWT required
**Path:** id (number) - Report ID
**Response:** Structured checklist for remediation
**Use Case:** Remediation planning, task management

### GET /findings/checklist/:id/pdf
**Purpose:** Export control checklist as PDF with metrics
**Authentication:** JWT required
**Path:** id (number) - Report ID
**Response:** PDF file with checklist and completion metrics
**Use Case:** Remediation documentation, progress reporting

### GET /findings/:id
**Purpose:** Get all findings for a specific compliance report
**Authentication:** JWT required
**Path:** id (number) - Report ID
**Response:** Array of ComplianceFinding objects
**Use Case:** Report analysis, finding review

## Integration Management

### POST /integrations
**Purpose:** Create new third-party integration
**Authentication:** JWT required
**Body:** CreateIntegrationDto
**Response:** Created Integration object
**Use Case:** Connect external services (GitHub, AWS, GCP)

### GET /integrations/:id
**Purpose:** Get integration details by ID
**Authentication:** JWT required
**Path:** id (string) - Integration ID
**Response:** Integration object with configuration
**Use Case:** Integration management, status checking

### GET /integrations/github/callback
**Purpose:** GitHub OAuth callback handler for authentication
**Authentication:** None (OAuth flow)
**Query Params:**
  - code: string (OAuth authorization code)
  - state: string (encoded userId and projectId)
**Response:** Integration creation confirmation
**Use Case:** GitHub OAuth integration setup

### POST /integrations/projects/:projectId/github/scan
**Purpose:** Scan GitHub repositories for compliance issues
**Authentication:** JWT required
**Path:** projectId (string) - Project ID
**Body:** {repos: string[]} - Array of repository names (empty = all repos)
**Response:** {message: "GitHub log scan triggered"}
**Use Case:** GitHub security scanning, repository compliance

### POST /integrations/aws/connect-role
**Purpose:** Connect AWS account via IAM role assumption
**Authentication:** JWT required
**Body:** {
  assumeRoleArn: string,
  externalId?: string,
  region?: string,
  projectId: string,
  userId: string
}
**Response:** AWS integration confirmation
**Use Case:** AWS account integration, CloudTrail access

### GET /integrations/projects/:id/scan-history
**Purpose:** Get scan history for a project across all integrations
**Authentication:** JWT required
**Path:** id (string) - Project ID
**Response:** Array of scan history records
**Use Case:** Audit trail, scanning analytics

### POST /integrations/projects/:projectId/aws/scan
**Purpose:** Scan AWS resources for compliance issues
**Authentication:** JWT required
**Path:** projectId (string) - Project ID
**Response:** {message: "AWS scan triggered"}
**Use Case:** AWS infrastructure compliance scanning

### POST /integrations/gcp/connect
**Purpose:** Connect GCP project via service account file upload
**Authentication:** JWT required
**Content-Type:** multipart/form-data
**Body:** 
  - file: GCP service account JSON file
  - projectId: string
  - userId: string
**Response:** GCP integration confirmation
**Use Case:** GCP project integration, audit log access

### POST /integrations/projects/:projectId/gcp/scan
**Purpose:** Scan GCP projects for compliance issues
**Authentication:** JWT required
**Path:** projectId (string) - Project ID
**Body:** {projects: string[]} - Array of GCP project IDs
**Response:** {message: "GCP scan started"}
**Use Case:** GCP infrastructure compliance scanning

### DELETE /integrations/:id
**Purpose:** Delete integration and associated data
**Authentication:** JWT required
**Path:** id (string) - Integration ID
**Response:** {message: "Integration {id} deleted"}
**Use Case:** Integration cleanup, account disconnection

## Project Management

### POST /projects
**Purpose:** Create new compliance project
**Authentication:** None specified
**Body:** {name: string} - Project name
**Response:** Created Project object
**Use Case:** Project setup, organization structure

### GET /projects
**Purpose:** List all compliance projects
**Authentication:** None specified
**Response:** Array of Project objects
**Use Case:** Project overview, navigation

### GET /projects/:id
**Purpose:** Get specific project details
**Authentication:** None specified
**Path:** id (number) - Project ID
**Response:** Project object with details
**Use Case:** Project management, configuration

## Checklist Management

### GET /checklist/report/:reportId
**Purpose:** Get compliance checklist with current statuses
**Authentication:** JWT required
**Path:** reportId (number) - Report ID
**Response:** Checklist with item statuses and assignments
**Use Case:** Remediation tracking, task management

### GET /checklist/report/:reportId/metrics
**Purpose:** Get checklist completion metrics
**Authentication:** JWT required
**Path:** reportId (number) - Report ID
**Response:** {completion: number, resolved: number, unresolved: number, inProgress: number}
**Use Case:** Progress reporting, KPI dashboards

### GET /checklist/report/:reportId/prioritized-controls
**Purpose:** Get prioritized list of controls based on risk
**Authentication:** JWT required
**Path:** reportId (number) - Report ID
**Response:** Controls ordered by priority/risk
**Use Case:** Risk-based remediation, resource allocation

### GET /checklist/report/:reportId/export
**Purpose:** Export checklist as CSV file
**Authentication:** JWT required
**Path:** reportId (number) - Report ID
**Response:** CSV file download
**Headers:** Content-Type: text/csv, Content-Disposition: attachment
**Use Case:** External reporting, spreadsheet analysis

### PATCH /checklist/report/:reportId/control/:controlId
**Purpose:** Update checklist item status, assignment, or due date
**Authentication:** JWT required
**Path:** 
  - reportId (number) - Report ID
  - controlId (string) - Control ID
**Body:** {
  assignedTo?: string,
  dueDate?: string (ISO date),
  status?: ChecklistStatus
}
**Response:** Updated checklist item
**Use Case:** Task assignment, progress tracking

## Audit Trail

### GET /audit-trail
**Purpose:** Get audit events with filtering capabilities
**Authentication:** JWT required
**Query Params:** GetEventsQueryDto filters
**Response:** Array of audit events
**Use Case:** Compliance audit, activity tracking

### GET /audit-trail/timeline
**Purpose:** Get grouped timeline of audit events
**Authentication:** JWT required
**Query Params:** GetEventsQueryDto filters
**Response:** Timeline-grouped audit events
**Use Case:** Activity visualization, compliance reporting

## AI Agent System

### POST /ai-agent/chat
**Purpose:** Interactive chat with AI compliance assistant
**Authentication:** Not specified (appears public)
**Body:** {
  message: string,
  projectId?: string
}
**Response:** {response: string, timestamp: string}
**Use Case:** Compliance questions, guidance requests

### POST /ai-agent/scan
**Purpose:** Quick compliance scan trigger via AI agent
**Authentication:** Not specified
**Query Params:** projectId (string) - Required project ID
**Response:** {response: string, timestamp: string}
**Use Case:** Automated scanning, AI-driven compliance checks

## Response Formats

### Standard Success Response
- HTTP 200: Successful operation with data
- HTTP 201: Resource created successfully
- HTTP 204: Successful operation without response body

### Error Responses
- HTTP 400: Bad Request (validation errors, missing fields)
- HTTP 401: Unauthorized (invalid/missing JWT token)
- HTTP 403: Forbidden (insufficient permissions)
- HTTP 404: Not Found (resource doesn't exist)
- HTTP 500: Internal Server Error (system failures)

### Common Headers
- Authorization: Bearer {jwt_token} (required for protected routes)
- Content-Type: application/json (for JSON requests)
- Content-Type: multipart/form-data (for file uploads)

## Rate Limiting & Performance
- OpenAI API calls are cached and rate-limited
- File uploads limited to 10MB for security
- Batch processing used for large operations
- Circuit breakers prevent cascade failures
`; 