import { type AnyOrama, create, insertMultiple, search } from '@orama/orama';
import { isHiddenDocName } from '../util/doc-name.ts';

export type WorkspaceSearchKind = 'page' | 'folder' | 'file';
export type WorkspaceSearchIntent = 'omnibar' | 'autocomplete' | 'full_text';
export type WorkspaceSearchScope = WorkspaceSearchKind | 'content';

export type WorkspaceSearchRanking = 'navigation' | 'relevance';

export interface WorkspaceSearchDocument {
  id: string;
  kind: WorkspaceSearchKind;
  path: string;
  title: string;
  name: string;
  pathSegments: string;
  content: string;
  modifiedTs: number;
}

export interface WorkspaceSearchResult {
  document: WorkspaceSearchDocument;
  score: number;
  signals: {
    lexical: number;
    fullText: number;
    recency: number;
    vector?: number;
  };
}

export interface WorkspaceSemanticInput {
  scores: ReadonlyMap<string, number>;
  rrfK?: number;
  candidateLimit?: number;
  similarityFloor?: number;
}

export interface WorkspaceSearchOptions {
  intent?: WorkspaceSearchIntent;
  ranking?: WorkspaceSearchRanking;
  scopes?: readonly WorkspaceSearchScope[];
  limit?: number;
  semantic?: WorkspaceSemanticInput;
}

export interface WorkspaceSearchCorpus {
  documents: readonly WorkspaceSearchDocument[];
}

export const DEFAULT_WORKSPACE_SEARCH_LIMIT = 20;
export const MAX_WORKSPACE_SEARCH_LIMIT = 100;

export const DEFAULT_RRF_K = 60;
export const DEFAULT_VECTOR_CANDIDATE_LIMIT = 64;
export const DEFAULT_VECTOR_SIMILARITY_FLOOR = 0;

export const DEFAULT_FOLDER_RESULT_CAP = 3;
export const DEFAULT_FILE_RESULT_CAP = 3;

const WORKSPACE_SEARCH_SCHEMA = {
  id: 'string',
  kind: 'enum',
  path: 'string',
  title: 'string',
  name: 'string',
  pathSegments: 'string',
  content: 'string',
  modifiedTs: 'number',
} as const;

type WorkspaceSearchDocumentField = 'title' | 'name' | 'path' | 'pathSegments' | 'content';
type WorkspaceSearchIndex = AnyOrama;

const workspaceSearchIndexes = new WeakMap<WorkspaceSearchCorpus, WorkspaceSearchIndex>();

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_WORKSPACE_SEARCH_LIMIT;
  return Math.max(1, Math.min(MAX_WORKSPACE_SEARCH_LIMIT, Math.trunc(limit)));
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

const DOC_EXTENSION_RE = /\.(?:md|mdx)$/;

function queryForKind(normalizedQuery: string, kind: WorkspaceSearchKind): string {
  if (kind !== 'page') return normalizedQuery;
  const stripped = normalizedQuery.replace(DOC_EXTENSION_RE, '');
  return stripped.length > 0 ? stripped : normalizedQuery;
}

