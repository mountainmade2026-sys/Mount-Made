const jwt = require('jsonwebtoken');
const User = require('../models/User');

const sanitizeToken = (token) => {
  if (!token) return null;
  const value = String(token).trim().replace(/^"|"$/g, '');
  return value || null;
};

const extractHeaderToken = (req) => {
  const rawAuth = req.get('authorization') || req.get('Authorization') || '';
  if (!rawAuth) return null;

  const bearerMatch = rawAuth.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch && bearerMatch[1]) {
    return sanitizeToken(bearerMatch[1]);
  }

  return sanitizeToken(rawAuth);
};

const getTokenCandidates = (req) => {
  const headerToken = extractHeaderToken(req);
  const cookieToken = sanitizeToken(req.cookies?.token);
  return [headerToken, cookieToken].filter(Boolean);
};

const verifyFirstValidToken = (tokens) => {
  for (const token of tokens) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return { token, decoded };
    } catch (_) {
      continue;
    }
  }
  return null;
};

const authenticateToken = async (req, res, next) => {
  const tokens = getTokenCandidates(req);

  if (tokens.length === 0) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const verified = verifyFirstValidToken(tokens);
    if (!verified) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }

    const decoded = verified.decoded;

    // Allow local developer crafter tokens (issued without DB user) when running locally
    const isLocalReq = () => {
      try {
        const ipRaw = String(req.ip || req.connection?.remoteAddress || '').replace(/^::ffff:/, '');
        if (ipRaw === '127.0.0.1' || ipRaw === '::1' || ipRaw === '::ffff:127.0.0.1') return true;
        const hostHeader = String(req.headers?.host || '').toLowerCase();
        if (hostHeader.startsWith('localhost') || hostHeader.startsWith('127.0.0.1')) return true;
        return false;
      } catch (_) { return false; }
    };

    if (decoded && decoded.is_local_crafter && process.env.NODE_ENV !== 'production' && isLocalReq()) {
      // Accept token without DB lookup for local crafter dev login
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role || 'crafter',
        is_approved: decoded.is_approved !== false,
        is_blocked: decoded.is_blocked === true,
        profile_photo: null
      };
      return next();
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User account no longer exists.' });
    }

    if (user.is_blocked) {
      return res.status(403).json({ error: 'Your account has been blocked. Please contact support.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      is_approved: user.is_approved,
      is_blocked: user.is_blocked,
      profile_photo: user.profile_photo
    };

    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

const optionalAuth = async (req, res, next) => {
  const tokens = getTokenCandidates(req);

  if (tokens.length > 0) {
    try {
      const verified = verifyFirstValidToken(tokens);
      if (!verified) {
        req.user = null;
        return next();
      }

      const decoded = verified.decoded;
      const user = await User.findById(decoded.id);
      if (user && !user.is_blocked) {
        req.user = {
          id: user.id,
          email: user.email,
          role: user.role,
          is_approved: user.is_approved,
          is_blocked: user.is_blocked,
          profile_photo: user.profile_photo
        };
      } else {
        req.user = null;
      }
    } catch (error) {
      // Token invalid, but we don't block the request
      req.user = null;
    }
  }
  next();
};

module.exports = { authenticateToken, optionalAuth };
