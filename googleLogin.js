// googleLogin.js
// Purpose: Handle all Google OAuth + User Tracking + Chat History
// Import this file in server.js

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import session from 'express-session';
import { MongoClient } from 'mongodb';
import 'dotenv/config';

// ✅ MongoDB Connection
let db;

async function getDB() {
  if (!db) {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db('football_ai');
  }
  return db;
}

// ✅ Helper: Detect device type
function getDeviceType(userAgent) {
  if (!userAgent) return 'Unknown';
  const ua = userAgent.toLowerCase();
  if (/tablet|ipad|android.*mobile/i.test(ua)) return 'Tablet';
  if (/mobile|android|iphone|ipod/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

// ✅ Helper: Detect browser
function getBrowser(userAgent) {
  if (!userAgent) return 'Unknown';
  const ua = userAgent.toLowerCase();
  if (ua.includes('chrome')) return 'Chrome';
  if (ua.includes('firefox')) return 'Firefox';
  if (ua.includes('safari')) return 'Safari';
  if (ua.includes('edge')) return 'Edge';
  return 'Other';
}

// ✅ Helper: Detect OS
function getOS(userAgent) {
  if (!userAgent) return 'Unknown';
  const ua = userAgent.toLowerCase();
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('mac')) return 'macOS';
  if (ua.includes('linux')) return 'Linux';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('ios')) return 'iOS';
  return 'Other';
}

