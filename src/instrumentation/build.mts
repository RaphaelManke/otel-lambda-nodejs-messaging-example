import esbuild from "esbuild";
import { cache } from "esbuild-plugin-cache";
// import time from "esbuild-plugin-time";
import { openTelemetryPlugin } from "opentelemetry-esbuild-plugin-node";
import { batchProcessorInstrumentation } from "../patches/index.js";

// import { batchProcessorInstrumentation } from "../patches/powertools/instrumentation.js";

// @ts-ignore
const options = JSON.parse(process.argv.slice(2, 3));

await esbuild
  .build({
    ...options,
    plugins: [
      // time(),
      // cache({ directory: ".cache" })

      openTelemetryPlugin({
        instrumentations: [batchProcessorInstrumentation],
      }),
    ],
  })
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
