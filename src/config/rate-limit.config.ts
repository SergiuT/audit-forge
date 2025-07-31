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
      }
    }
  };