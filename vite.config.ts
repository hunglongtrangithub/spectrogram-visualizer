import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import glsl from "vite-plugin-glsl";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    build: {
      target: "esnext",
    },
    plugins: [react(), glsl()],
    server: {
      open: mode === "test" ? "/test/index.html" : "/index.html",
    },
  };
});
