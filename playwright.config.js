// Regression suite for the HireGio landing page. Reuses the Chromium that
// gstack already downloaded, so nothing extra is fetched.
export default {
  testDir: "./tests",
  use: { baseURL: "http://127.0.0.1:8788" },
  webServer: {
    command: "python3 -m http.server 8788",
    url: "http://127.0.0.1:8788/index.html",
    reuseExistingServer: false,
  },
  reporter: [["list"]],
};
