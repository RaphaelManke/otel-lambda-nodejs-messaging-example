/*instrumentation.mjs*/
// Import dependencies
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import {
  PeriodicExportingMetricReader,
  ConsoleMetricExporter,
} from '@opentelemetry/sdk-metrics';

import { AwsLambdaPowertoolsInstrumentation } from '@opentelemetry/instrumentation-aws-powertools-lambda';
import { register } from 'module';

const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new ConsoleMetricExporter(),
  }),
  instrumentations: [getNodeAutoInstrumentations(), new AwsLambdaPowertoolsInstrumentation()],
});

sdk.start();

register('import-in-the-middle/hook.mjs', import.meta.url);
