import { useTheme } from 'next-themes';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import type { TerminalDockPosition } from '@/lib/terminal-dock-store';
import { getInitialTerminalHeight, writeTerminalHeight } from '@/lib/terminal-height-store';
import { cn } from '@/lib/utils';
import { xtermThemeForMode } from './terminal-theme';

const TERMINAL_PANEL_ID = 'terminal-dock-panel';

interface TerminalDockProps {
  readonly children: ReactNode;
  readonly visible: boolean;
  readonly onVisibleChange: (visible: boolean) => void;
  readonly dockPosition?: TerminalDockPosition;
  readonly onBottomContainer: (el: HTMLDivElement | null) => void;
  readonly onEditorRegion: (el: HTMLDivElement | null) => void;
}

export function TerminalDock({
  children,
  visible,
  onVisibleChange,
  dockPosition = 'bottom',
  onBottomContainer,
  onEditorRegion,
}: TerminalDockProps) {
  const { resolvedTheme } = useTheme();
  const panelRef = usePanelRef();
  const [isCollapsed, setIsCollapsed] = useState(!visible);
  const xtermBackground = xtermThemeForMode(resolvedTheme).background;

  const [initialHeightPx] = useState(() => getInitialTerminalHeight());
  const heightPxRef = useRef(initialHeightPx);

  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function debouncedWriteHeight(px: number) {
    if (writeTimerRef.current != null) clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(() => {
      writeTerminalHeight(px);
      writeTimerRef.current = null;
    }, 100);
  }
  const dragUpHandlerRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      if (writeTimerRef.current != null) clearTimeout(writeTimerRef.current);
      if (dragUpHandlerRef.current != null) {
        window.removeEventListener('pointerup', dragUpHandlerRef.current);
        dragUpHandlerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    const panel = panelRef.current;
    if (panel == null) return;
    if (visible && dockPosition === 'bottom') {
      panel.resize(`${heightPxRef.current}px`);
    } else {
      panel.collapse();
    }
  }, [visible, panelRef, dockPosition]);

  return (
    <ResizablePanelGroup
      orientation="vertical"
      className="min-h-0 flex-1"
      data-dragging={isDragging || undefined}
    >
      <ResizablePanel minSize="5%" className="flex min-h-0 flex-col">
        {/* tabIndex -1 makes this a programmatic focus target for focus-return on
            collapse without adding it to the tab order. */}
        <div
          ref={onEditorRegion}
          tabIndex={-1}
          className="flex h-full min-h-0 flex-col outline-none"
        >
          {children}
        </div>
      </ResizablePanel>
      <ResizableHandle
        withHandle
        onPointerDown={() => {
          setIsDragging(true);
          isDraggingRef.current = true;
          const handleUp = () => {
            setIsDragging(false);
            isDraggingRef.current = false;
            window.removeEventListener('pointerup', handleUp);
            dragUpHandlerRef.current = null;
          };
          dragUpHandlerRef.current = handleUp;
          window.addEventListener('pointerup', handleUp);
        }}
      />
      <ResizablePanel
        id={TERMINAL_PANEL_ID}
        style={{ backgroundColor: xtermBackground }}
        panelRef={panelRef}
        defaultSize={visible && dockPosition === 'bottom' ? `${initialHeightPx}px` : 0}
        minSize="120px"
        maxSize="95%"
        collapsible
        collapsedSize={0}
        onResize={(size) => {
          const collapsed = size.asPercentage === 0;
          setIsCollapsed(collapsed);
          if (isDraggingRef.current) {
            if (collapsed && visible) onVisibleChange(false);
            else if (!collapsed && !visible) onVisibleChange(true);
            if (size.inPixels > 0) {
              heightPxRef.current = size.inPixels;
              debouncedWriteHeight(size.inPixels);
            }
          }
        }}
        inert={isCollapsed}
        className={cn(
          'flex flex-col',
          !isDragging &&
            'transition-[flex-grow] duration-150 ease-out motion-reduce:transition-none motion-reduce:duration-0',
        )}
      >
        {/* Mount point for the session host's stable host div when bottom-docked. */}
        <div ref={onBottomContainer} className="flex min-h-0 flex-1 flex-col overflow-hidden" />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
