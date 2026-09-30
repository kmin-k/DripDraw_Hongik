import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 백엔드는 8000. 프록시로 넘겨 CORS·환경변수 없이 개발합니다.
const proxy = {
  "/api": "http://localhost:8000",
  "/health": "http://localhost:8000",
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Vite 기본값 5173은 카카오톡이 점유하는 경우가 있어 피했습니다.
    // 바꾸려면 backend/app/config.py의 CORS origin도 함께 고쳐야 합니다.
    port: 5180,
    strictPort: true, // 포트가 막히면 조용히 다른 포트로 옮기지 말고 실패시킵니다.
    proxy,
  },
  // 빌드본을 띄우는 preview에는 server 설정이 적용되지 않습니다.
  // 앱 설치(PWA) 동작은 빌드본에서만 확인할 수 있으므로 같은 프록시를 여기에도 둡니다.
  preview: {
    port: 4173,
    proxy,
  },
});
