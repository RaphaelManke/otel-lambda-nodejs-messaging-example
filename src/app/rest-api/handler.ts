// AWS Lambda proxy route handler
import { APIGatewayProxyHandler } from "aws-lambda";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SQS } from "@aws-sdk/client-sqs";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { SpanKind, trace } from "@opentelemetry/api";

import {
  ATTR_MESSAGING_DESTINATION_NAME,
  ATTR_MESSAGING_OPERATION_NAME,
  ATTR_MESSAGING_OPERATION_TYPE,
  ATTR_MESSAGING_SYSTEM,
  MESSAGING_OPERATION_TYPE_VALUE_PUBLISH,
  MESSAGING_SYSTEM_VALUE_AWS_SQS,
} from "@opentelemetry/semantic-conventions/incubating";
import fetch from "node-fetch";
import {
  postRequestHook,
  preRequestHook,
} from "../../extractors/extended-instrumentation";

const ddb = DynamoDBDocument.from(new DynamoDBClient({}));
const sqs = new SQS({});

export const handler: APIGatewayProxyHandler = async (event) => {
  // TODO: move this to the instrumentation layer
  preRequestHook(event);

  console.info(JSON.stringify(event, null, 2));

  console.log("Hello from OtelLambdaExample!");

  // Fetch a random todo
  const fetchTodo = fetch(
    `https://jsonplaceholder.typicode.com/todos/${
      Math.floor(Math.random() * 200) + 1
    }`
  ).then((response) => response.json());
  const todo = await fetchTodo;

  // write the todo into a dynamodb table

  await ddb.put({
    TableName: process.env.TODO_TABLE_NAME!,
    Item: {
      id: todo.id.toString(),
      title: todo.title,
      completed: todo.completed,
      userId: todo.userId,
      ttl: Math.floor(Date.now() / 1000) + 60 * 60,
    },
  });

  // send the todo to a queue

  // TODO: do this on aws instrumentation config level so that the outgoing span has these attributes
  await trace.getTracer("recordHandler").startActiveSpan(
    `send ${process.env.TODO_QUEUE_URL!.split("/").pop()!}`,
    {
      kind: SpanKind.PRODUCER,
      attributes: {
        [ATTR_MESSAGING_DESTINATION_NAME]: process.env
          .TODO_QUEUE_URL!.split("/")
          .pop()!,
        [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_AWS_SQS,
        [ATTR_MESSAGING_OPERATION_NAME]: "send",
        [ATTR_MESSAGING_OPERATION_TYPE]: MESSAGING_OPERATION_TYPE_VALUE_PUBLISH,
      },
    },

    async (span) => {
      await sqs.sendMessage({
        QueueUrl: process.env.TODO_QUEUE_URL!,
        MessageBody: JSON.stringify(todo),
      });
      span.end();
    }
  );

  const result = {
    statusCode: 200,
    body: JSON.stringify(
      {
        message: "Todo created successfully!",
        todo,
      },
      null,
      2
    ),
  };

  // TODO: move this to the instrumentation layer
  postRequestHook("APIGatewayProxyEventV1Http", result);
  return result;
};
