const fs = require("fs");
const path = require("path");

const OPENROUTER_API_KEY = "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";
const MODEL = "openchat/openchat-7b:free";

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
      } else if (entry.isFile() && /\.(js|ts|jsx|tsx|html|css)$/.test(entry.name)) {
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

// Call OpenRouter with prompt
async function callOpenRouter(prompt) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Sureshbalakrishnann/gdpr",
        "X-Title": "GDPR Compliance Checker"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenRouter API Error ${response.status}: ${errorBody}`);
    }

    const result = await response.json();
    return result.choices?.[0]?.message?.content || "No response content.";
  } catch (err) {
    console.error("❌ Error in OpenRouter call:", err.message);
    return "Error in OpenRouter call.";
  }
}

// Fetch privacy policy text
async function fetchPolicy(policyURL) {
  const res = await fetch(policyURL);
  if (!res.ok) throw new Error(`Failed to fetch policy from ${policyURL}`);
  return await res.text();
}

// Validate code with OpenRouter against a policy
async function validateWithOpenRouter(regionLabel, policyURL) {
  try {
    const policyText = await fetchPolicy(policyURL);
    const repoCode = loadRepoCode();

    const prompt = `
You are a GDPR/Privacy Compliance Expert.

Please evaluate the following frontend source code against the following ${regionLabel} privacy policy. 
Point out any issues where the code is non-compliant, and clearly mention if it passes or fails.

=== BEGIN ${regionLabel} POLICY ===
${policyText}
=== END POLICY ===

=== BEGIN FRONTEND SOURCE CODE ===
${repoCode}
=== END CODE ===
`;

    console.log(`🚀 Sending ${regionLabel} policy and code to OpenRouter...`);
    const result = await callOpenRouter(prompt);
    console.log(`\n=== ${regionLabel} Compliance Report ===\n${result}\n`);
    return result.toLowerCase().includes("pass");
  } catch (err) {
    console.error(`❌ Error during ${regionLabel} validation:`, err.message);
    return false;
  }
}

// Run both validations
async function runValidation() {
  console.log("🔍 Starting Privacy Validation...\n");

  const [europePassed, usPassed] = await Promise.all([
    validateWithOpenRouter("Europe (GDPR)", "https://raw.githubusercontent.com/Sureshbalakrishnann/gdpr/master/policies/gdpr-europe.txt"),
    validateWithOpenRouter("US Privacy", "https://raw.githubusercontent.com/Sureshbalakrishnann/gdpr/master/policies/gdpr-us.txt")
  ]);

  console.log("=== Final Verdict ===");
  console.log(`🇪🇺 Europe (GDPR): ${europePassed ? "✅ PASSED" : "❌ FAILED"}`);
  console.log(`🇺🇸 US Privacy:    ${usPassed ? "✅ PASSED" : "❌ FAILED"}`);

  process.exit(europePassed && usPassed ? 0 : 1);
}

runValidation();
