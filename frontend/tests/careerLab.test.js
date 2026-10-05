import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CAREER_LAB_TOOLS } from "../src/pages/dashboard/career-lab/careerLabTools.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const layoutPath = path.join(
  __dirname,
  "..",
  "src",
  "pages",
  "dashboard",
  "career-lab",
  "CareerLabLayout.jsx",
);
const toolsPath = path.join(
  __dirname,
  "..",
  "src",
  "pages",
  "dashboard",
  "career-lab",
  "careerLabTools.js",
);
const routerPath = path.join(__dirname, "..", "src", "router.jsx");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

test("career lab nested routes are mounted in router", () => {
  const routerSource = read(routerPath);
  assert.match(routerSource, /path:\s*"career-lab"/);
  assert.match(routerSource, /CareerLabLayout/);
  assert.match(routerSource, /path:\s*"tools\/:toolId"/);
});

test("career lab tools config includes high-use endpoints", () => {
  const toolsSource = read(toolsPath);
  assert.match(toolsSource, /"\/api\/career-tools\/ats-analysis"/);
  assert.match(toolsSource, /"\/api\/career-tools\/role-fit"/);
  assert.match(toolsSource, /"\/api\/career-tools\/interview-prep"/);
});

test("Pro-only career tools are explicitly marked in the tool catalog", () => {
  const proTools = CAREER_LAB_TOOLS.filter((tool) => tool.minimumPlan === "pro")
    .map((tool) => tool.id)
    .sort();

  assert.deepEqual(proTools, [
    "competitive-analysis",
    "market-demand",
    "recruiter-scan",
    "salary-estimate",
  ]);
});

test("career lab layout includes top dropdown navigation sections", () => {
  const layoutSource = read(layoutPath);
  const toolsSource = read(toolsPath);
  assert.match(layoutSource, /career-lab-top-nav/);
  assert.match(layoutSource, /career-lab-dropdown-menu/);
  assert.match(layoutSource, /Feature Pages/);
  assert.match(toolsSource, /Core Analysis/);
  assert.match(toolsSource, /Market & Strategy/);
  assert.match(toolsSource, /Interview & Execution/);
});
