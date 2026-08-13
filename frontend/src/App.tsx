import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import BrewDetailPage from "./pages/BrewDetailPage";
import BrewPage from "./pages/BrewPage";
import FeedbackPage from "./pages/FeedbackPage";
import HistoryPage from "./pages/HistoryPage";
import RecipePage from "./pages/RecipePage";

/**
 * 화면은 데모 시나리오에 등장하는 것만 만듭니다 (docs/roadmap.md).
 * 디자인·애니메이션·반응형은 범위 밖입니다.
 */
const NAV = [
  { to: "/recipe", label: "레시피" },
  { to: "/brew", label: "추출" },
  { to: "/feedback", label: "맛 평가" },
  { to: "/history", label: "기록" },
];

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <nav className="mx-auto flex max-w-3xl gap-1 px-4 py-3">
          <span className="mr-4 font-semibold">DripDraw</span>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded px-3 py-1 text-sm ${
                  isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/recipe" replace />} />
          <Route path="/recipe" element={<RecipePage />} />
          <Route path="/brew" element={<BrewPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/history" element={<HistoryPage />} />
          {/* 상세는 주소에 id를 둡니다. 새로고침해도 살아남고 링크를 그대로 열 수 있습니다. */}
          <Route path="/history/:brewId" element={<BrewDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}
