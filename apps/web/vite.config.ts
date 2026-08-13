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
  resolve: { tsconfigPaths: true },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  server: {
    port: 4100,
  },
})

export default config
