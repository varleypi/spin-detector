// Fails if the scoring prompt copied into eval/prompts/ has drifted from the one
// production actually uses in ../pipeline/cluster.js (buildGrokPrompt + the Grok
// system message). If you change the pipeline prompt, update eval/prompts/ to
// match, otherwise the eval is testing a prompt you no longer ship.
import { readFileSync } from "node:fs";
import { loadPrompts } from "./lib/scoring.js";

const src = readFileSync(process.env.CLUSTER_JS_PATH || "../pipeline/cluster.js", "utf8");

const start = src.indexOf("function buildGrokPrompt");
const a = src.indexOf("return `", start) + "return `".length;
const b = src.indexOf("`\n}", a);
const pipelineTemplate = src
  .slice(a, b)
  .replaceAll("${scoredArticles.length}", "{{COUNT}}")
  .replace("${list}", "{{HEADLINES}}");

const sysMatch = src.slice(src.indexOf("async function scoreWithGrok")).match(/role: 'system',\s*content:\s*'([^']*)'/);
const pipelineSystem = sysMatch?.[1];

const { template, system } = loadPrompts();
const problems = [];
if (start < 0 || b < 0) problems.push("could not find buildGrokPrompt in pipeline/cluster.js (was it renamed?)");
if (!pipelineSystem) problems.push("could not find the Grok system prompt in pipeline/cluster.js");
if (pipelineTemplate !== template) problems.push("eval/prompts/scoring-prompt.txt differs from buildGrokPrompt() in pipeline/cluster.js");
if (pipelineSystem && pipelineSystem !== system) problems.push("eval/prompts/system-prompt.txt differs from the system prompt in pipeline/cluster.js");

if (problems.length) {
  console.error("Prompt drift detected:\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log("OK: eval prompts match pipeline/cluster.js");
