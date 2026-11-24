import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  CAREER_LAB_TOOLS,
  hasPlanAccess,
} from "../src/pages/dashboard/career-lab/careerLabTools.js";

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
  expect(routerSource).toMatch(/path:\s*"career-lab"/);
  expect(routerSource).toMatch(/CareerLabLayout/);
  expect(routerSource).toMatch(/path:\s*"tools\/:toolId"/);
});

test("career lab tools config includes high-use endpoints", () => {
  const toolsSource = read(toolsPath);
  expect(toolsSource).toMatch(/"\/api\/career-tools\/ats-analysis"/);
  expect(toolsSource).toMatch(/"\/api\/career-tools\/role-fit"/);
  expect(toolsSource).toMatch(/"\/api\/career-tools\/interview-prep"/);
});

test("Pro-only career tools are explicitly marked in the tool catalog", () => {
  const proTools = CAREER_LAB_TOOLS.filter((tool) => tool.minimumPlan === "pro")
    .map((tool) => tool.id)
    .sort();

  expect(proTools).toEqual([
    "competitive-analysis",
    "market-demand",
    "recruiter-scan",
    "salary-estimate",
  ]);
});

test("entry Career Lab tools are free and the remaining standard tools are Premium", () => {
  const freeTools = CAREER_LAB_TOOLS.filter(
    (tool) => tool.minimumPlan === "free",
  )
    .map((tool) => tool.id)
    .sort();
  const premiumTools = CAREER_LAB_TOOLS.filter(
    (tool) => tool.minimumPlan === "premium",
  );

  expect(freeTools).toEqual(["ats-analysis", "job-parser"]);
  expect(premiumTools).toHaveLength(13);
  expect(CAREER_LAB_TOOLS.every((tool) => tool.minimumPlan)).toBe(true);
  expect(hasPlanAccess("free", "free")).toBe(true);
  expect(hasPlanAccess("free", "premium")).toBe(false);
  expect(hasPlanAccess("premium", "premium")).toBe(true);
  expect(hasPlanAccess("pro", "premium")).toBe(true);
  expect(hasPlanAccess("premium", "pro")).toBe(false);
  expect(hasPlanAccess("pro", "pro")).toBe(true);
  expect(hasPlanAccess("unknown", "premium")).toBe(false);
});

test("career lab layout includes top dropdown navigation sections", () => {
  const layoutSource = read(layoutPath);
  const toolsSource = read(toolsPath);
  expect(layoutSource).toMatch(/career-lab-top-nav/);
  expect(layoutSource).toMatch(/career-lab-dropdown-menu/);
  expect(layoutSource).toMatch(/Feature Pages/);
  expect(toolsSource).toMatch(/Core Analysis/);
  expect(toolsSource).toMatch(/Market & Strategy/);
  expect(toolsSource).toMatch(/Interview & Execution/);
});

test("Career Lab requests use the shared cookie-authenticated fetch helper", () => {
  const layoutSource = read(layoutPath);
  expect(layoutSource).toMatch(/import \{ authFetch \} from .*utils\/auth/);
  expect(layoutSource).toMatch(/await authFetch\(endpoint/);
});
