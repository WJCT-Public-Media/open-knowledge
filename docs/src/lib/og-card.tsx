import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReactNode } from 'react';

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png';
export const OG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
} as const;

const BG = '#fbf9f4';
const TEXT = '#1a1a1a';
const MUTED = '#71717a';
const ACCENT = '#3685ff';
const DOT_COLOR = '#e3e3e1';
const DOT_SPACING = 24;
const DOT_RADIUS = 1.8;
const MASK_INNER = 0.7;
const MASK_OUTER = 1.3;
const PAD_X = 72;
const PAD_Y = 64;
const CARD_W = OG_SIZE.width;
const CARD_H = OG_SIZE.height;

const WORDMARK_NATURAL_W = 318;
const WORDMARK_NATURAL_H = 55;
const WORDMARK_HEIGHT = 44;
const WORDMARK_WIDTH = Math.round((WORDMARK_HEIGHT * WORDMARK_NATURAL_W) / WORDMARK_NATURAL_H);

const FALLBACK_LOGO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const wordmarkDataUrl = (() => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), 'public', 'ok-wordmark.svg'),
    path.join(here, '..', '..', 'public', 'ok-wordmark.svg'),
  ];
  for (const candidate of candidates) {
    try {
      const bytes = readFileSync(candidate);
      return `data:image/svg+xml;base64,${bytes.toString('base64')}`;
    } catch {
    }
  }
  return FALLBACK_LOGO;
})();

interface MaskEllipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

function DotGrid({ masks }: { masks: MaskEllipse[] }) {
  const cols = Math.ceil(CARD_W / DOT_SPACING);
  const rows = Math.ceil(CARD_H / DOT_SPACING);
  const dots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * DOT_SPACING + DOT_SPACING / 2;
      const cy = r * DOT_SPACING + DOT_SPACING / 2;
      let nearest = Infinity;
      for (const m of masks) {
        const d = Math.hypot((cx - m.cx) / m.rx, (cy - m.cy) / m.ry);
        if (d < nearest) nearest = d;
      }
      const opacity = Math.min(1, Math.max(0, (nearest - MASK_INNER) / (MASK_OUTER - MASK_INNER)));
      if (opacity < 0.03) continue;
      dots.push(
        <circle
          key={`${r}-${c}`}
          cx={cx}
          cy={cy}
          r={DOT_RADIUS}
          fill={DOT_COLOR}
          opacity={opacity.toFixed(3)}
        />,
      );
    }
  }
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: CARD_W,
        height: CARD_H,
        display: 'flex',
      }}
    >
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: rasterized to PNG by satori; ARIA never reaches an a11y tree. */}
      <svg width={CARD_W} height={CARD_H} viewBox={`0 0 ${CARD_W} ${CARD_H}`}>
        {dots}
      </svg>
    </div>
  );
}

function Wordmark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {/* biome-ignore lint: satori renders a raster; next/image is browser-only and requires explicit dimensions here. */}
      <img
        src={wordmarkDataUrl}
        width={WORDMARK_WIDTH}
        height={WORDMARK_HEIGHT}
        alt="Open Knowledge"
      />
    </div>
  );
}

