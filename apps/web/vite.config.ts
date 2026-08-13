import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const config = defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  resolve: {
    tsconfigPaths: true,
    // Keep a single React instance across app + @workspace/ui.
    // Do not alias package roots — that forces CJS entrypoints and breaks Vite's ESM runner.
    dedupe: ["react", "react-dom"],
  },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  server: {
    port: 4100,
  },
  ssr: {
    // Source workspace package — must be bundled, not treated as a bare node_module.
    noExternal: ["@workspace/ui"],
  },
})

export default config
