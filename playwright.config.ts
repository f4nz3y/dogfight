import {defineConfig} from "@playwright/test";
export default defineConfig({testDir:"./e2e",use:{baseURL:"http://127.0.0.1:3001",browserName:"chromium"},webServer:{command:"npm run start",url:"http://127.0.0.1:3001/health",reuseExistingServer:!process.env.CI,timeout:30000}});
