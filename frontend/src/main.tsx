import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { registerServiceWorker } from "./lib/registerServiceWorker";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// 홈 화면에 설치할 수 있게 합니다. 빌드본에서만 동작합니다.
registerServiceWorker();
