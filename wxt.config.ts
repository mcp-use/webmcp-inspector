import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

// Manufact Cloud backs the chat tab. Override for local or staging clouds.
const cloud = new URL(
  process.env.WXT_MANUFACT_CLOUD_URL || "https://cloud.manufact.com",
);

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  imports: false,
  manifestVersion: 3,
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: "WebMCP Inspector",
    minimum_chrome_version: "116",
    permissions: ["sidePanel", "activeTab", "scripting", "storage", "identity"],
    // Extension pages skip CORS for granted hosts; the cloud does not allow
    // chrome-extension:// origins.
    host_permissions: [`${cloud.origin}/*`],
    icons: { 96: "icon.png" },
    action: {
      default_title: "Open WebMCP Inspector",
      default_icon: "icon.png",
    },
  },
  // Load unpacked into your normal Chrome profile to retain the page's login.
  webExt: { disabled: true },
});
