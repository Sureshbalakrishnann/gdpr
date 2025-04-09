const fs = require("fs");
const path = require("path");
require("dotenv").config(); 

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "gpt-4-turbo";

// Load and concatenate all frontend code
function loadRepoCode() {
  const targetFolder = "gdpr-frontend";

  function readAllFiles(dir) {
    let code = "";
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        code += readAllFiles(fullPath);
      } else if (entry.isFile() && /\.(js|html)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        code += `\n\n// --- File: ${fullPath} ---\n${content}`;
      }
    }
    return code;
  }

  if (!fs.existsSync(targetFolder)) {
    throw new Error(`Target folder ${targetFolder} not found`);
  }

  return readAllFiles(targetFolder);
}

// Call OpenAI with the generated prompt
async function callOpenAI(prompt) {
  console.log("Sending prompt to OpenAI...");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API Error ${response.status}: ${errorBody}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || "No response content.";
}

// Fetch remote policy text
async function fetchPolicy(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch policy from ${url}`);
  return await res.text();
}

// Extract last decision line and match status
function extractDecision(resultText, regionLabel) {
  const decisionLine = resultText
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.toLowerCase().includes("policy"))
    .pop();

  console.log(`Detected Decision Line: "${decisionLine}"`);

  if (regionLabel.includes("Europe")) {
    return decisionLine?.toLowerCase().includes("europe policy passed");
  }

  if (regionLabel.includes("US")) {
    return decisionLine?.toLowerCase().includes("us policy passed");
  }

  return false;
}

// Validate source code against a privacy policy
async function validateWithOpenAI(regionLabel, policyURL) {
  try {
    const policyText = await fetchPolicy(policyURL);
    const repoCode = loadRepoCode();

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

    console.log("Prompt Starts\n", prompt, "\nPrompt Ends");

    const result = await callOpenAI(prompt);
    console.log(`\n=== ${regionLabel} Compliance Report ===\n${result}\n`);

    return extractDecision(result, regionLabel);
  } catch (err) {
    console.error(` Error during ${regionLabel} validation:`, err.message);
    return false;
  }
}

// Main execution
async function runValidation() {
  console.log("Starting Privacy Validation...\n");

  const [europePassed, usPassed] = await Promise.all([
    validateWithOpenAI("Europe (GDPR)", "https://raw.githubusercontent.com/Sureshbalakrishnann/gdpr/master/policies/gdpr-europe.txt"),
    validateWithOpenAI("US Privacy", "https://raw.githubusercontent.com/Sureshbalakrishnann/gdpr/master/policies/gdpr-us.txt"),
  ]);

  console.log("=== Final Conclusion ===");
  console.log(`🇪🇺 Europe (GDPR): ${europePassed ? " PASSED" : " FAILED"}`);
  console.log(`🇺🇸 US Privacy:    ${usPassed ? " PASSED" : " FAILED"}`);

  process.exit(europePassed && usPassed ? 0 : 1);
}

runValidation(); 
