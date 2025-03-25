import {
  BatchProcessor,
  EventType,
  processPartialResponse,
} from "@aws-lambda-powertools/batch";

const processor = new BatchProcessor(EventType.SQS);

const recordHandler = async (record) => {
  // Process the record
  const payload = record.body;
  if (payload) {
    const item = JSON.parse(payload);
    await fetch("https://httpbin.org/post", {
      method: "POST",
      body: JSON.stringify(item),
    });
  }
};

export const handler= async (event, context) => {
  return await processPartialResponse(event, recordHandler, processor, {
    context,
  });
};

const res = await handler({ Records: [{ body: JSON.stringify({ foo: "bar" }) }] });
console.log(res);