export function workspaceSearchBasename(path: string): string {
  const segments = path.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

export function workspaceSearchPathSegments(path: string): string {
  return path.split('/').filter(Boolean).join(' ');
}

export function createWorkspaceSearchDocument(input: {
  kind: WorkspaceSearchKind;
  path: string;
  title?: string | null;
  content?: string | null;
  modifiedTs?: number | null;
  aliases?: readonly string[] | null;
}): WorkspaceSearchDocument {
  const name = workspaceSearchBasename(input.path);
  const title = input.title?.trim() || name;
  const modifiedTs = input.modifiedTs ?? 0;
  const baseSegments = input.path.split('/').filter(Boolean);
  const baseSet = new Set(baseSegments);
  const aliasSegments = [
    ...new Set(
      (input.aliases ?? [])
        .flatMap((alias) => alias.split('/').filter(Boolean))
        .filter((segment) => !baseSet.has(segment)),
    ),
  ];
  return {
    id: `${input.kind}:${input.path}`,
    kind: input.kind,
    path: input.path,
    title,
    name,
    pathSegments: [...baseSegments, ...aliasSegments].join(' '),
    content: input.content ?? '',
    modifiedTs: Number.isFinite(modifiedTs) ? modifiedTs : 0,
  };
}

function createWorkspaceSearchIndex(
  documents: readonly WorkspaceSearchDocument[],
): WorkspaceSearchIndex {
  const db = create({ schema: WORKSPACE_SEARCH_SCHEMA });
  if (documents.length > 0) {
    insertMultiple(db, documents as WorkspaceSearchDocument[]);
  }
  return db;
}

export function createWorkspaceSearchCorpus(
  documents: readonly WorkspaceSearchDocument[],
): WorkspaceSearchCorpus {
  const corpus = {
    documents,
  };
  workspaceSearchIndexes.set(corpus, createWorkspaceSearchIndex(documents));
  return corpus;
}

function getWorkspaceSearchIndex(corpus: WorkspaceSearchCorpus): WorkspaceSearchIndex {
  const existing = workspaceSearchIndexes.get(corpus);
  if (existing) return existing;
  const index = createWorkspaceSearchIndex(corpus.documents);
  workspaceSearchIndexes.set(corpus, index);
  return index;
}

function defaultScopes(intent: WorkspaceSearchIntent): readonly WorkspaceSearchScope[] {
  if (intent === 'autocomplete') return ['page'];
  if (intent === 'full_text') return ['page', 'content', 'file'];
  return ['page', 'folder', 'file'];
}

function scopeAllows(document: WorkspaceSearchDocument, scopes: ReadonlySet<WorkspaceSearchScope>) {
  if (scopes.has(document.kind)) return true;
  return document.kind === 'page' && scopes.has('content');
}

function lexicalBracket(document: WorkspaceSearchDocument, query: string): number {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 0;
  const q = queryForKind(normalizedQuery, document.kind);

  const title = normalize(document.title);
  const name = normalize(document.name);
  const path = normalize(document.path);
  const pathSegments = path.split('/');

  if (title === q || name === q) return 700;
  if (path === q) return 650;
  if (title.startsWith(q) || name.startsWith(q)) return 600;
  if (pathSegments.some((segment) => segment.startsWith(q))) return 550;
  if (title.includes(q) || name.includes(q)) return 500;
  if (path.includes(q)) return 450;
  return -1;
}

const HIDDEN_DOC_LEXICAL_PENALTY = 0.5;

function lexicalScore(document: WorkspaceSearchDocument, query: string): number {
  const bracket = lexicalBracket(document, query);
  if (bracket <= 0) return bracket;
  return isHiddenDocName(document.path) ? bracket * HIDDEN_DOC_LEXICAL_PENALTY : bracket;
}

const FILE_KIND_SCORE_DEMOTION = 60;

function canonicalKindAdjustment(kind: WorkspaceSearchKind): number {
  return kind === 'file' ? -FILE_KIND_SCORE_DEMOTION : 0;
}

const TIER_DOMINANT_GAP = 1000;

const NAV_RECENCY_CAP = 50;

const NAV_BODY_WEIGHT = 1;
const NAV_RECENCY_WEIGHT = 1;

const NAV_KIND_NUDGE = 0.001;

function navigationScore(
  lexical: number,
  fullText: number,
  recency: number,
  kind: WorkspaceSearchKind,
  maxFullText: number,
): number {
  const bodyNorm = maxFullText > 0 ? fullText / maxFullText : 0;
  const recencyNorm = NAV_RECENCY_CAP > 0 ? recency / NAV_RECENCY_CAP : 0;
  const kindNudge = kind === 'file' ? -NAV_KIND_NUDGE : 0;
  const secondary = NAV_BODY_WEIGHT * bodyNorm + NAV_RECENCY_WEIGHT * recencyNorm + kindNudge;
  return lexical * TIER_DOMINANT_GAP + secondary;
}

function fullTextScore(
  lexical: number,
  fullText: number,
  recency: number,
  kind: WorkspaceSearchKind,
): number {
  return lexical + fullText * 20 + recency + canonicalKindAdjustment(kind);
}

function combinedScore(
  ranking: WorkspaceSearchRanking,
  lexical: number,
  fullText: number,
  recency: number,
  kind: WorkspaceSearchKind,
  maxFullText: number,
): number {
  return ranking === 'relevance'
    ? fullTextScore(lexical, fullText, recency, kind)
    : navigationScore(lexical, fullText, recency, kind, maxFullText);
}

function resolveRanking(
  intent: WorkspaceSearchIntent,
  ranking: WorkspaceSearchRanking | undefined,
): WorkspaceSearchRanking {
  if (ranking) return ranking;
  return intent === 'full_text' ? 'relevance' : 'navigation';
}

function maxFullTextScore(
  candidates: Iterable<WorkspaceSearchDocument>,
  fullTextScores: ReadonlyMap<string, number>,
): number {
  let max = 0;
  for (const document of candidates) {
    const value = fullTextScores.get(document.id) ?? 0;
    if (value > max) max = value;
  }
  return max;
}

function recencyScores(documents: readonly WorkspaceSearchDocument[]): Map<string, number> {
  const modifiedValues = documents
    .map((document) => document.modifiedTs)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (modifiedValues.length === 0) return new Map();

  let min = Infinity;
  let max = -Infinity;
  for (const v of modifiedValues) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = Math.max(1, max - min);
  return new Map(
    documents.map((document) => [
      document.id,
      document.modifiedTs > 0 ? ((document.modifiedTs - min) / range) * 50 : 0,
    ]),
  );
}

function searchProperties(intent: WorkspaceSearchIntent): WorkspaceSearchDocumentField[] {
  if (intent === 'full_text') return ['title', 'name', 'path', 'pathSegments', 'content'];
  return ['title', 'name', 'path', 'pathSegments'];
}

function searchBoost(
  intent: WorkspaceSearchIntent,
): Partial<Record<WorkspaceSearchDocumentField, number>> {
  if (intent === 'full_text') {
    return { title: 8, name: 7, path: 5, pathSegments: 4, content: 1 };
  }
  if (intent === 'autocomplete') {
    return { title: 10, name: 9, path: 5, pathSegments: 4 };
  }
  return { title: 8, name: 7, path: 5, pathSegments: 4 };
}

function toleranceFor(intent: WorkspaceSearchIntent, query: string): number {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length < 4) return 0;
  return intent === 'full_text' ? 1 : 0;
}

