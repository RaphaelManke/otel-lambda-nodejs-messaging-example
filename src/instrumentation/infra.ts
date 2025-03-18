import { TypeScriptCode } from "@mrgrain/cdk-esbuild";
import { LayerVersion } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

export class OtelInstrumentationConfig extends Construct {
  public readonly layer: LayerVersion;
  constructor(scope: Construct, id: string, props: any) {
    super(scope, id);
    const bundledCode = new TypeScriptCode(
      "src/instrumentation/instrumentation-config.ts",
      {
        copyDir: ["src/collector"],
        buildOptions: {},
      }
    );
    this.layer = new LayerVersion(this, "instrumentation-config-layer", {
      code: bundledCode,
    });
  }
}