function FilenameWithScribble({
  filename,
  fontSize = 88,
}: {
  filename: string;
  fontSize?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <h1
        style={{
          fontSize,
          fontWeight: 300,
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          margin: 0,
          color: TEXT,
          overflowWrap: 'break-word',
        }}
      >
        {filename}
      </h1>
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: rasterized to PNG by satori; ARIA never reaches an a11y tree. */}
      <svg
        width={800}
        height={20}
        viewBox="0 0 286 14"
        fill="none"
        preserveAspectRatio="none"
        style={{ marginTop: 8 }}
      >
        <path
          d="M3 11C45 3.5 91.5 1.5 143 5.5C194.5 9.5 241 7 283 3"
          stroke={ACCENT}
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function CardFrame({ masks, children }: { masks: MaskEllipse[]; children: ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        backgroundColor: BG,
        fontFamily: 'DM Sans',
        color: TEXT,
      }}
    >
      <DotGrid masks={masks} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          padding: `${PAD_Y}px ${PAD_X}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {children}
      </div>
    </div>
  );
}

const LOGO_MASK: MaskEllipse = { cx: 200, cy: 86, rx: 260, ry: 70 };
const BODY_MASK: MaskEllipse = { cx: 400, cy: 500, rx: 650, ry: 220 };

export function BrandCard() {
  return (
    <CardFrame masks={[LOGO_MASK, BODY_MASK]}>
      <Wordmark />
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 1056 }}>
        <h1
          style={{
            fontSize: 76,
            fontWeight: 300,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            margin: 0,
            whiteSpace: 'pre-line',
          }}
        >
          {'Your knowledge,\nco-authored by AI'}
        </h1>
      </div>
    </CardFrame>
  );
}

export function DocPageCard({
  title,
  description,
}: {
  title: string;
  description?: string | null;
}) {
  return (
    <CardFrame masks={[LOGO_MASK, BODY_MASK]}>
      <Wordmark />
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 1056 }}>
        <FilenameWithScribble filename={title} fontSize={titleFontSize(title)} />
        {description ? (
          <div
            style={{
              display: 'flex',
              fontSize: 26,
              fontWeight: 500,
              color: MUTED,
              marginTop: 28,
              maxWidth: 1000,
            }}
          >
            <span>{description}</span>
          </div>
        ) : null}
      </div>
    </CardFrame>
  );
}

function titleFontSize(title: string): number {
  if (title.length > 36) return 64;
  if (title.length > 24) return 76;
  return 88;
}

export function ShareCard({
  filename,
  repoPath,
  branch,
  isDefaultBranch,
}: {
  filename: string;
  repoPath: string;
  branch: string;
  isDefaultBranch: boolean;
}) {
  return (
    <CardFrame masks={[LOGO_MASK, BODY_MASK]}>
      <Wordmark />
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 1056 }}>
        <FilenameWithScribble filename={filename} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: 28,
            fontWeight: 500,
            color: MUTED,
            marginTop: 28,
          }}
        >
          <span>{repoPath}</span>
          {isDefaultBranch ? null : (
            <span style={{ display: 'flex', alignItems: 'center', marginLeft: 18, color: TEXT }}>
              <span style={{ color: MUTED, opacity: 0.5, marginRight: 18 }}>•</span>
              on&nbsp;<span style={{ fontWeight: 500 }}>{branch}</span>
            </span>
          )}
        </div>
      </div>
    </CardFrame>
  );
}

export interface FontPair {
  light: ArrayBuffer;
  medium: ArrayBuffer;
}

const DM_SANS_LIGHT_URL =
  'https://fonts.gstatic.com/s/dmsans/v15/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAo69EBlec.ttf';
const DM_SANS_MEDIUM_URL =
  'https://fonts.gstatic.com/s/dmsans/v15/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAoa9EBlec.ttf';

export async function loadDmSans(): Promise<FontPair | null> {
  try {
    const [light, medium] = await Promise.all([
      fetch(DM_SANS_LIGHT_URL).then((r) => (r.ok ? r.arrayBuffer() : null)),
      fetch(DM_SANS_MEDIUM_URL).then((r) => (r.ok ? r.arrayBuffer() : null)),
    ]);
    if (!light || !medium) return null;
    return { light, medium };
  } catch {
    return null;
  }
}

export function dmSansFontsArg(fonts: FontPair | null) {
  return fonts
    ? [
        { name: 'DM Sans', data: fonts.light, weight: 300 as const, style: 'normal' as const },
        { name: 'DM Sans', data: fonts.medium, weight: 500 as const, style: 'normal' as const },
      ]
    : undefined;
}
