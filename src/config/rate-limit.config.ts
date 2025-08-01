export const RATE_LIMIT_CONFIG = {
    // Global defaults
    global: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 100,
      type: 'global'
    },
    
    // Endpoint-specific limits
    endpoints: {
      '/auth/login': {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 5,
        type: 'ip'
      },
      '/auth/register': {
        windowMs: 15 * 60 * 1000,
        maxRequests: 100,
        type: 'ip'
      },
      '/auth/refresh': {
        windowMs: 60 * 1000,
        maxRequests: 10,
        type: 'user'
      },
      '/compliance': {
        windowMs: 60 * 1000,
        maxRequests: 30,
        type: 'user'
      },
      '/compliance/:id/summary': {
        windowMs: 60 * 1000,
        maxRequests: 5,
        type: 'user'
      },
      '/compliance/:id/report': {
        windowMs: 60 * 1000,
        maxRequests: 5,
        type: 'user'
      },
      '/compliance/:id/report/download': {
        windowMs: 60 * 1000,
        maxRequests: 5,
        type: 'user'
      },
      '/integrations/github/callback': {
        windowMs: 60 * 1000,
        maxRequests: 5,
        type: 'ip'
      },
      '/integrations/gcp/callback': {
        windowMs: 60 * 1000,
        maxRequests: 5,
        type: 'ip'
      },
      '/integrations/github/auth-url': {
        windowMs: 60 * 1000,
        maxRequests: 5,
        type: 'user'
      },
      '/integrations/gcp/auth-url': {
        windowMs: 60 * 1000,
        maxRequests: 5,
        type: 'user'
      }
    }
  };