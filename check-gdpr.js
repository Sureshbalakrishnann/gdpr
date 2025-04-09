const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
require("dotenv").config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "gpt-4-turbo";
const temperature = 0;

// ✅ Load only staged frontend code (HTML/JS)
function loadStagedCode() {
  const output = execSync("git diff --cached --name-only", { encoding: "utf-8" });
  const files = output.split("\n").filter(f => /\.(js|html)$/.test(f.trim()));

  let code = "";

  files.forEach(file => {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, "utf-8");
      code += `\n\n// --- File: ${file} ---\n${content}`;
    }
  });

  if (!code) throw new Error("No valid staged JS or HTML files found.");
  return code;
}

// ✅ Call OpenAI API with the validation prompt
async function callOpenAI(prompt) {
  console.log("🔗 Sending prompt to OpenAI...");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API Error ${response.status}: ${errorBody}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || "No response content.";
}

// ✅ Fetch policy text from URL
async function fetchPolicy(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch policy from ${url}`);
  return await res.text();
}

// ✅ Extract compliance result (pass/fail)
function extractDecision(resultText, regionLabel) {
  const decisionLine = resultText
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.toLowerCase().includes("policy"))
    .pop();

  console.log(`📌 Decision Line: "${decisionLine}"`);

  if (regionLabel.includes("Europe")) {
    return decisionLine?.toLowerCase().includes("europe policy passed");
  }

  if (regionLabel.includes("US")) {
    return decisionLine?.toLowerCase().includes("us policy passed");
  }

  return false;
}

// ✅ Validation function
async function validateWithOpenAI(regionLabel, policyURL) {
  try {
    const policyText = await fetchPolicy(policyURL);
    const repoCode = loadStagedCode();

    const prompt = `
You are a GDPR/Privacy Compliance Expert.

Evaluate the following frontend source code against the ${regionLabel} privacy policy.
Identify any non-compliance issues found in the code. Be concise and specific. Mention what is missing or incorrectly implemented if any.

At the end of your evaluation, clearly state one of the following exactly (on a new line):
- "Europe and US policies PASSED"
- "Europe policy PASSED"
- "US policy PASSED"
- "Europe policy FAILED"
- "US policy FAILED"
- "Both policies FAILED"

=== BEGIN ${regionLabel} POLICY ===
${policyText}
=== END POLICY ===

=== BEGIN FRONTEND SOURCE CODE ===
${repoCode}
=== END CODE ===
`;

    console.log("📝 Prompt Preview:\n", prompt);
    const result = await callOpenAI(prompt);
    console.log(`\n=== ${regionLabel} Compliance Report ===\n${result}\n`);

    return extractDecision(result, regionLabel);
  } catch (err) {
    console.error(`❌ Error during ${regionLabel} validation:`, err.message);
    return false;
  }
}

// ✅ Entry Point
async function runValidation() {
  console.log("🚀 Starting GDPR/US Privacy Validation for staged files...\n");

  const [europePassed, usPassed] = await Promise.all([
    validateWithOpenAI("Europe (GDPR)", "https://raw.githubusercontent.com/Sureshbalakrishnann/gdpr/master/policies/gdpr-europe.txt"),
    validateWithOpenAI("US Privacy", "https://raw.githubusercontent.com/Sureshbalakrishnann/gdpr/master/policies/gdpr-us.txt"),
  ]);

  console.log("=== ✅ Final Result ===");
  console.log(`🇪🇺 Europe (GDPR): ${europePassed ? "PASSED ✅" : "FAILED ❌"}`);
  console.log(`🇺🇸 US Privacy:    ${usPassed ? "PASSED ✅" : "FAILED ❌"}`);

  if (!europePassed || !usPassed) {
    console.error("❌ Commit/Push blocked due to policy violations.");
    process.exit(1);
  }

  console.log("✅ All privacy checks passed. Proceeding.");
  process.exit(0);
}

runValidation();
