import { Suspense, lazy, useEffect, useRef, useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  NavLink,
  Outlet,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { supabase, ALLOWED_EMAIL } from "./lib/supabase";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Program from "./pages/Program";

// Lazy-load everything except the start page — Trends and WorkoutDetail pull
// in the chart/body-diagram libraries, which are most of the bundle. This way
// the app shell and Program render without waiting for them.
const Workouts = lazy(() => import("./pages/Workouts"));
const WorkoutDetail = lazy(() => import("./pages/WorkoutDetail"));
const ExerciseDetail = lazy(() => import("./pages/ExerciseDetail"));
const Trends = lazy(() => import("./pages/Trends"));
const Library = lazy(() => import("./pages/Library"));
import {
  ListIcon,
  CalendarIcon,
  BarChartIcon,
  LogOutIcon,
  LibraryIcon,
} from "./components/icons";

export default function App() {
  const { session, loading, email, recoveryMode, exitRecovery } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Loading…
      </div>
    );
  }

  // Password recovery: user came from a reset email — let them set a new password
  // before we route them anywhere else.
  if (recoveryMode) {
    return <ResetPassword onDone={exitRecovery} />;
  }

  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  if (ALLOWED_EMAIL && email !== ALLOWED_EMAIL) {
    return <Unauthorized email={email} />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/program" replace />} />
        <Route path="/program" element={<Program />} />
        <Route path="/workouts" element={<Workouts />} />
        <Route path="/workouts/:id" element={<WorkoutDetail />} />
        <Route path="/exercise/:name" element={<ExerciseDetail />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="/library" element={<Library />} />
        <Route path="*" element={<Navigate to="/program" replace />} />
      </Route>
    </Routes>
  );
}

function pageTitle(pathname: string): string {
  if (pathname.startsWith("/workouts")) return "Workouts";
  if (pathname.startsWith("/trends")) return "Progress";
  if (pathname.startsWith("/library")) return "Exercise Library";
  if (pathname.startsWith("/exercise")) return "Exercise";
  return "Program";
}

function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const hiddenAt = useRef<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // The scroll container is shared across pages — without this, opening a
  // detail page from a scrolled list starts it mid-page.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  // A home-screen app has no reload button, so data goes stale when the app
  // sits in the background (e.g. a workout logged via the Shortcut won't
  // appear). Remount the current page when returning after 5+ minutes away.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current && Date.now() - hiddenAt.current > 5 * 60_000) {
        hiddenAt.current = null;
        setRefreshKey((k) => k + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto">
      <header className="flex items-center justify-between px-4 bg-neutral-950 border-b border-neutral-800 shrink-0 h-[calc(env(safe-area-inset-top)+3.5rem)] pt-[env(safe-area-inset-top)]">
        <h1 className="text-base font-semibold tracking-tight">
          {pageTitle(location.pathname)}
        </h1>
        <button
          onClick={signOut}
          className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 active:bg-neutral-700"
          aria-label="Sign out"
        >
          <LogOutIcon className="w-5 h-5" />
        </button>
      </header>
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-4"
      >
        <Suspense key={refreshKey} fallback={null}>
          <Outlet />
        </Suspense>
      </main>
      <nav
        aria-label="Primary"
        className="shrink-0 bg-neutral-950 border-t border-neutral-800 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex">
          <Tab to="/program" label="Program" icon={<ListIcon />} />
          <Tab to="/workouts" label="Workouts" icon={<CalendarIcon />} />
          <Tab to="/trends" label="Progress" icon={<BarChartIcon />} />
          <Tab to="/library" label="Library" icon={<LibraryIcon />} />
        </div>
      </nav>
    </div>
  );
}

function Tab({
  to,
  label,
  icon,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      className="flex-1 flex flex-col items-center justify-center gap-1 pt-2.5 pb-2 transition-colors"
    >
      {({ isActive }) => (
        <>
          <span
            className={
              isActive
                ? "text-white"
                : "text-neutral-500 group-hover:text-neutral-300"
            }
          >
            {icon}
          </span>
          <span
            className={`text-[11px] font-medium ${
              isActive ? "text-white" : "text-neutral-500"
            }`}
          >
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

function Unauthorized({ email }: { email: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 text-center">
      <p className="text-lg mb-2">Not authorized</p>
      <p className="text-sm text-neutral-500 mb-6">
        {email} is not allowed to access this app.
      </p>
      <button
        onClick={() => supabase.auth.signOut()}
        className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm"
      >
        Sign out
      </button>
    </div>
  );
}
