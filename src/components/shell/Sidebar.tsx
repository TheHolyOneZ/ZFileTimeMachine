import { useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutGrid, Settings, Info, Plus, Search, PanelLeftClose, PanelLeft, Pause,
} from 'lucide-react';
import { useFolders } from '@/hooks/useFolders';
import { useAddFolderFlow } from '@/context/AddFolderContext';
import { FolderIcon } from '@/components/FolderIcon';
import { folderTint } from '@/lib/folderAppearance';
import { getCasSize, getGlobalSettings } from '@/lib/tauri';
import { IS_MAC } from '@/lib/platform';
import { useGlidePill } from '@/hooks/useGlidePill';
import logoUrl from '@/assets/logo.png';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  onOpenSearch: () => void;
}

function fmtBytes(b: number) {
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function StorageMeter({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate();
  const { data: used } = useQuery({ queryKey: ['cas-size'], queryFn: getCasSize, refetchInterval: 30_000 });
  const { data: settings } = useQuery({ queryKey: ['global-settings'], queryFn: getGlobalSettings });
  if (used == null) return null;
  const capBytes = settings?.global_size_cap_mb ? settings.global_size_cap_mb * 1024 * 1024 : null;
  const pct = capBytes ? Math.min(1, used / capBytes) : null;
  const label = capBytes ? `${fmtBytes(used)} of ${fmtBytes(capBytes)}` : `${fmtBytes(used)} of history`;

  if (collapsed) return null;
  return (
    <button
      onClick={() => navigate('/settings?section=storage')}
      className="press group w-full text-left px-2.5 py-2 rounded-md hover:bg-foreground/[0.05]"
      data-tip="Storage settings"
    >
      <div className="flex items-baseline justify-between text-2xs">
        <span className="text-muted-foreground group-hover:text-foreground">Storage</span>
        <span className="text-faint tabular-nums">{label}</span>
      </div>
      {pct != null && (
        <div className="mt-1.5 h-[3px] rounded-full bg-foreground/[0.08] overflow-hidden">
          <div
            className={`h-full rounded-full ${pct > 0.9 ? 'bg-caution' : 'bg-foreground/45'}`}
            style={{ width: `${Math.max(2, pct * 100)}%` }}
          />
        </div>
      )}
    </button>
  );
}

function NavRow({ to, end, icon, label, collapsed, trailing }: {
  to: string; end?: boolean; icon: React.ReactNode; label: string; collapsed: boolean; trailing?: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      data-nav-item
      data-tip={collapsed ? label : undefined}
      aria-label={label}
      className={({ isActive }) =>
        `relative z-10 flex items-center gap-2.5 h-8 rounded-[calc(8px*var(--rs))] text-sm select-none
         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60
         ${collapsed ? 'justify-center w-9 mx-auto' : 'px-2.5'}
         ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.045]'}`
      }
    >
      <span className="shrink-0 grid place-items-center w-4">{icon}</span>
      {!collapsed && <span className="flex-1 min-w-0 truncate">{label}</span>}
      {!collapsed && trailing}
    </NavLink>
  );
}

export function Sidebar({ collapsed, onToggle, onOpenSearch }: Props) {
  const { data: folders, isLoading } = useFolders();
  const { startAddFolder } = useAddFolderFlow();
  const location = useLocation();
  const listRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const bottomPillRef = useRef<HTMLSpanElement>(null);

  useGlidePill(listRef, pillRef, '[data-nav-item][aria-current="page"]', [location.pathname, folders, collapsed]);
  useGlidePill(bottomRef, bottomPillRef, '[data-nav-item][aria-current="page"]', [location.pathname, collapsed]);

  return (
    <aside
      aria-label="Sidebar"
      className="relative shrink-0 h-full flex flex-col bg-sidebar transition-[width] duration-500 ease-zftm"
      style={{ width: collapsed ? 68 : 'var(--sidebar-width)' }}
    >
      <div data-tauri-drag-region className={`h-[52px] shrink-0 flex items-center ${IS_MAC ? (collapsed ? 'justify-center pt-8' : 'pl-[86px] pr-2') : collapsed ? 'justify-center' : 'pl-4 pr-2'}`}>
        {!IS_MAC && (
          <div data-tauri-drag-region data-launch className="flex items-center gap-2.5 min-w-0 flex-1">
            <img src={logoUrl} alt="" draggable={false} className="w-[26px] h-[26px] shrink-0 pointer-events-none drop-shadow-[0_1px_2px_hsl(var(--shadow)/0.35)]" />
            {!collapsed && (
              <span data-tauri-drag-region className="text-sm font-semibold tracking-tight truncate">ZFileTimeMachine</span>
            )}
          </div>
        )}
        {!collapsed && (
          <button
            onClick={onToggle}
            data-launch
            aria-label="Collapse sidebar"
            data-tip="Collapse sidebar"
            className={`press w-7 h-7 rounded-md grid place-items-center text-faint hover:text-foreground hover:bg-foreground/[0.06] shrink-0 ${IS_MAC ? 'ml-auto' : ''}`}
          >
            <PanelLeftClose size={15} />
          </button>
        )}
      </div>

      <div className={`shrink-0 ${collapsed ? 'px-3.5 pt-1' : 'px-3'}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-1.5">
            <button onClick={onToggle} data-launch aria-label="Expand sidebar" data-tip="Expand sidebar"
              className="press w-9 h-8 rounded-md grid place-items-center text-faint hover:text-foreground hover:bg-foreground/[0.06]">
              <PanelLeft size={15} />
            </button>
            <button onClick={onOpenSearch} data-launch aria-label="Search" data-tip={IS_MAC ? 'Search  ⌘K' : 'Search  Ctrl K'}
              className="press w-9 h-8 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]">
              <Search size={15} />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenSearch}
            data-launch
            className="press group w-full h-8 flex items-center gap-2 pl-2.5 pr-1.5 rounded-[calc(9px*var(--rs))] text-muted-foreground
                       bg-foreground/[0.045] shadow-[inset_0_0_0_1px_hsl(var(--line))] hover:bg-foreground/[0.07] hover:text-foreground"
          >
            <Search size={14} className="shrink-0" />
            <span className="flex-1 text-left text-sm">Search</span>
            <kbd className="text-2xs font-sans text-faint px-1.5 h-5 grid place-items-center rounded-[calc(5px*var(--rs))] bg-foreground/[0.06]">
              {IS_MAC ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>
        )}
      </div>

      <div ref={listRef} className={`relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-3 pt-3 ${collapsed ? 'px-3.5' : 'px-3'}`}>
        <span
          ref={pillRef}
          aria-hidden
          className="absolute left-0 top-0 rounded-[calc(8px*var(--rs))] invisible pointer-events-none
                     bg-foreground/[0.085] shadow-[inset_0_1px_0_0_hsl(var(--highlight)),0_0_0_1px_hsl(var(--line))]"
        />
        <div data-launch>
          <NavRow to="/" end icon={<LayoutGrid size={15} />} label="Overview" collapsed={collapsed} />
        </div>

        <div className={`flex items-center mt-5 mb-1 ${collapsed ? 'justify-center' : 'pl-2.5 pr-1'}`} data-launch>
          {!collapsed && <span className="flex-1 text-2xs font-medium text-faint">Folders</span>}
          <button
            onClick={startAddFolder}
            aria-label="Add folder"
            data-tip="Add folder"
            className="press w-6 h-6 rounded-[calc(6px*var(--rs))] grid place-items-center text-faint hover:text-foreground hover:bg-foreground/[0.07]"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="space-y-px">
          {isLoading && !collapsed && [0, 1, 2].map((i) => (
            <div key={i} className="h-8 flex items-center gap-2.5 px-2.5">
              <div className="skeleton w-4 h-4" />
              <div className="skeleton h-2.5" style={{ width: `${50 + i * 14}%` }} />
            </div>
          ))}
          {folders?.map((f) => {
            return (
              <div key={f.id} data-launch data-folder-id={f.id}>
                <NavRow
                  to={`/folder/${f.id}`}
                  icon={<FolderIcon name={f.config.icon} size={15} {...folderTint(f.config.color)} />}
                  label={f.displayName}
                  collapsed={collapsed}
                  trailing={f.paused ? (
                    <Pause size={11} className="text-faint shrink-0" aria-label="Paused" />
                  ) : (
                    <span className="live-dot w-1.5 h-1.5 rounded-full bg-positive text-positive shrink-0" aria-label="Watching" />
                  )}
                />
              </div>
            );
          })}
          {folders && folders.length === 0 && !collapsed && (
            <button
              onClick={startAddFolder}
              className="press w-full h-8 flex items-center gap-2.5 px-2.5 rounded-[calc(8px*var(--rs))] text-sm text-faint hover:text-foreground hover:bg-foreground/[0.045]"
            >
              <Plus size={15} />
              Add your first folder
            </button>
          )}
        </div>
      </div>

      <div ref={bottomRef} className={`relative shrink-0 pb-3 pt-2 space-y-px ${collapsed ? 'px-3.5' : 'px-3'}`} data-launch>
        <span
          ref={bottomPillRef}
          aria-hidden
          className="absolute left-0 top-0 rounded-[calc(8px*var(--rs))] invisible pointer-events-none
                     bg-foreground/[0.085] shadow-[inset_0_1px_0_0_hsl(var(--highlight)),0_0_0_1px_hsl(var(--line))]"
        />
        <StorageMeter collapsed={collapsed} />
        <NavRow to="/settings" icon={<Settings size={15} />} label="Settings" collapsed={collapsed} />
        <NavRow to="/about" icon={<Info size={15} />} label="About" collapsed={collapsed} />
      </div>
    </aside>
  );
}
