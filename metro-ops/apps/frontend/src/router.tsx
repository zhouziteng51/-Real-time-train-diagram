import { createHashRouter } from "react-router-dom";
import { AppShell } from "./components/AppShell.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { RunningGraphPage } from "./pages/RunningGraphPage.js";
import { AttachedRouteEntry } from "./pages/AttachedRouteEntry.js";
import { AttachedRoutePage } from "./pages/AttachedRoutePage.js";
import { MasterSchedulePage } from "./pages/MasterSchedulePage.js";
import { HistoryTripsPage } from "./pages/HistoryTripsPage.js";
import { ImportCenterPage } from "./pages/ImportCenterPage.js";
import { DailyRosterImportPage } from "./pages/DailyRosterImportPage.js";
import { RouteErrorPage } from "./pages/RouteErrorPage.js";

export const router: ReturnType<typeof createHashRouter> = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "running-graph", element: <RunningGraphPage /> },
      { path: "attached-route", element: <AttachedRouteEntry /> },
      { path: "attached-route/:tripId", element: <AttachedRoutePage /> },
      { path: "master-schedule", element: <MasterSchedulePage /> },
      { path: "daily-roster", element: <DailyRosterImportPage /> },
      { path: "history-trips", element: <HistoryTripsPage /> },
      { path: "imports", element: <ImportCenterPage /> },
      { path: "imports/:jobId", element: <ImportCenterPage /> },
      { path: "*", element: <DashboardPage /> },
    ],
  },
]);
