// Role-Based Access Control (RBAC) middleware
// Integrates with auth middleware — expects req.user to be populated with a `plan` field.

// --- Role hierarchy (higher index = more privilege) ---
const ROLES = ['user', 'creator', 'admin'];

// --- Permissions per role ---
const ROLE_PERMISSIONS = {
  user: [
    'voiceprint:read_own',
    'voiceprint:create',
    'synthesize',
    'marketplace:browse',
  ],
  creator: [
    'voiceprint:read_own',
    'voiceprint:create',
    'synthesize',
    'marketplace:browse',
    'marketplace:publish',
    'audiobook:workbench',
    'training:access',
  ],
  admin: [
    'voiceprint:read_own',
    'voiceprint:create',
    'synthesize',
    'marketplace:browse',
    'marketplace:publish',
    'audiobook:workbench',
    'training:access',
    'users:manage',
    'marketplace:manage',
    'analytics:view',
    'quota:bypass',
  ],
};

// --- Subscription plan -> role mapping ---
const PLAN_ROLE_MAP = {
  free: 'user',
  creator: 'creator',
  pro: 'creator',
  voicebank: 'creator',
  studio: 'admin',
  enterprise: 'admin',
};

/**
 * Derive a user's role from their subscription plan.
 * Defaults to 'user' for unknown plans.
 */
function getUserRole(user) {
  if (!user || !user.plan) return 'user';
  return PLAN_ROLE_MAP[user.plan] || 'user';
}

/**
 * Middleware: require the user to have at least the given role.
 * Role comparison uses hierarchy — admin satisfies a 'creator' requirement, etc.
 *
 * Usage: router.get('/admin/stats', authenticateToken, requireRole('admin'), handler)
 */
function requireRole(role) {
  const requiredLevel = ROLES.indexOf(role);
  if (requiredLevel === -1) {
    throw new Error(`rbac: unknown role "${role}"`);
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = getUserRole(req.user);
    const userLevel = ROLES.indexOf(userRole);

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: role,
        current: userRole,
      });
    }

    // Attach role to request for downstream use
    req.userRole = userRole;
    next();
  };
}

/**
 * Middleware: require the user's role to include a specific permission.
 *
 * Usage: router.post('/publish', authenticateToken, requirePermission('marketplace:publish'), handler)
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = getUserRole(req.user);
    const permissions = ROLE_PERMISSIONS[userRole] || [];

    if (!permissions.includes(permission)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: permission,
        role: userRole,
      });
    }

    req.userRole = userRole;
    next();
  };
}

module.exports = {
  ROLES,
  ROLE_PERMISSIONS,
  PLAN_ROLE_MAP,
  getUserRole,
  requireRole,
  requirePermission,
};
