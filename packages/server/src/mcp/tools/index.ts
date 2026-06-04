
import type { AgentIdentity } from '../agent-identity.ts';
import { getCurrentMcpLogger, type McpLogger } from '../logger.ts';
import { createLoggedServer } from '../tool-logging.ts';
import {
  DESCRIPTION as CONSOLIDATE_DESCRIPTION,
  register as registerConsolidate,
} from './consolidate.ts';
import {
  DESCRIPTION as DELETE_DOCUMENT_DESCRIPTION,
  register as registerDeleteDocument,
} from './delete-document.ts';
import { DESCRIPTION as DISCOVER_DESCRIPTION, register as registerDiscover } from './discover.ts';
import {
  DESCRIPTION as EDIT_DOCUMENT_DESCRIPTION,
  register as registerEditDocument,
} from './edit-document.ts';
import {
  DESCRIPTION as EDIT_FRONTMATTER_DESCRIPTION,
  register as registerEditFrontmatter,
} from './edit-frontmatter.ts';
import { DESCRIPTION as EXEC_DESCRIPTION, register as registerExec } from './exec.ts';
import {
  DESCRIPTION as FOLDER_CONFIG_DESCRIPTION,
  register as registerFolderConfig,
} from './folder-config.ts';
import {
  DESCRIPTION as GET_AUTHORING_PALETTE_DESCRIPTION,
  register as registerGetAuthoringPalette,
} from './get-authoring-palette.ts';
import {
  DESCRIPTION as GET_COMPONENTS_DESCRIPTION,
  register as registerGetComponents,
} from './get-components.ts';
import {
  DESCRIPTION as GET_CONFIG_DESCRIPTION,
  register as registerGetConfig,
} from './get-config.ts';
import {
  DESCRIPTION as GET_CONFLICT_CONTENT_DESCRIPTION,
  register as registerGetConflictContent,
} from './get-conflict-content.ts';
import {
  DESCRIPTION as GET_HISTORY_DESCRIPTION,
  register as registerGetHistory,
} from './get-history.ts';
import {
  DESCRIPTION as GET_PREVIEW_URL_DESCRIPTION,
  register as registerGetPreviewUrl,
} from './get-preview-url.ts';
import { DESCRIPTION as INGEST_DESCRIPTION, register as registerIngest } from './ingest.ts';
import { DESCRIPTION as LINKS_DESCRIPTION, register as registerLinks } from './links.ts';
import {
  DESCRIPTION as LIST_CONFLICTS_DESCRIPTION,
  register as registerListConflicts,
} from './list-conflicts.ts';
import { DESCRIPTION as RENAME_DESCRIPTION, register as registerRename } from './rename.ts';
import { DESCRIPTION as RESEARCH_DESCRIPTION, register as registerResearch } from './research.ts';
import {
  DESCRIPTION as RESOLVE_CONFLICT_DESCRIPTION,
  register as registerResolveConflict,
} from './resolve-conflict.ts';
import { register as registerSearch, DESCRIPTION as SEARCH_DESCRIPTION } from './search.ts';
import {
  register as registerShareLink,
  DESCRIPTION as SHARE_LINK_DESCRIPTION,
} from './share-link.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import { register as registerVersion, DESCRIPTION as VERSION_DESCRIPTION } from './version.ts';
import {
  register as registerWriteDocument,
  DESCRIPTION as WRITE_DOCUMENT_DESCRIPTION,
} from './write-document.ts';

