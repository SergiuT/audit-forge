export interface SecurityPolicy {
  auth: boolean;
  rateLimit: {
    type: 'ip' | 'user' | 'global';
    maxRequests: number;
    windowMs: number;
  };
  roles?: string[];
  requireProjectAccess?: boolean;
}

export const SECURITY_CONFIG: Record<string, SecurityPolicy> = {
  // Public routes (no auth needed)
  '/health': {
    auth: false,
    rateLimit: { type: 'ip', maxRequests: 100, windowMs: 60000 }
  },
  '/health/metrics': {
    auth: false,
    rateLimit: { type: 'ip', maxRequests: 100, windowMs: 60000 }
  },
  '/health/ready': {
    auth: false,
    rateLimit: { type: 'ip', maxRequests: 100, windowMs: 60000 }
  },
  '/health/live': {
    auth: false,
    rateLimit: { type: 'ip', maxRequests: 100, windowMs: 60000 }
  },
  '/auth/login': {
    auth: false,
    rateLimit: { type: 'ip', maxRequests: 10, windowMs: 900000 } // 15 min
  },
  '/auth/logout': {
    auth: false,
    rateLimit: { type: 'ip', maxRequests: 10, windowMs: 900000 }
  },
  '/auth/logout-all': {
    auth: false,
    rateLimit: { type: 'ip', maxRequests: 10, windowMs: 900000 }
  },
  '/auth/register': {
    auth: false,
    rateLimit: { type: 'ip', maxRequests: 10, windowMs: 900000 }
  },
  '/auth/refresh': {
    auth: false, // No auth needed for refresh
    rateLimit: { type: 'ip', maxRequests: 10, windowMs: 60000 }
  },

  // COMPLIANCE ROUTES
  '/compliance': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 30, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/compliance/:id': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 30, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/compliance/:id/findings/filter': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 20, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/compliance/rules/nvd': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 20, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/compliance/topics/controls': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 20, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/compliance/rules/nvd-sync': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 5, windowMs: 60000 },
    roles: ['admin']
  },
  '/compliance/:id/export-pdf': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 5, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/compliance/:id/summary': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 3, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/compliance/project/:projectId/reports': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 30, windowMs: 60000 },
    roles: ['user', 'admin'],
    requireProjectAccess: true
  },

  // FINDINGS ROUTES
  '/findings/search': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 20, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/findings/tags': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 20, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/findings/:id/grouped': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 20, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/findings/tags/:tag/explanation': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 10, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/findings/checklist/:id': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 20, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/findings/checklist/:id/pdf': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 5, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/findings/:id': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 20, windowMs: 60000 },
    roles: ['user', 'admin']
  },

  // CHECKLIST ROUTES
  '/checklist/report/:reportId': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 20, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/checklist/report/:reportId/metrics': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 20, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/checklist/report/:reportId/prioritized-controls': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 20, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/checklist/report/:reportId/export': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 5, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/checklist/report/:reportId/control/:controlId': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 10, windowMs: 60000 },
    roles: ['user', 'admin']
  },

  // INTEGRATIONS ROUTES
  '/integrations': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 10, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/integrations/:id': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 20, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/integrations/github/callback': {
    auth: false,
    rateLimit: { type: 'ip', maxRequests: 5, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/integrations/projects/:projectId/github/scan': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 20, windowMs: 60000 },
    roles: ['user', 'admin'],
    requireProjectAccess: true
  },
  '/integrations/projects/:projectId/aws/connect-role': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 10, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/integrations/projects/:id/scan-history': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 20, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/integrations/projects/:projectId/aws/scan': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 20, windowMs: 60000 },
    roles: ['user', 'admin'],
    requireProjectAccess: true
  },
  '/integrations/projects/:projectId/github/auth-url': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 5, windowMs: 60000 },
    roles: ['user', 'admin'],
    requireProjectAccess: true
  },
  '/integrations/projects/:projectId/gcp/auth-url': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 10, windowMs: 60000 },
    roles: ['user', 'admin'],
    requireProjectAccess: true
  },
  '/integrations/gcp/callback': {
    auth: false,
    rateLimit: { type: 'ip', maxRequests: 5, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/integrations/projects/:projectId/gcp/scan': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 20, windowMs: 60000 },
    roles: ['user', 'admin'],
    requireProjectAccess: true
  },

  // AI AGENT ROUTES
  '/ai-agent/chat': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 5, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/ai-agent/scan': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 2, windowMs: 60000 },
    roles: ['user', 'admin']
  },

  // PROJECT ROUTES
  '/projects': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 30, windowMs: 60000 },
    roles: ['user', 'admin']
  },
  '/projects/:id': {
    auth: true,
    rateLimit: { type: 'user', maxRequests: 30, windowMs: 60000 },
    roles: ['user', 'admin']
  },
}