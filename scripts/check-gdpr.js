const fs = require("fs");
const path = require("path");
const simpleGit = require("simple-git");
//const fetch = require("node-fetch"); // Make sure to install node-fetch if not already present

const OPENROUTER_API_KEY = "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";

const MODEL = "openchat/openchat-7b:free";

// Repo details
const GITHUB_REPO_URL = "https://github.com/Sureshbalakrishnann/gdpr.git";
const LOCAL_REPO_PATH = "gdpr-clone";
const BRANCH_NAME = "master";

// Clone or update the repo
async function cloneOrUpdateRepo() {
  const git = simpleGit(); 

  if (fs.existsSync(LOCAL_REPO_PATH)) {
    console.log("📥 Pulling latest changes...");
    const repo = simpleGit(LOCAL_REPO_PATH);
    await repo.fetch();
    await repo.checkout(BRANCH_NAME);
    await repo.pull("origin", BRANCH_NAME);
  } else {
    console.log("📦 Cloning repo...");
    await git.clone(GITHUB_REPO_URL, LOCAL_REPO_PATH, ["--branch=" + BRANCH_NAME]);
  }
}

// Read source files
function loadRepoCode() {
  const targetFolder = path.join(LOCAL_REPO_PATH, "gdpr-frontend");

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

  return readAllFiles(targetFolder);
}

// OpenRouter API call with enhanced error handling
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
      console.error("API Error Details:", errorBody);
      throw new Error(`API Error ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return result.choices?.[0]?.message?.content || "No response content.";
  } catch (error) {
    console.error("Error in callOpenRouter:", error);
    throw error;
  }
}

// Validate policy with improved error handling
async function validatePolicyFromURL(policyURL, regionLabel) {
  try {
    console.log(`Fetching ${regionLabel} policy from ${policyURL}`);
    const policyResponse = await fetch(policyURL);
    
    if (!policyResponse.ok) {
      throw new Error(`Failed to fetch ${regionLabel} policy: ${policyResponse.statusText}`);
    }

    const policyText = await policyResponse.text();
    const code = loadRepoCode();

    const prompt = `
Based on the following ${regionLabel} policy and the frontend code, determine if there are any ${regionLabel} compliance violations.
If there are, list them and describe why they are non-compliant.
If everything is compliant, reply with exactly: "Compliant" (without quotes and no other text).

--- ${regionLabel.toUpperCase()} POLICY ---
${policyText}

--- CODE ---
${code}
`;

    console.log(`Analyzing ${regionLabel} compliance...`);
    const output = await callOpenRouter(prompt);
    console.log(`\n=== ${regionLabel} Compliance Report ===\n`, output);

    const cleaned = output.trim().toLowerCase();
    const passed = cleaned === "compliant";

    if (passed) {
      console.log(`✅ ${regionLabel} policy compliance passed.`);
      return true;
    } else {
      console.error(`❌ ${regionLabel} compliance violations found.`);
      return false;
    }
  } catch (error) {
    console.error(`Error validating ${regionLabel} policy:`, error);
    return false;
  }
}

// Main function with comprehensive error handling
async function validateBothPolicies() {
  try {
    console.log("Starting GDPR compliance validation...");
    await cloneOrUpdateRepo();

    const results = await Promise.allSettled([
      validatePolicyFromURL(
        "https://raw.githubusercontent.com/Sureshbalakrishnann/gdpr/master/policies/gdpr-europe.txt",
        "Europe (GDPR)"
      ),
      validatePolicyFromURL(
        "https://raw.githubusercontent.com/Sureshbalakrishnann/gdpr/master/policies/gdpr-us.txt",
        "US Privacy"
      ),
    ]);

    const allPassed = results.every(result => 
      result.status === "fulfilled" && result.value === true
    );

    if (!allPassed) {
      console.error("\n🚫 One or more policies failed. See errors above.");
      process.exit(1);
    }

    console.log("\n🎉 All policies passed. You're good to go!");
    process.exit(0);
  } catch (error) {
    console.error("Fatal error in validateBothPolicies:", error);
    process.exit(1);
  }
}

// Execute
validateBothPolicies();