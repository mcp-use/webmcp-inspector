import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  imports: false,
  manifestVersion: 3,
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: "mcp-use Inspector",
    minimum_chrome_version: "116",
    permissions: ["sidePanel", "activeTab", "scripting", "storage"],
    icons: { 96: "icon.png" },
    action: {
      default_title: "Open mcp-use Inspector",
      default_icon: "icon.png",
    },
  },
  // Load unpacked into your normal Chrome profile to retain the page's login.
  webExt: { disabled: true },
});
