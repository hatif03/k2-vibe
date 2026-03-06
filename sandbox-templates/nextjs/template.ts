import path from "path";
import { Template, waitForURL } from "e2b";

const templateDir = path.resolve(__dirname, ".");

/**
 * E2B template definition - builds from e2b.Dockerfile.
 * Run: npm run e2b:build (from project root)
 */
export const template = Template({
  fileContextPath: templateDir,
})
  .fromDockerfile(path.join(templateDir, "e2b.Dockerfile"))
  .setStartCmd("/compile_page.sh", waitForURL("http://localhost:3000", 200));
