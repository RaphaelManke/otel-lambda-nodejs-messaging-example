// AWS Lambda proxy route handler
import { APIGatewayProxyHandler } from "aws-lambda";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SQS } from "@aws-sdk/client-sqs";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";

import fetch from "node-fetch";

const ddb = DynamoDBDocument.from(new DynamoDBClient({}));
const sqs = new SQS({});

export const handler: APIGatewayProxyHandler = async (event) => {
  //   console.info(JSON.stringify(event, null, 2));

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
  await sqs.sendMessage({
    QueueUrl: process.env.TODO_QUEUE_URL!,
    MessageBody: JSON.stringify(todo),
  });

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

  return result;
};
