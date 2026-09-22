const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH'])

/**
 * Gates every route on this router behind SignalK's own authentication.
 *
 * Belt-and-suspenders, not the primary gate: signalk-server itself already
 * registers `app.use('/plugins', adminAuthenticationMiddleware(false))`
 * during its own bootstrap, so whenever a real security strategy is
 * configured, every request under `/plugins/*` (this plugin's routes
 * included) already has to be a fully-authenticated admin before it ever
 * reaches us. This middleware exists anyway for per-method granularity
 * (readonly principals may GET but not PUT) and as defense-in-depth.
 */
function requireAuth (req, res, next) {
  if (req.skIsAuthenticated === undefined) return next()
  if (!req.skIsAuthenticated) return res.status(401).json({ error: 'authentication required' })
  const isWrite = WRITE_METHODS.has(req.method)
  if (isWrite && req.skPrincipal && req.skPrincipal.permissions === 'readonly') {
    return res.status(403).json({ error: 'read-only access — write permission required' })
  }
  next()
}

module.exports = { requireAuth }