function finalizeResults(
  ranked: readonly WorkspaceSearchResult[],
  ranking: WorkspaceSearchRanking,
  limit: number,
): WorkspaceSearchResult[] {
  if (ranking === 'relevance') return ranked.slice(0, limit);
  const selected: WorkspaceSearchResult[] = [];
  let folders = 0;
  let files = 0;
  for (const result of ranked) {
    if (result.document.kind === 'folder') {
      if (folders >= DEFAULT_FOLDER_RESULT_CAP) continue;
      folders += 1;
    } else if (result.document.kind === 'file') {
      if (files >= DEFAULT_FILE_RESULT_CAP) continue;
      files += 1;
    }
    selected.push(result);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function searchWorkspaceDocuments(
  documents: readonly WorkspaceSearchDocument[],
  query: string,
  options: WorkspaceSearchOptions = {},
): WorkspaceSearchResult[] {
  return searchWorkspaceCorpus(createWorkspaceSearchCorpus(documents), query, options);
}

export function searchWorkspaceCorpus(
  corpus: WorkspaceSearchCorpus,
  query: string,
  options: WorkspaceSearchOptions = {},
): WorkspaceSearchResult[] {
  const intent = options.intent ?? 'omnibar';
  const ranking = resolveRanking(intent, options.ranking);
  const limit = clampLimit(options.limit);
  const scopes = new Set(options.scopes ?? defaultScopes(intent));
  const scopedDocuments = corpus.documents.filter((document) => scopeAllows(document, scopes));
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return scopedDocuments
      .slice()
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, limit)
      .map((document) => ({
        document,
        score: 0,
        signals: { lexical: 0, fullText: 0, recency: 0 },
      }));
  }

  const fullTextResults = search(getWorkspaceSearchIndex(corpus), {
    term: normalizedQuery,
    properties: searchProperties(intent),
    boost: searchBoost(intent),
    tolerance: toleranceFor(intent, normalizedQuery),
    limit: Math.max(limit * 4, 40),
  }) as {
    hits: Array<{ score: number; document: WorkspaceSearchDocument }>;
  };
  const fullTextScores = new Map(
    fullTextResults.hits
      .filter((hit) => scopeAllows(hit.document, scopes))
      .map((hit) => [hit.document.id, hit.score] as const),
  );
  const recency = recencyScores(scopedDocuments);
  const candidates = new Map<string, WorkspaceSearchDocument>();

  for (const document of scopedDocuments) {
    if (lexicalScore(document, normalizedQuery) >= 0) {
      candidates.set(document.id, document);
    }
  }
  for (const hit of fullTextResults.hits) {
    if (!scopeAllows(hit.document, scopes)) continue;
    candidates.set(hit.document.id, hit.document);
  }

  if (!options.semantic) {
    const maxFullText = maxFullTextScore(candidates.values(), fullTextScores);
    const ranked = [...candidates.values()]
      .map((document) => {
        const lexical = Math.max(0, lexicalScore(document, normalizedQuery));
        const fullText = fullTextScores.get(document.id) ?? 0;
        const recencyScore = recency.get(document.id) ?? 0;
        return {
          document,
          score: combinedScore(
            ranking,
            lexical,
            fullText,
            recencyScore,
            document.kind,
            maxFullText,
          ),
          signals: { lexical, fullText, recency: recencyScore },
        };
      })
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        return a.document.path.localeCompare(b.document.path);
      });
    return finalizeResults(ranked, ranking, limit);
  }

  return finalizeResults(
    rankWithVector({
      scopedDocuments,
      candidates,
      fullTextScores,
      recency,
      normalizedQuery,
      ranking,
      semantic: options.semantic,
    }),
    ranking,
    limit,
  );
}

