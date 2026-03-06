import path from "path";
import { config } from "dotenv";

// Load .env from project root
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local") });

import { Template, defaultBuildLogger } from "e2b";
import { template } from "./template";

async function main() {
  const buildInfo = await Template.build(template, "k2-vibe-nextjs", {
    cpuCount: 2,
    memoryMB: 2048,
    onBuildLogs: defaultBuildLogger(),
  });

  console.log("\n✅ Template built successfully!");
  console.log("   Name:", buildInfo.name);
  console.log("   Template ID:", buildInfo.templateId);
  console.log("\nUse in your app: Sandbox.create('k2-vibe-nextjs')");
}

main().catch(console.error);
