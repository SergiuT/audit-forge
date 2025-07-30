export function parseRegexFromString(str: string): RegExp {
  const match = str.match(/^\/(.*)\/([gimsuy]*)$/);
  if (!match) throw new Error(`Invalid regex string format: ${str}`);
  return new RegExp(match[1], match[2]);
}

// export const COMPLIANCE_RULES = [
//   {
//     rule: 'UNAUTH_ACCESS',
//     pattern: /unauthorized/i,
//     description: 'Unauthorized access attempt detected.',
//     severity: SeverityOptions.HIGH,
//     category: 'Access Control',
//     tags: ['IAM', 'Intrusion Detection', 'SOC2-CC6.1'],
//     mappedControls: ['SOC2-CC6.1', 'SOC2-CC6.2', 'ISO-A.9.1.2', 'ISO-A.9.2.3']
//   },
//   {
//     rule: 'ROOT_ACCESS',
//     pattern: /root/i,
//     description: 'Root access detected.',
//     severity: SeverityOptions.MEDIUM,
//     category: 'Privilege Escalation',
//     tags: ['Privilege Escalation', 'Least Privilege', 'ISO-A.9.2.3'],
//     mappedControls: ['SOC2-CC6.3', 'SOC2-CC6.7', 'ISO-A.9.2.3', 'ISO-A.12.4.1']
//   },
//   {
//     rule: 'FAILED_LOGIN',
//     pattern: /failed login/i,
//     description: 'Multiple failed login attempts.',
//     severity: SeverityOptions.LOW,
//     category: 'Access Control',
//     tags: ['IAM', 'Brute Force', 'SOC2-CC6.2'],
//     mappedControls: ['SOC2-CC6.2', 'SOC2-CC7.2', 'ISO-A.9.4.2', 'ISO-A.12.4.1']
//   },
//   {
//     rule: 'GCP_PUBLIC_ACCESS_POLICY',
//     pattern: /SetIamPolicy.*allUsers/,
//     description: 'Public access was granted to a GCP resource.',
//     severity: SeverityOptions.HIGH,
//     category: 'Access Control',
//     tags: ['IAM', 'GCP', 'PublicAccess'],
//     mappedControls: ['SOC2-CC6.1', 'ISO-A.9.2.6'],
//   },
//   {
//     rule: 'GCP_SERVICE_ACCOUNT_KEY_CREATED',
//     pattern: /CreateServiceAccountKey/,
//     description: 'A new GCP service account key was created.',
//     severity: SeverityOptions.MEDIUM,
//     category: 'Identity & Access',
//     tags: ['IAM', 'KeyManagement'],
//     mappedControls: ['SOC2-CC6.2', 'ISO-A.9.4.3'],
//   },
//   {
//     rule: 'GCP_BUCKET_CREATED',
//     pattern: /storage\.buckets\.create/,
//     description: 'A new GCP storage bucket was created.',
//     severity: SeverityOptions.LOW,
//     category: 'Storage',
//     tags: ['GCP', 'Storage'],
//     mappedControls: ['SOC2-CC7.2'],
//   },
//   {
//     rule: 'GCP_NEW_SERVICE_DEPLOYMENT',
//     pattern: /run\.googleapis\.com.*CreateService/,
//     description: 'A new Cloud Run service was deployed.',
//     severity: SeverityOptions.LOW,
//     category: 'Deployment',
//     tags: ['Deployment', 'Audit'],
//     mappedControls: ['ISO-A.12.1.2'],
//   },
//   {
//     rule: 'AWS-001',
//     description: 'Root user was used',
//     pattern: /"userIdentity":\s*{[^}]*"type":\s*"Root"/,
//     severity: SeverityOptions.HIGH,
//     category: 'access',
//     mappedControls: ['ISO-A.9.2.3', 'SOC2-CC6.2'],
//   },
//   {
//     rule: 'AWS-002',
//     description: 'IAM policy was attached, updated, or deleted',
//     pattern: /"eventName":\s*"((Attach|Put|Delete)RolePolicy|(Put|Delete)UserPolicy|(Put|Delete)GroupPolicy)/,
//     severity: SeverityOptions.MEDIUM,
//     category: 'iam',
//     mappedControls: ['ISO-A.9.4.2', 'SOC2-CC6.1'],
//   },
//   {
//     rule: 'AWS-003',
//     description: 'Unauthorized API call detected',
//     pattern: /"errorCode":\s*"AccessDenied"/,
//     severity: SeverityOptions.MEDIUM,
//     category: 'access',
//     mappedControls: ['ISO-A.12.4.1', 'SOC2-CC7.2'],
//   },
//   {
//     rule: 'AWS-004',
//     description: 'New IAM user was created',
//     pattern: /"eventName":\s*"CreateUser"/,
//     severity: SeverityOptions.MEDIUM,
//     category: 'iam',
//     mappedControls: ['ISO-A.9.2.1', 'SOC2-CC6.3'],
//   },
//   {
//     rule: 'AWS-005',
//     description: 'CloudTrail logging was disabled',
//     pattern: /"eventName":\s*"StopLogging"/,
//     severity: SeverityOptions.HIGH,
//     category: 'audit',
//     mappedControls: ['ISO-A.12.4.1', 'SOC2-CC7.2'],
//   },
//   {
//     rule: 'AWS-006',
//     description: 'KMS key scheduled for deletion',
//     pattern: /"eventName":\s*"ScheduleKeyDeletion"/,
//     severity: SeverityOptions.HIGH,
//     category: 'encryption',
//     mappedControls: ['ISO-A.10.1.1', 'SOC2-CC6.6'],
//   }  
// ];
  