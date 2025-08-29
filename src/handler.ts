import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  UpdateCommand, 
  DeleteCommand, 
  ScanCommand 
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamoDb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cloudWatch = new CloudWatchClient({});
const TABLE_NAME = process.env.TODOS_TABLE!;

interface Todo {
  todoId: string;
  title: string;
  description?: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

// Structured logging
const log = (level: string, message: string, data?: any) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(data && { data }),
  };
  console.log(JSON.stringify(logEntry));
};

// Custom metric
const putMetric = async (metricName: string, value: number) => {
  try {
    await cloudWatch.send(new PutMetricDataCommand({
      Namespace: 'TodoApp',
      MetricData: [{
        MetricName: metricName,
        Value: value,
        Unit: 'Count',
        Timestamp: new Date(),
      }],
    }));
  } catch (error: any) {
    log('error', 'Failed to put metric', { error: error.message });
  }
};

const createResponse = (statusCode: number, body: any): APIGatewayProxyResult => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  },
  body: JSON.stringify(body),
});

export const main = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod;
  const path = event.path;  
  const todoId = event.pathParameters?.id;

  log('info', 'Request received', { method, path, todoId });

  try {
    switch (method) {
      case 'POST':
        return await createTodo(event);
      case 'GET':
        return todoId ? await getTodo(todoId) : await listTodos();
      case 'PUT':
        return await updateTodo(todoId!, event);
      case 'DELETE':
        return await deleteTodo(todoId!);
      default:
        return createResponse(405, { error: 'Method not allowed' });
    }
  } catch (error: any) {
    log('error', 'Request failed', { error: error.message, stack: error.stack });
    return createResponse(500, { error: 'Internal server error' });
  }
};

const createTodo = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const body = JSON.parse(event.body || '{}');
  
  if (!body.title) {
    return createResponse(400, { error: 'Title is required' });
  }

  const todo: Todo = {
    todoId: uuidv4(),
    title: body.title,
    description: body.description || '',
    completed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await dynamoDb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: todo,
  }));

  // Custom metric
  await putMetric('TodoCreatedCount', 1);

  log('info', 'Todo created', { todoId: todo.todoId });
  return createResponse(201, todo);
};

const getTodo = async (todoId: string): Promise<APIGatewayProxyResult> => {
  const result = await dynamoDb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { todoId },
  }));

  if (!result.Item) {
    return createResponse(404, { error: 'Todo not found' });
  }

  log('info', 'Todo retrieved', { todoId });
  return createResponse(200, result.Item);
};

const listTodos = async (): Promise<APIGatewayProxyResult> => {
  const result = await dynamoDb.send(new ScanCommand({
    TableName: TABLE_NAME,
  }));

  log('info', 'Todos listed', { count: result.Items?.length || 0 });
  return createResponse(200, { todos: result.Items || [] });
};

const updateTodo = async (todoId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const body = JSON.parse(event.body || '{}');

  const updateExpression = [];
  const expressionAttributeValues: any = {};
  const expressionAttributeNames: any = {};

  if (body.title !== undefined) {
    updateExpression.push('#title = :title');
    expressionAttributeNames['#title'] = 'title';
    expressionAttributeValues[':title'] = body.title;
  }

  if (body.description !== undefined) {
    updateExpression.push('description = :description');
    expressionAttributeValues[':description'] = body.description;
  }

  if (body.completed !== undefined) {
    updateExpression.push('completed = :completed');
    expressionAttributeValues[':completed'] = body.completed;
  }

  if (updateExpression.length === 0) {
    return createResponse(400, { error: 'No valid fields to update' });
  }

  updateExpression.push('updatedAt = :updatedAt');
  expressionAttributeValues[':updatedAt'] = new Date().toISOString();

  try {
    const result = await dynamoDb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { todoId },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ReturnValues: 'ALL_NEW',
    }));

    log('info', 'Todo updated', { todoId });
    return createResponse(200, result.Attributes);
  } catch (error: any) {
    if (error.name === 'ValidationException') {
      return createResponse(404, { error: 'Todo not found' });
    }
    throw error;
  }
};

const deleteTodo = async (todoId: string): Promise<APIGatewayProxyResult> => {
  try {
    await dynamoDb.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { todoId },
      ConditionExpression: 'attribute_exists(todoId)',
    }));

    log('info', 'Todo deleted', { todoId });
    return createResponse(204, {});
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      return createResponse(404, { error: 'Todo not found' });
    }
    throw error;
  }
};