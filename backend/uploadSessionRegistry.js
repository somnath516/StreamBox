/**
 * Upload Session Registry
 * Manages upload sessions for resumable/chunked uploads
 */

const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const logger = require('./utils/logger');

// In-memory session storage
const sessions = new Map();

// Session timeout (15 minutes)
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Get or create upload session registry
 */
function getUploadSessionRegistry(options = {}) {
  const { dirs } = options;

  return {
    /**
     * Create a new upload session
     */
    createSession(sessionId) {
      if (sessions.has(sessionId)) {
        const session = sessions.get(sessionId);
        session.lastAccess = Date.now();
        session.status = 'active';
        return session;
      }

      const session = {
        id: sessionId,
        status: 'active',
        createdAt: Date.now(),
        lastAccess: Date.now(),
        files: [],
        metadata: {},
      };

      sessions.set(sessionId, session);
      return session;
    },

    /**
     * Update session status
     */
    async updateSessionStatus(sessionId, status, metadata = {}) {
      const session = sessions.get(sessionId);
      if (!session) return null;

      session.status = status;
      session.lastAccess = Date.now();
      session.updatedAt = Date.now();

      if (metadata && Object.keys(metadata).length > 0) {
        session.metadata = { ...session.metadata, ...metadata };
      }

      logger.info('[UPLOAD_SESSION] status_updated', {
        sessionId,
        status,
        metadata,
      });

      return session;
    },

    /**
     * Register a file in the session
     */
    registerFile(sessionId, fileMeta) {
      const session = sessions.get(sessionId);
      if (!session) return null;

      if (!session.files) {
        session.files = [];
      }

      session.files.push({
        ...fileMeta,
        registeredAt: Date.now(),
      });

      session.lastAccess = Date.now();

      logger.info('[UPLOAD_SESSION] file_registered', {
        sessionId,
        filename: fileMeta.filename,
        fieldname: fileMeta.fieldname,
      });

      return session;
    },

    /**
     * Promote session - move files from temp to final location
     */
    async promoteSession(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      if (session.status !== 'active') {
        throw new Error(`Session not in active state: ${session.status}`);
      }

      logger.info('[UPLOAD_SESSION] promoting_session', {
        sessionId,
        fileCount: session.files ? session.files.length : 0,
      });

      // Mark as promoted
      session.status = 'promoted';
      session.promotedAt = Date.now();

      return session;
    },

    /**
     * Move orphan files - cleanup files from failed sessions
     */
    async moveOrphanFiles(sessionId) {
      const session = sessions.get(sessionId);
      if (!session || !session.files) {
        return;
      }

      logger.info('[UPLOAD_SESSION] moving_orphan_files', {
        sessionId,
        fileCount: session.files.length,
      });

      // Clean up temp files
      for (const file of session.files) {
        try {
          const tempPath = path.join(
            dirs?.uploadTemp || path.join(process.cwd(), 'uploads', 'tmp'),
            file.filename
          );

          if (fsSync.existsSync(tempPath)) {
            await fs.unlink(tempPath).catch(() => {});
          }
        } catch (err) {
          logger.warn('[UPLOAD_SESSION] orphan_cleanup_failed', {
            sessionId,
            filename: file.filename,
            error: err.message,
          });
        }
      }
    },

    /**
     * Get session by ID
     */
    getSession(sessionId) {
      return sessions.get(sessionId) || null;
    },

    /**
     * Recover stale sessions
     */
    async recoverSessions() {
      const now = Date.now();
      let recovered = 0;

      for (const [sessionId, session] of sessions.entries()) {
        const age = now - session.lastAccess;

        if (age > SESSION_TIMEOUT_MS && session.status === 'active') {
          logger.info('[UPLOAD_SESSION] recovering_stale_session', {
            sessionId,
            age,
            status: session.status,
          });

          await this.updateSessionStatus(sessionId, 'expired');
          await this.moveOrphanFiles(sessionId);
          sessions.delete(sessionId);
          recovered++;
        }
      }

      if (recovered > 0) {
        logger.info('[UPLOAD_SESSION] recovery_complete', { recovered });
      }

      return recovered;
    },

    /**
     * Get all active sessions
     */
    getActiveSessions() {
      const active = [];
      for (const [sessionId, session] of sessions.entries()) {
        if (session.status === 'active') {
          active.push({ id: sessionId, ...session });
        }
      }
      return active;
    },

    /**
     * Clean up all sessions
     */
    async cleanup() {
      for (const [sessionId, session] of sessions.entries()) {
        await this.moveOrphanFiles(sessionId);
      }
      sessions.clear();
      logger.info('[UPLOAD_SESSION] cleanup_complete');
    },
  };
}

module.exports = { getUploadSessionRegistry };