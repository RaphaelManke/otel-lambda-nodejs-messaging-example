import { IBuildProvider, ProviderBuildOptions } from "@mrgrain/cdk-esbuild";
import { Annotations, Aspects } from "aws-cdk-lib";
import { spawnSync } from "child_process";
import { IConstruct } from "constructs";

export class BuildScriptProvider implements IBuildProvider {
  constructor(public readonly scriptPath: string) {}

  buildSync(options: ProviderBuildOptions): void {
    const result = spawnSync(
      "tsx",
      [this.scriptPath, JSON.stringify(options)],
      {
        stdio: ["inherit", "inherit", "pipe"],
      }
    );

    if (result.stderr.byteLength > 0) {
      console.error(
        `ESBuild error for path ${this.scriptPath}:\n`,
        result.stderr.toString()
      );
    }
    if (result.status != 0) {
      throw result.stderr.toString();
    }
  }
}
