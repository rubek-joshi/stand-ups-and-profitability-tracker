import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, loadEnv, type ProxyOptions } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "../..")

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "")
  const apiTarget =
    env.VITE_API_PROXY_TARGET || `http://localhost:${env.API_PORT || "4101"}`

  const apiProxy: ProxyOptions = {
    target: apiTarget,
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/api/, ""),
  }

  return {
    envDir: repoRoot,
    resolve: {
      tsconfigPaths: true,
      // Keep a single React instance across app + @workspace/ui.
      // Do not alias package roots — that forces CJS entrypoints and breaks Vite's ESM runner.
      dedupe: ["react", "react-dom"],
    },
    plugins: [
      devtools(),
      tailwindcss(),
      tanstackStart({
        spa: {
          enabled: true,
        },
      }),
      viteReact(),
    ],
    server: {
      port: Number(env.WEB_PORT || 4100),
      proxy: {
        "/api": apiProxy,
        "/socket.io": {
          target: apiTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: Number(env.WEB_PORT || 4100),
      proxy: {
        "/api": apiProxy,
        "/socket.io": {
          target: apiTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
    ssr: {
      // Source workspace package — must be bundled, not treated as a bare node_module.
      noExternal: ["@workspace/ui"],
    },
  }
})
