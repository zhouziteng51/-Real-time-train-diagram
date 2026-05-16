import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./components/AppShell.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { RunningGraphPage } from "./pages/RunningGraphPage.js";
import { AttachedRouteEntry } from "./pages/AttachedRouteEntry.js";
import { AttachedRoutePage } from "./pages/AttachedRoutePage.js";
import { MasterSchedulePage } from "./pages/MasterSchedulePage.js";
import { HistoryTripsPage } from "./pages/HistoryTripsPage.js";
import { ImportCenterPage } from "./pages/ImportCenterPage.js";

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "running-graph", element: <RunningGraphPage /> },
      { path: "attached-route", element: <AttachedRouteEntry /> },
      { path: "attached-route/:tripId", element: <AttachedRoutePage /> },
      { path: "master-schedule", element: <MasterSchedulePage /> },
      { path: "history-trips", element: <HistoryTripsPage /> },
      { path: "imports", element: <ImportCenterPage /> },
      { path: "imports/:jobId", element: <ImportCenterPage /> },
    ],
  },
]);
