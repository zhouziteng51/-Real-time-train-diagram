import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useRealtimeStore } from "../store/index.js";
import { connectionStatusLabel } from "../format/display.js";

const NAV = [
  { to: "/", label: "首页", icon: "train", end: true },
  { to: "/running-graph", label: "运行图", icon: "route", end: false },
  { to: "/attached-route", label: "交路", icon: "map", end: false },
  { to: "/master-schedule", label: "时刻表", icon: "calendar_month", end: false },
  { to: "/daily-roster", label: "排班", icon: "assignment_ind", end: false },
  { to: "/history-trips", label: "历史", icon: "history", end: false },
  { to: "/imports", label: "导入", icon: "upload_file", end: false },
];

const MOBILE_PRIMARY_ROUTES = new Set([
  "/",
  "/running-graph",
  "/attached-route",
]);
const MOBILE_PRIMARY_NAV = NAV.filter((n) => MOBILE_PRIMARY_ROUTES.has(n.to));
const MOBILE_MORE_NAV = NAV.filter((n) => !MOBILE_PRIMARY_ROUTES.has(n.to));

function routeMatches(pathname: string, to: string, end: boolean): boolean {
  return end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
}

export function AppShell() {
  const status = useRealtimeStore((s) => s.connectionStatus);
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const isMoreActive = MOBILE_MORE_NAV.some((n) =>
    routeMatches(location.pathname, n.to, n.end),
  );

  return (
    <div className="min-h-screen flex flex-col md:pl-[80px]">
      <header className="bg-surface text-primary h-touch-target sticky top-0 z-50 shadow-sm flex items-center justify-between px-margin-mobile border-b border-outline-variant">
        <span className="material-symbols-outlined cursor-pointer">search</span>
        <div className="font-bold tracking-tight text-[20px]">地铁运行控制台</div>
        <div className="flex items-center gap-sm text-[12px]">
          <span
            className={`w-2 h-2 rounded-full ${
              status === "ONLINE"
                ? "bg-emerald-500 animate-pulse"
                : status === "CONNECTING"
                  ? "bg-amber-500 animate-pulse"
                  : "bg-gray-400"
            }`}
          />
          <span className="text-on-surface-variant">{connectionStatusLabel(status)}</span>
        </div>
      </header>

      <aside className="hidden md:flex fixed top-[48px] bottom-0 left-0 w-[80px] bg-surface border-r border-outline-variant flex-col items-center py-md gap-sm z-40">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center p-xs rounded-lg w-[72px] ${
                isActive
                  ? "bg-primary-container text-on-primary-container"
                  : "text-on-surface-variant hover:bg-surface-container-low"
              }`
            }
          >
            <span className="material-symbols-outlined text-[24px] mb-1">{n.icon}</span>
            <span className="text-[10px] font-semibold">{n.label}</span>
          </NavLink>
        ))}
      </aside>

      <main className="flex-1 pb-20 md:pb-0">
        <Outlet />
      </main>

      {isMoreOpen ? (
        <button
          type="button"
          aria-label="关闭更多导航"
          className="md:hidden fixed inset-0 bg-black/20 z-40"
          onClick={() => setIsMoreOpen(false)}
        />
      ) : null}

      {isMoreOpen ? (
        <div className="md:hidden fixed left-sm right-sm bottom-20 z-50 rounded-lg border border-outline-variant bg-surface shadow-lg p-sm">
          <div className="grid grid-cols-2 gap-sm">
            {MOBILE_MORE_NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                onClick={() => setIsMoreOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-sm h-touch-target rounded-lg px-sm ${
                    isActive
                      ? "bg-primary-container text-on-primary-container"
                      : "text-on-surface-variant hover:bg-surface-container-low"
                  }`
                }
              >
                <span className="material-symbols-outlined text-[22px]">{n.icon}</span>
                <span className="text-[13px] font-semibold">{n.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      ) : null}

      <nav className="md:hidden fixed bottom-0 left-0 w-full h-16 bg-surface border-t border-outline-variant shadow-md z-50 grid grid-cols-4 items-center px-sm">
        {MOBILE_PRIMARY_NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={() => setIsMoreOpen(false)}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center min-w-[56px] py-1 rounded-lg ${
                isActive
                  ? "bg-primary-container text-on-primary-container"
                  : "text-on-surface-variant"
              }`
            }
          >
            <span className="material-symbols-outlined">{n.icon}</span>
            <span className="text-[10px] font-semibold">{n.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          aria-label="更多导航"
          aria-expanded={isMoreOpen}
          onClick={() => setIsMoreOpen((open) => !open)}
          className={`flex flex-col items-center justify-center min-w-[56px] py-1 rounded-lg ${
            isMoreOpen || isMoreActive
              ? "bg-primary-container text-on-primary-container"
              : "text-on-surface-variant"
          }`}
        >
          <span className="material-symbols-outlined">apps</span>
          <span className="text-[10px] font-semibold">更多</span>
        </button>
      </nav>
    </div>
  );
}
