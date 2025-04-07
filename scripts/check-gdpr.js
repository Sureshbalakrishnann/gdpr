const fs = require("fs");
const path = require("path");
const simpleGit = require("simple-git");

const OPENROUTER_API_KEY = "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";
const MODEL = "openai/gpt-3.5-turbo";

// ✅ Your updated repo details
const GITHUB_REPO_URL = "https://github.com/Sureshbalakrishnann/gdpr.git";
const LOCAL_REPO_PATH = "gdpr-clone"; // folder to clone into
const BRANCH_NAME = "master";

// ✅ Clone or update the repo
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

// ✅ Read source files
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

// ✅ OpenRouter call
async function callOpenRouter(prompt) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://yourproject.com", // optional
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status}: ${response.statusText}\nDetails: ${errorBody}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || "No response content.";
}

// ✅ Validate policy
async function validatePolicyFromURL(policyURL, regionLabel) {
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
  console.log(code);
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
}

// ✅ Run both checks
async function validateBothPolicies() {
  await cloneOrUpdateRepo();

  const results = await Promise.all([
    validatePolicyFromURL(
      "https://raw.githubusercontent.com/Sureshbalakrishnann/gdpr/master/policies/gdpr-europe.txt",
      "Europe (GDPR)"
    ),
    validatePolicyFromURL(
      "https://raw.githubusercontent.com/Sureshbalakrishnann/gdpr/master/policies/gdpr-us.txt",
      "US Privacy"
    ),
  ]);

  if (results.includes(false)) {
    console.error("\n🚫 One or more policies failed. Stopping pipeline.");
    process.exit(1); // ❌ Fail CI
  }

  console.log("\n🎉 All policies passed. You're good to go!");
}

validateBothPolicies();
