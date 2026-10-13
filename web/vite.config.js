import { defineConfig } from "vite";
export default defineConfig({
  server: {
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true }, "/team-api": { target:process.env.CAREFLOW_TEAM_ORIGIN||"http://127.0.0.1:8788",changeOrigin:true } },
  },
  build: { target: "es2022" },
});
