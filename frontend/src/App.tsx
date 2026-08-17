import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";

import BeansPage from "./pages/BeansPage";
import BrewDetailPage from "./pages/BrewDetailPage";
import BrewPage from "./pages/BrewPage";
import FeedbackPage from "./pages/FeedbackPage";
import HistoryPage from "./pages/HistoryPage";
import HomePage from "./pages/HomePage";
import OnboardingPage from "./pages/OnboardingPage";
import RecipePage from "./pages/RecipePage";
import SettingsPage from "./pages/SettingsPage";
import { loadSettings } from "./lib/settings";

/**
 * 화면 골격.
 *
 * **탭에는 목적지만 둡니다.** 레시피·추출·맛 평가는 "커피 내리기" 흐름의 중간 단계라
 * 탭에 두지 않습니다. 작업 순서를 탭으로 늘어놓으면 사용자가 지금 뭘 눌러야 하는지
 * 스스로 판단해야 하고, 앱보다 관리 도구처럼 보입니다.
 */

const TABS = [
  { to: "/", label: "홈", icon: "🏠" },
  { to: "/beans", label: "원두", icon: "🫘" },
  { to: "/history", label: "기록", icon: "📋" },
  { to: "/settings", label: "설정", icon: "⚙️" },
];

/** 흐름 중간 화면. 탭바를 숨겨 "지금 하던 일"에 집중하게 합니다. */
const FLOW_PATHS = ["/recipe", "/brew", "/feedback", "/onboarding"];

function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === "/"}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
                isActive ? "font-medium text-slate-900" : "text-slate-500"
              }`
            }
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default function App() {
  const { pathname } = useLocation();

  // 처음 방문이면 안내부터. 건너뛰어도 기본값으로 그대로 쓸 수 있습니다.
  const needsOnboarding = !loadSettings().onboarded && pathname !== "/onboarding";
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;

  const inFlow = FLOW_PATHS.some((path) => pathname.startsWith(path));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-3">
          {/* 어느 화면에서든 홈으로 — 앱에서 로고를 누르면 첫 화면으로 가는 것이 기본 동작입니다. */}
          <Link
            to="/"
            aria-label="홈으로"
            className="flex items-center gap-2 rounded hover:opacity-70"
          >
            <span className="text-lg leading-none">☕</span>
            <span className="font-semibold">DripDraw</span>
            <span className="hidden text-xs text-slate-400 sm:inline">추출 재현성 가이드</span>
          </Link>
        </div>
      </header>

      {/* 탭바가 화면 아래에 떠 있으므로 마지막 내용이 가리지 않게 여백을 둡니다. */}
      <main className={`mx-auto max-w-3xl px-4 py-6 ${inFlow ? "pb-6" : "pb-24"}`}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/beans" element={<BeansPage />} />
          <Route path="/recipe" element={<RecipePage />} />
          <Route path="/brew" element={<BrewPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          {/* 상세는 주소에 id를 둡니다. 새로고침해도 살아남고 링크를 그대로 열 수 있습니다. */}
          <Route path="/history/:brewId" element={<BrewDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {!inFlow && <TabBar />}
    </div>
  );
}
