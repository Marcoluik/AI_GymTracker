import {
  Routes,
  Route,
  Navigate,
  NavLink,
  Outlet,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { supabase, ALLOWED_EMAIL } from "./lib/supabase";
import Login from "./pages/Login";
import Program from "./pages/Program";
import Workouts from "./pages/Workouts";
import WorkoutDetail from "./pages/WorkoutDetail";
import Trends from "./pages/Trends";

export default function App() {
  const { session, loading, email } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500">
        Loading…
      </div>
    );
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
        <Route path="/trends" element={<Trends />} />
        <Route path="*" element={<Navigate to="/program" replace />} />
      </Route>
    </Routes>
  );
}

function Layout() {
  const navigate = useNavigate();
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex-1 text-center py-3 text-sm font-medium border-b-2 transition-colors ${
      isActive
        ? "border-white text-white"
        : "border-transparent text-neutral-500 hover:text-neutral-300"
    }`;

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto">
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <h1 className="text-lg font-semibold">Gym Tracker</h1>
        <button
          onClick={signOut}
          className="text-xs text-neutral-500 hover:text-white"
        >
          Sign out
        </button>
      </header>
      <nav className="flex border-b border-neutral-800">
        <NavLink to="/program" className={linkClass}>
          Program
        </NavLink>
        <NavLink to="/workouts" className={linkClass}>
          Workouts
        </NavLink>
        <NavLink to="/trends" className={linkClass}>
          Trends
        </NavLink>
      </nav>
      <main className="flex-1 overflow-y-auto p-4">
        <Outlet />
      </main>
    </div>
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
