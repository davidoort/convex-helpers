import fs from "fs";
import { execSync, spawnSync } from "child_process";
import chalk from "chalk";
import { ValidatorJSON } from "convex/values";
import path from "path";
import os from "os";

type Visibility = { kind: "public" } | { kind: "internal" };

type FunctionType = "Action" | "Mutation" | "Query" | "HttpAction";

export type FunctionSpec = {
  url: string;
  functions: AnalyzedFunction[];
};

export type AnalyzedFunction = {
  identifier: string;
  functionType: FunctionType;
  visibility: Visibility;
  args: ValidatorJSON | null;
  returns: ValidatorJSON | null;
};

export function getFunctionSpec(prod?: boolean, filePath?: string) {
  if (filePath && prod) {
    console.error(`To use the prod flag, you can't provide a file path`);
    process.exit(1);
  }
  let content: string;
  if (filePath && !fs.existsSync(filePath)) {
    console.error(chalk.red(`File ${filePath} not found`));
    process.exit(1);
  }
  if (filePath) {
    content = fs.readFileSync(filePath, "utf-8");
  } else {
    const tempFile = path.join(os.tmpdir(), `function-spec-${Date.now()}.json`);

    try {
      const outputFd = fs.openSync(tempFile, "w");
      const flags = prod ? ["--prod"] : [];
      const result = spawnSync("npx", ["convex", "function-spec", ...flags], {
        stdio: ["inherit", outputFd, "pipe"],
        encoding: "utf-8",
      });

      fs.closeSync(outputFd);

      if (result.status !== 0) {
        throw new Error(result.stderr || "Failed without error message");
      }

      content = fs.readFileSync(tempFile, "utf-8");
    } catch (e) {
      console.error(
        chalk.red(
          "\nError retrieving function spec from your Convex deployment. " +
            "Confirm that you \nare running this command from within a Convex project.\n",
        ),
      );
      process.exit(1);
    } finally {
      try {
        fs.unlinkSync(tempFile);
      } catch (error) {
        console.warn(
          chalk.yellow(
            `Warning: Failed to delete temporary file ${filePath}:`,
            error instanceof Error ? error.message : "Unknown error",
          ),
        );
      }
    }
  }

  return content;
}