const _TOOL_DESCRIPTIONS = {
  exec: EXEC_DESCRIPTION,
  ingest: INGEST_DESCRIPTION,
  research: RESEARCH_DESCRIPTION,
  consolidate: CONSOLIDATE_DESCRIPTION,
  discover: DISCOVER_DESCRIPTION,
  rename: RENAME_DESCRIPTION,
  search: SEARCH_DESCRIPTION,
  links: LINKS_DESCRIPTION,
  write_document: WRITE_DOCUMENT_DESCRIPTION,
  edit_document: EDIT_DOCUMENT_DESCRIPTION,
  edit_frontmatter: EDIT_FRONTMATTER_DESCRIPTION,
  delete_document: DELETE_DOCUMENT_DESCRIPTION,
  get_history: GET_HISTORY_DESCRIPTION,
  version: VERSION_DESCRIPTION,
  get_components: GET_COMPONENTS_DESCRIPTION,
  get_authoring_palette: GET_AUTHORING_PALETTE_DESCRIPTION,
  get_config: GET_CONFIG_DESCRIPTION,
  get_preview_url: GET_PREVIEW_URL_DESCRIPTION,
  folder_config: FOLDER_CONFIG_DESCRIPTION,
  list_conflicts: LIST_CONFLICTS_DESCRIPTION,
  get_conflict_content: GET_CONFLICT_CONTENT_DESCRIPTION,
  resolve_conflict: RESOLVE_CONFLICT_DESCRIPTION,
  share_link: SHARE_LINK_DESCRIPTION,
} as const;

type ResolveCwd = (explicit?: string) => Promise<string>;

interface RegisterAllToolsOptions {
  serverUrl?: ServerUrlOrResolver;
  resolveCwd: ResolveCwd;
  config: ConfigOrResolver;
  identityRef?: { current: AgentIdentity };
  logger?: McpLogger;
}

export function registerAllTools(server: ServerInstance, opts: RegisterAllToolsOptions): void {
  const log = opts.logger;
  const registrationServer = createLoggedServer(server, {
    logger: opts.logger,
    identityRef: opts.identityRef,
  });
  const named =
    (tool: string): ResolveCwd =>
    async (explicit?: string) => {
      try {
        const cwd = await opts.resolveCwd(explicit);
        const activeLog = getCurrentMcpLogger() ?? log;
        activeLog?.debug('tool cwd resolved', { tool, cwd, ...(explicit ? { explicit } : {}) });
        return cwd;
      } catch (err) {
        const activeLog = getCurrentMcpLogger() ?? log;
        activeLog?.warn('tool call failed', {
          tool,
          error: err instanceof Error ? err.message : String(err),
          ...(explicit ? { explicit } : {}),
        });
        throw err;
      }
    };

  registerExec(registrationServer, {
    resolveCwd: named('exec'),
    serverUrl: opts.serverUrl,
    config: opts.config,
  });

  registerIngest(registrationServer, { config: opts.config, resolveCwd: named('ingest') });
  registerResearch(registrationServer, { config: opts.config, resolveCwd: named('research') });
  registerConsolidate(registrationServer, {
    config: opts.config,
    resolveCwd: named('consolidate'),
  });

  registerDiscover(registrationServer, { config: opts.config, resolveCwd: named('discover') });

  registerSearch(registrationServer, {
    resolveCwd: named('search'),
    config: opts.config,
    serverUrl: opts.serverUrl,
  });
  registerLinks(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('links'),
  });

  registerWriteDocument(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('write_document'),
    identityRef: opts.identityRef,
  });
  registerEditDocument(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('edit_document'),
    identityRef: opts.identityRef,
  });
  registerDeleteDocument(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('delete_document'),
    identityRef: opts.identityRef,
  });
  registerEditFrontmatter(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('edit_frontmatter'),
    identityRef: opts.identityRef,
  });
  registerRename(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('rename'),
    identityRef: opts.identityRef,
  });
  registerGetHistory(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('get_history'),
  });
  registerVersion(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('version'),
    identityRef: opts.identityRef,
  });
  registerGetComponents(registrationServer, {
    resolveCwd: named('get_components'),
    config: opts.config,
  });
  registerGetAuthoringPalette(registrationServer, {
    resolveCwd: named('get_authoring_palette'),
    config: opts.config,
  });

  registerGetConfig(registrationServer, {
    config: opts.config,
    resolveCwd: named('get_config'),
  });
  registerGetPreviewUrl(registrationServer, {
    config: opts.config,
    resolveCwd: named('get_preview_url'),
  });
  registerFolderConfig(registrationServer, {
    config: opts.config,
    resolveCwd: named('folder_config'),
  });

  registerListConflicts(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('list_conflicts'),
  });
  registerGetConflictContent(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('get_conflict_content'),
  });
  registerResolveConflict(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('resolve_conflict'),
  });

  registerShareLink(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('share_link'),
  });
}
