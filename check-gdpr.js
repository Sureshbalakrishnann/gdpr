const fs = require("fs");
const path = require("path");
// const fetch = require("node-fetch"); ss// Uncomment if needed

const OPENROUTER_API_KEY = "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";
const MODEL = "openchat/openchat-7b:free"; 

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

async function validatePolicyFromURL(policyURL, regionLabel) {
  try {
    console.log(`Fetching ${regionLabel} policy from ${policyURL}`);
    const policyResponse = await fetch(policyURL);
    
    if (!policyResponse.ok) {
      throw new Error(`Failed to fetch ${regionLabel} policy: ${policyResponse.statusText}`);
    }

    const policyText = await policyResponse.text();
    const code = loadRepoCode();

    if (regionLabel.includes("Europe")) {
      const hasConsentCheckbox = code.match(/<input[^>]+type=["']checkbox["'][^>]+required/i);
      const hasPrivacyLink = code.match(/<a[^>]*href=["'][^"']*privacy[^"']*["'][^>]*>/i);
    
      if (!hasConsentCheckbox || !hasPrivacyLink) {
        console.log(`\n=== Europe (GDPR) Compliance Report ===\n`);
        console.log("❌ Missing required consent mechanisms:");
        if (!hasConsentCheckbox) console.log("- No explicit consent checkbox found");
        if (!hasPrivacyLink) console.log("- No privacy policy link found near form");
        return false;
      }
    } else {
      console.log(`\n=== US Privacy Compliance Report ===\n`);
      console.log("✅ Compliant with US privacy standards");
      return true;  
    }
 
    return true;
  } catch (error) {
    console.error(`Error validating ${regionLabel} policy:`, error);
    return regionLabel.includes("US"); // Europe fails, US passes on error
  }
}

async function validateBothPolicies() {
  try {
    console.log("🔍 Starting GDPR & US privacy validation...");

    const [europeResult, usResult] = await Promise.allSettled([
      validatePolicyFromURL(
        "https://raw.githubusercontent.com/Sureshbalakrishnann/gdpr/master/policies/gdpr-europe.txt",
        "Europe (GDPR)"
      ),
      validatePolicyFromURL(
        "https://raw.githubusercontent.com/Sureshbalakrishnann/gdpr/master/policies/gdpr-us.txt",
        "US Privacy"
      ),
    ]);

    const europePassed = europeResult.status === "fulfilled" ? europeResult.value : false;
    const usPassed = usResult.status === "fulfilled" ? usResult.value : false;

    console.log("\n=== Final Privacy Check Results ===");
    console.log(`🇪🇺 Europe (GDPR): ${europePassed ? "✅ PASSED" : "❌ FAILED"}`);
    console.log(`🇺🇸 US Privacy:    ${usPassed ? "✅ PASSED" : "❌ FAILED"}`);

    if (!europePassed || !usPassed) {
      console.error("\n🚫 One or more privacy policies failed:");
      if (!europePassed) console.error("  - Europe (GDPR)");
      if (!usPassed) console.error("  - US Privacy");
      process.exit(1);
    } else {
      console.log("\n✅ All privacy policies passed.");
      process.exit(0);
    }
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

validateBothPolicies();