// ✅ Initialize Google Login
export function setupGoogleLogin(app) {
  // ✅ Session Configuration
  app.use(session({
  secret: process.env.SESSION_SECRET || 'football-ai-analyst-super-secret-key-min-32-chars-long',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',  // ✅ HTTPS only
    httpOnly: true,                                   // ✅ Prevent XSS
    sameSite: 'lax',                                  // ✅ CSRF protection + cross-site login
    maxAge: 30 * 24 * 60 * 60 * 1000                  // 30 days
  }
}));

  // ✅ Passport Configuration
  app.use(passport.initialize());
  app.use(passport.session());

  // ✅ Build callback URL - SINGLE SOURCE OF TRUTH
  const getCallbackURL = () => {
    // Priority 1: Explicit callback URL
    if (process.env.GOOGLE_CALLBACK_URL) {
      return process.env.GOOGLE_CALLBACK_URL;
    }
    // Priority 2: Build from FRONTEND_URL
    if (process.env.FRONTEND_URL) {
      const baseUrl = process.env.FRONTEND_URL.replace(/\/$/, ''); // Remove trailing slash
      return `${baseUrl}/auth/google/callback`;
    }
    // Priority 3: Default for local development
    return '/auth/google/callback';
  };

  const callbackURL = getCallbackURL();
  console.log('🔐 Google OAuth callbackURL:', callbackURL);

  // ✅ Google OAuth Strategy - USE THE SAME callbackURL
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: callbackURL,  // ← SAME variable used here
      passReqToCallback: true
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const db = await getDB();
        const now = new Date();
        
        // ✅ Find or create user
        let user = await db.collection('users').findOne({ googleId: profile.id });
        
        if (!user) {
          // ✅ NEW USER - First login
          user = {
            googleId: profile.id,
            email: profile.emails?.[0]?.value || '',
            name: profile.displayName || 'User',
            photo: profile.photos?.[0]?.value || '',
            chatHistory: [],
            uploadedFiles: [],
            firstLogin: now,
            lastLogin: now,
            totalLogins: 1,
            isActive: true,
            createdAt: now,
            updatedAt: now
          };
          await db.collection('users').insertOne(user);
          console.log(`✅ NEW USER: ${user.email} just logged in for the first time!`);
        } else {
          // ✅ EXISTING USER - Update login stats
          await db.collection('users').updateOne(
            { googleId: profile.id },
            { 
              $set: { lastLogin: now, updatedAt: now, isActive: true },
              $inc: { totalLogins: 1 }
            }
          );
          console.log(`🔄 RETURNING USER: ${user.email} logged in (Total: ${user.totalLogins} times)`);
        }
        
        // ✅ Create login session record
        const userAgent = req.headers['user-agent'] || '';
        await db.collection('login_sessions').insertOne({
          userId: user._id,
          googleId: profile.id,
          email: user.email,
          loginTime: now,
          logoutTime: null,
          duration: null,
          ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
          userAgent: userAgent,
          device: getDeviceType(userAgent),
          browser: getBrowser(userAgent),
          os: getOS(userAgent),
          isActive: true,
          status: 'active',
          createdAt: now
        });
        
        return done(null, user);
        
      } catch (err) {
        console.error('❌ Login tracking error:', err.message);
        return done(err, null);
      }
    }
  ));

  // ✅ Serialize user - save only email to session (not full object)
  passport.serializeUser((user, done) => {
  done(null, {
    email: user.email,
    name: user.name,
    photo: user.photo,
    googleId: user.googleId
  });
});

  // ✅ Deserialize user - fetch minimal user info from email
  passport.deserializeUser((obj, done) => {
  done(null, obj);
});

  // ============================================
  // 🔐 AUTH ROUTES
  // ============================================

  // ✅ Google Login - USE THE SAME callbackURL
  app.get('/auth/google',
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      callbackURL: callbackURL  // ← SAME variable used here
    })
  );

  // ✅ Google Callback
  app.get('/auth/google/callback',
    passport.authenticate('google', { 
      failureRedirect: '/',
      failureMessage: true
    }),
    (req, res) => {
      res.redirect('/');
    }
  );

  // ✅ Check Login Status
  app.get('/api/auth/status', (req, res) => {
    if (req.isAuthenticated()) {
      res.json({
        loggedIn: true,
        user: {
          email: req.user?.email || '',
          name: req.user?.name || '',
          photo: req.user?.photo || ''
        }
      });
    } else {
      res.json({ loggedIn: false });
    }
  });

  // ✅ Logout
  app.post('/api/auth/logout', async (req, res) => {
    if (req.user?.googleId) {
      try {
        const db = await getDB();
        await db.collection('login_sessions').updateOne(
          { 
            googleId: req.user.googleId,
            isActive: true,
            logoutTime: null
          },
          {
            $set: {
              logoutTime: new Date(),
              isActive: false,
              status: 'logout'
            }
          }
        );
      } catch (err) {
        console.error('❌ Logout session update error:', err.message);
      }
    }
    
    req.logout((err) => {
      if (err) {
        console.error('❌ Logout error:', err.message);
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.json({ success: true });
    });
  });

  // ============================================
  // 💬 CHAT HISTORY ROUTES
  // ============================================

  // ✅ Save Chat to History
  app.post('/api/chat/save', async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.email) {
        return res.status(401).json({ error: 'Not logged in' });
      }
      
      const { userMessage, aiResponse, searchParams } = req.body;
      const db = await getDB();
      
      await db.collection('users').updateOne(
        { email: req.user.email },
        {
          $push: {
            chatHistory: {
              sessionId: `session_${Date.now()}`,
              timestamp: new Date(),
              userMessage,
              aiResponse,
              searchParams: searchParams || {}
            }
          },
          $set: { lastActive: new Date() }
        }
      );
      
      res.json({ success: true });
      
    } catch (err) {
      console.error('❌ Save chat error:', err.message);
      res.status(500).json({ error: 'Failed to save chat' });
    }
  });

  // ✅ Load Chat History
  app.get('/api/chat/history', async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.email) {
        return res.json({ history: [] });
      }
      
      const db = await getDB();
      const user = await db.collection('users').findOne(
        { email: req.user.email },
        { projection: { chatHistory: 1 } }
      );
      
      const history = user?.chatHistory?.slice(-50).reverse() || [];
      res.json({ history });
      
    } catch (err) {
      console.error('❌ Load history error:', err.message);
      res.status(500).json({ error: 'Failed to load history' });
    }
  });

  // ✅ Clear Chat History
  app.delete('/api/chat/history', async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.email) {
        return res.status(401).json({ error: 'Not logged in' });
      }
      
      const db = await getDB();
      await db.collection('users').updateOne(
        { email: req.user.email },
        { $set: { chatHistory: [] } }
      );
      
      res.json({ success: true });
      
    } catch (err) {
      console.error('❌ Clear history error:', err.message);
      res.status(500).json({ error: 'Failed to clear history' });
    }
  });

  // ============================================
  // 📊 ANALYTICS ROUTES (Optional - Admin Dashboard)
  // ============================================

  // ✅ Get User Stats
  app.get('/api/analytics/users', async (req, res) => {
    try {
      const db = await getDB();
      
      const totalUsers = await db.collection('users').countDocuments();
      const activeUsers = await db.collection('users').countDocuments({
        lastLogin: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });
      const newUsers = await db.collection('users').countDocuments({
        firstLogin: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      });
      
      const topUsers = await db.collection('users')
        .find({}, { projection: { email: 1, name: 1, totalLogins: 1, lastLogin: 1 } })
        .sort({ totalLogins: -1 })
        .limit(10)
        .toArray();
      
      const recentSessions = await db.collection('login_sessions')
        .find({ loginTime: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
        .sort({ loginTime: -1 })
        .limit(50)
        .toArray();
      
      res.json({ totalUsers, activeUsers, newUsers, topUsers, recentSessions });
      
    } catch (err) {
      console.error('❌ Analytics error:', err.message);
      res.status(500).json({ error: 'Failed to load analytics' });
    }
  });

  // ✅ Get Currently Online Users
  app.get('/api/analytics/online', async (req, res) => {
    try {
      const db = await getDB();
      
      const onlineUsers = await db.collection('login_sessions')
        .find({ 
          isActive: true,
          logoutTime: null,
          loginTime: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
        })
        .sort({ loginTime: -1 })
        .toArray();
      
      res.json({ count: onlineUsers.length, users: onlineUsers });
      
    } catch (err) {
      console.error('❌ Online users error:', err.message);
      res.status(500).json({ error: 'Failed to load online users' });
    }
  });

  // ✅ Update user activity on each request
  app.use(async (req, res, next) => {
    if (req.isAuthenticated() && req.user?.email) {
      try {
        const db = await getDB();
        await db.collection('users').updateOne(
          { email: req.user.email },
          { $set: { lastActive: new Date() } }
        );
      } catch (err) {
        // Silently fail - don't break the request
      }
    }
    next();
  });

  console.log('🔐 Google Login module initialized successfully!');
  console.log('🔐 callbackURL:', callbackURL);
}

// ✅ Export helper functions for use in server.js
export async function saveChatToHistory(email, userMessage, aiResponse, searchParams = {}) {
  try {
    const db = await getDB();
    await db.collection('users').updateOne(
      { email },
      {
        $push: {
          chatHistory: {
            sessionId: `session_${Date.now()}`,
            timestamp: new Date(),
            userMessage,
            aiResponse,
            searchParams
          }
        },
        $set: { lastActive: new Date() }
      }
    );
    return { success: true };
  } catch (err) {
    console.error('❌ Save chat error:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getUserChatHistory(email, limit = 50) {
  try {
    const db = await getDB();
    const user = await db.collection('users').findOne(
      { email },
      { projection: { chatHistory: 1 } }
    );
    return user?.chatHistory?.slice(-limit).reverse() || [];
  } catch (err) {
    console.error('❌ Load history error:', err.message);
    return [];
  }
}