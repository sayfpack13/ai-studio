import express from 'express';
import { generateToken, verifyToken, requireAuth } from '../middleware/auth.js';
import fs from 'fs/promises';

const router = express.Router();

// Login - Verify admin password and return JWT token
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }
    
    const storedPassword = req.config.adminPasswordHash || process.env.ADMIN_PASSWORD;
    
    // First time setup - set the password
    if (!storedPassword) {
      req.config.adminPasswordHash = password;
      await fs.writeFile(req.configPath, JSON.stringify(req.config, null, 2));
      
      const token = generateToken({ role: 'admin', createdAt: Date.now() });
      return res.json({ 
        success: true, 
        message: 'Admin password set successfully',
        token,
        expiresIn: '24h'
      });
    }
    
    if (password === storedPassword) {
      const token = generateToken({ role: 'admin', createdAt: Date.now() });
      return res.json({ 
        success: true, 
        token,
        expiresIn: '24h'
      });
    }
    
    res.status(403).json({ error: 'Invalid password' });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Verify token (for session persistence)
router.get('/verify', requireAuth, (req, res) => {
  res.json({ 
    valid: true, 
    user: req.user 
  });
});

// Logout (client-side token removal, but we can add server-side token blacklist here)
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// Setup admin password (first time) - returns token
router.post('/setup', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }
    
    if (req.config.adminPasswordHash) {
      return res.status(400).json({ error: 'Admin already configured' });
    }
    
    req.config.adminPasswordHash = password;
    await fs.writeFile(req.configPath, JSON.stringify(req.config, null, 2));
    
    const token = generateToken({ role: 'admin', createdAt: Date.now() });
    
    res.json({ 
      success: true, 
      message: 'Admin password set successfully',
      token,
      expiresIn: '24h'
    });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({ error: 'Setup failed' });
  }
});

// Check if admin is configured
router.get('/status', (req, res) => {
  const configuredProviders = Object.values(req.config.providers || {}).filter(
    (provider) => provider.enabled && provider.apiKey && provider.apiBaseUrl
  );

  res.json({
    hasPassword: !!req.config.adminPasswordHash,
    configuredProviders: configuredProviders.map((provider) => provider.id),
    hasProviderConfigured: configuredProviders.length > 0
  });
});

export default router;
