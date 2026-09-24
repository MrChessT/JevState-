import { defineConfig, devices } from "@playwright/test";

// e2e y accesibilidad contra el build de producción (`npm run build` antes).
// PW_CHROMIUM_PATH permite usar un Chromium ya instalado (p. ej. /opt/pw-browsers/chromium).
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "movil", use: { ...devices["Pixel 7"] } },
    { name: "escritorio", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    env: {
      // Supabase inalcanzable a propósito: el portal debe funcionar igual (degradación).
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:59999",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
