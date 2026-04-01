import jwt from 'jsonwebtoken';
import { isProviderConfigured } from '../utils/config.js';
import { resolveProviderContext } from '../utils/provider-routing.js';

const JWT_SECRET = process.env.JWT_SECRET || 'blackbox-ai-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

// Generate JWT token
export function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Verify JWT token
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Middleware to require valid JWT token
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  
  req.user = decoded;
  next();
}

// Middleware to check admin password (for login)
export function requireAdmin(req, res, next) {
  const { adminPassword } = req.body;
  
  if (!adminPassword) {
    return res.status(401).json({ error: 'Admin password required' });
  }
  
  const storedPassword = req.config.adminPasswordHash || process.env.ADMIN_PASSWORD;
  
  if (adminPassword !== storedPassword && storedPassword) {
    return res.status(403).json({ error: 'Invalid admin password' });
  }
  
  next();
}

// Middleware to require API key for AI operations
export function requireApiKey(req, res, next) {
  resolveProviderContext(req.config, {
    requestedProvider: req.body?.provider || req.query?.provider,
    modelId: req.body?.model,
    modelKey: req.body?.modelKey || req.query?.modelKey
  })
    .then((context) => {
      if (!context.provider || !isProviderConfigured(context.provider)) {
        return res.status(503).json({
          error: `Provider not configured: ${context.providerId || 'unknown'}. Please contact admin.`
        });
      }

      req.providerContext = context;
      req.apiKey = context.provider.apiKey;
      next();
    })
    .catch((error) => {
      res.status(500).json({ error: error.message || 'Failed to resolve provider' });
    });
}

export function validateConfig(config) {
  const providers = Object.values(config.providers || {});
  return providers.some((provider) => isProviderConfigured(provider));
}
