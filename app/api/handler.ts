// AWS Lambda proxy route handler 
import { APIGatewayProxyEvent, APIGatewayProxyHandler } from 'aws-lambda';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SQS } from '@aws-sdk/client-sqs';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { Attributes, SpanKind, trace } from '@opentelemetry/api';
import {
    ATTR_HTTP_REQUEST_METHOD
} from '@opentelemetry/semantic-conventions';

import { ATTR_MESSAGING_DESTINATION_NAME, ATTR_MESSAGING_OPERATION_NAME, ATTR_MESSAGING_OPERATION_TYPE, ATTR_MESSAGING_SYSTEM, MESSAGING_OPERATION_TYPE_VALUE_PUBLISH, MESSAGING_SYSTEM_VALUE_AWS_SQS } from '@opentelemetry/semantic-conventions/incubating';
import fetch from 'node-fetch';
const extractOpenTelemetrySemanticSpanAttributesFromAPIGatewayProxyEvent = (event: APIGatewayProxyEvent): Attributes => {
    return {
        [ATTR_HTTP_REQUEST_METHOD]: event.httpMethod,
        "http.url": event.path,
        "http.user_agent": event.headers['User-Agent'],
        "http.host": event.headers['Host'],
        "http.client_ip": event.requestContext.identity.sourceIp,
        "http.path": event.path,
        "http.route": event.resource,
        "http.scheme": event.headers['CloudFront-Forwarded-Proto'],
        "http.target": event.requestContext.path,
        "http.flavor": event.requestContext.protocol,
        "http.server_name": event.headers['Host'],
        "http.request_content_length": event.body?.length,
        "http.request_content_length_uncompressed": event.body?.length,
        "http.query_string": event.queryStringParameters ? JSON.stringify(event.queryStringParameters) : undefined
    }
}



const ddb = DynamoDBDocument.from(new DynamoDBClient({}));
const sqs = new SQS({});

const handler: APIGatewayProxyHandler = async (event) => {
    trace.getActiveSpan()?.setAttributes(extractOpenTelemetrySemanticSpanAttributesFromAPIGatewayProxyEvent(event));

    console.log("Hello from OtelLambdaExample!");

    // Fetch a random todo
    const fetchTodo = fetch(`https://jsonplaceholder.typicode.com/todos/${Math.floor(Math.random() * 200) + 1}`).then(response => response.json());
    const todo = await fetchTodo;

    // write the todo into a dynamodb table

    await ddb.put({
        TableName: process.env.TODO_TABLE_NAME!,
        Item: {
            id: todo.id.toString(),
            title: todo.title,
            completed: todo.completed,
            userId: todo.userId,
            ttl: Math.floor(Date.now() / 1000) + 60 * 60
        }
    });

    // send the todo to a queue

    // TODO: do this on aws instrumentation config level so that the outgoing span has these attributes
    await trace.getTracer('recordHandler').startActiveSpan(`send ${process.env.TODO_QUEUE_URL!.split('/').pop()!}`,
        {
            kind: SpanKind.PRODUCER, attributes: {
                [ATTR_MESSAGING_DESTINATION_NAME]: process.env.TODO_QUEUE_URL!.split('/').pop()!,
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_AWS_SQS,
                [ATTR_MESSAGING_OPERATION_NAME]: "send",
                [ATTR_MESSAGING_OPERATION_TYPE]: MESSAGING_OPERATION_TYPE_VALUE_PUBLISH,
            }
        },

        async (span) => {
            await sqs.sendMessage({
                QueueUrl: process.env.TODO_QUEUE_URL!,
                MessageBody: JSON.stringify(todo)
            });
            span.end();
        });


    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Todo created successfully!',
            todo
        }, null, 2),
    };
};

module.exports = { handler };