interface SemanticRow {
  document: WorkspaceSearchDocument;
  score: number;
  signals: WorkspaceSearchResult['signals'];
  lexical: number;
  fullText: number;
  recency: number;
  cosine: number | undefined;
}

function denseRank(orderedIds: readonly string[]): Map<string, number> {
  const ranks = new Map<string, number>();
  orderedIds.forEach((id, i) => {
    ranks.set(id, i + 1);
  });
  return ranks;
}

function rankWithVector(args: {
  scopedDocuments: readonly WorkspaceSearchDocument[];
  candidates: Map<string, WorkspaceSearchDocument>;
  fullTextScores: ReadonlyMap<string, number>;
  recency: ReadonlyMap<string, number>;
  normalizedQuery: string;
  ranking: WorkspaceSearchRanking;
  semantic: WorkspaceSemanticInput;
}): WorkspaceSearchResult[] {
  const {
    scopedDocuments,
    candidates,
    fullTextScores,
    recency,
    normalizedQuery,
    ranking,
    semantic,
  } = args;
  const rrfK = semantic.rrfK ?? DEFAULT_RRF_K;
  const candidateLimit = semantic.candidateLimit ?? DEFAULT_VECTOR_CANDIDATE_LIMIT;
  const floor = semantic.similarityFloor ?? DEFAULT_VECTOR_SIMILARITY_FLOOR;
  const vectorScores = semantic.scores;

  const scopedById = new Map(scopedDocuments.map((d) => [d.id, d] as const));
  const topVector = [...vectorScores.entries()]
    .filter(([id, cos]) => cos >= floor && scopedById.has(id))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, candidateLimit);
  for (const [id] of topVector) {
    if (!candidates.has(id)) {
      const doc = scopedById.get(id);
      if (doc) candidates.set(id, doc);
    }
  }

  const maxFullText = maxFullTextScore(candidates.values(), fullTextScores);

  const rows: SemanticRow[] = [...candidates.values()].map((document) => {
    const lexical = Math.max(0, lexicalScore(document, normalizedQuery));
    const fullText = fullTextScores.get(document.id) ?? 0;
    const recencyScore = recency.get(document.id) ?? 0;
    const cosine = vectorScores.get(document.id);
    const qualifies = cosine !== undefined && cosine >= floor;
    const score =
      lexical > 0
        ? combinedScore(ranking, lexical, fullText, recencyScore, document.kind, maxFullText)
        : fullTextScore(lexical, fullText, recencyScore, document.kind);
    return {
      document,
      score,
      signals: qualifies
        ? { lexical, fullText, recency: recencyScore, vector: cosine }
        : { lexical, fullText, recency: recencyScore },
      lexical,
      fullText,
      recency: recencyScore,
      cosine,
    };
  });

  const bm25Rank = denseRank(
    rows
      .filter((r) => r.fullText > 0)
      .sort((a, b) => b.fullText - a.fullText || a.document.path.localeCompare(b.document.path))
      .map((r) => r.document.id),
  );
  const vecRank = denseRank(
    rows
      .filter(
        (r): r is SemanticRow & { cosine: number } => r.cosine !== undefined && r.cosine >= floor,
      )
      .sort((a, b) => b.cosine - a.cosine || a.document.path.localeCompare(b.document.path))
      .map((r) => r.document.id),
  );

  const rrfScore = (id: string): number => {
    let s = 0;
    const br = bm25Rank.get(id);
    if (br !== undefined) s += 1 / (rrfK + br);
    const vr = vecRank.get(id);
    if (vr !== undefined) s += 1 / (rrfK + vr);
    return s;
  };

  return rows
    .sort((a, b) => {
      const aLexical = a.lexical > 0 ? 1 : 0;
      const bLexical = b.lexical > 0 ? 1 : 0;
      if (aLexical !== bLexical) return bLexical - aLexical; // lexical tier first
      if (aLexical === 1) {
        if (a.score !== b.score) return b.score - a.score; // within lexical tier: legacy order
        return a.document.path.localeCompare(b.document.path);
      }
      const ar = rrfScore(a.document.id);
      const br = rrfScore(b.document.id);
      if (ar !== br) return br - ar; // body tier: RRF(BM25, vector)
      if (a.recency !== b.recency) return b.recency - a.recency;
      return a.document.path.localeCompare(b.document.path);
    })
    .map(({ document, score, signals }) => ({ document, score, signals }));
}
