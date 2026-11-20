import { sequelize, isPostgres } from '../../database/connection.js';

/**
 * Postgres full-text helpers for global search.
 * SQLite (tests) keeps ILIKE/LIKE; callers branch on `isPostgres`.
 */

/** Strip characters that break plainto_tsquery or LIKE wildcards. */
export function sanitizeFtsTerm(q) {
  return String(q || '')
    .replace(/[%_]/g, ' ')
    .replace(/[':\\!&|()*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Soft recency boost (~0–15) so fresh hits float above stale duplicates. */
export function recencyBoost(date) {
  if (!date) return 0;
  const ageDays = Math.max(0, (Date.now() - new Date(date).getTime()) / 86_400_000);
  return Math.exp(-ageDays / 30) * 15;
}

/**
 * Weighted document vector SQL for a Sequelize model alias.
 * A = title/key, B = body/description.
 */
export function weightedVectorSql(alias, { title, key, body }) {
  const parts = [];
  if (title) {
    parts.push(`setweight(to_tsvector('english', coalesce("${alias}"."${title}", '')), 'A')`);
  }
  if (key) {
    parts.push(`setweight(to_tsvector('english', coalesce("${alias}"."${key}", '')), 'A')`);
  }
  if (body) {
    parts.push(`setweight(to_tsvector('english', coalesce("${alias}"."${body}", '')), 'B')`);
  }
  return `(${parts.join(' || ')})`;
}

export const ISSUE_VECTOR = weightedVectorSql('Issue', { title: 'title', key: 'key', body: 'description' });
export const WIKI_VECTOR = weightedVectorSql('WikiPage', { title: 'title', body: 'body' });
export const MESSAGE_VECTOR = weightedVectorSql('ConversationMessage', { title: 'subject', body: 'body' });
/** Matches `chat_messages_fts_gin` (body only, no weight). */
export const CHAT_VECTOR = `(to_tsvector('english', coalesce("ChatMessage"."body", '')))`;
export const PROJECT_VECTOR = weightedVectorSql('Project', { title: 'name', key: 'key' });

/** `vector @@ plainto_tsquery(...)` literal for WHERE. */
export function ftsMatch(vectorSql, term) {
  return sequelize.literal(`${vectorSql} @@ plainto_tsquery('english', ${sequelize.escape(term)})`);
}

/** `ts_rank_cd(vector, query)` for SELECT / ORDER BY. */
export function ftsRank(vectorSql, term) {
  return sequelize.literal(`ts_rank_cd(${vectorSql}, plainto_tsquery('english', ${sequelize.escape(term)}))`);
}

/** Turn a ts_rank_cd value into a 0–40 bonus comparable to the JS score ladder. */
export function rankBonus(rank) {
  const value = Number(rank) || 0;
  if (value <= 0) return 0;
  return Math.min(40, Math.round(value * 120));
}

export { isPostgres };
