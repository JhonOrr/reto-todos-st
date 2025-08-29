import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";

export class RetoTodoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const todosTable = new dynamodb.Table(this, "TodosTable", {
      tableName: "Todos",
      partitionKey: {
        name: "todoId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const todoHandler = new lambdaNodejs.NodejsFunction(this, "TodoHandler", {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: "src/handler.ts", // archivo TS original
      handler: "main",
      environment: {
        TODOS_TABLE: todosTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    todoHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Scan",
        ],
        resources: [todosTable.tableArn],
      })
    );

    todoHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
      })
    );

    const api = new apigateway.RestApi(this, "TodoApi", {
      restApiName: "Todo Service",
      description: "API for managing todos",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
          "X-Amz-Security-Token",
          "Accept",
        ],
      },
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(todoHandler);

    const todos = api.root.addResource("todos");
    todos.addMethod("GET", lambdaIntegration); 
    todos.addMethod("POST", lambdaIntegration);
    const todoItem = todos.addResource("{id}");
    todoItem.addMethod("GET", lambdaIntegration); 
    todoItem.addMethod("PUT", lambdaIntegration); 
    todoItem.addMethod("DELETE", lambdaIntegration);

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "Todo API URL",
    });

    new cdk.CfnOutput(this, "TableName", {
      value: todosTable.tableName,
      description: "DynamoDB Table Name",
    });
  }
}
