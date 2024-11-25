# TokenInjectableDockerBuilder

The `TokenInjectableDockerBuilder` is a flexible AWS CDK construct that enables the usage of AWS CDK tokens in the building, pushing, and deployment of Docker images to Amazon Elastic Container Registry (ECR). It leverages AWS CodeBuild and Lambda custom resources. 

## Why?

AWS CDK already provides mechanisms for creating deployable assets using Docker, such as [DockerImageAsset](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecr_assets.DockerImageAsset.html) and [DockerImageCode](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.DockerImageCode.html), but these Constructs are limited because they cannot accept CDK tokens as build-args. With the TokenInjectableDockerBuilder, one can inject CDK tokens as build-time args into their Docker-based assets to satisfy a much larger range of dependency relationships.

For example, imagine a NextJS frontend Docker image that calls an API Gateway endpoint. Logically, one would first deploy the API Gateway, then deploy the NextJS frontend such that it has reference to the API Gateway endpoint through a [build-time environment variable](https://nextjs.org/docs/pages/building-your-application/configuring/environment-variables). In this case, building the Docker-based asset before deployment time doesn't work since it is dependent on the deployment of the API Gateway.

## Features

- Automatically builds and pushes Docker images to ECR.
- Supports custom build arguments for Docker builds, including CDK tokens that are resolved at deployment time.
- Retrieves the latest Docker image from ECR for use in ECS or Lambda.

---

## Installation

First, install the construct using NPM:

```bash
npm install token-injectable-docker-builder
```

---

## Constructor

### `TokenInjectableDockerBuilder`

#### Parameters

- **`scope`**: The construct's parent scope.
- **`id`**: The construct ID.
- **`props`**: Configuration properties.

#### Properties in `TokenInjectableDockerBuilderProps`

| Property       | Type                              | Required | Description                                                |
|----------------|-----------------------------------|----------|------------------------------------------------------------|
| `path`         | `string`                         | Yes      | The file path to the Dockerfile or source code directory.  |
| `buildArgs`    | `{ [key: string]: string }`       | No       | Build arguments to pass to the Docker build process.       |

---

## Usage Example

Here is an example of how to use the `TokenInjectableDockerBuilder` in your AWS CDK application:

```typescript
import * as cdk from 'aws-cdk-lib';
import { TokenInjectableDockerBuilder } from 'token-injectable-docker-builder';

export class MyStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a TokenInjectableDockerBuilder construct
    const dockerBuilder = new TokenInjectableDockerBuilder(this, 'MyDockerBuilder', {
      path: './docker', // Path to the directory containing your Dockerfile
      buildArgs: {
        TOKEN: 'my-secret-token', // Example of a build argument
        ENV: 'production',
      },
    });

    // Retrieve the container image for ECS
    const containerImage = dockerBuilder.containerImage;

    // Retrieve the Docker image code for Lambda
    const dockerImageCode = dockerBuilder.dockerImageCode;

    // Example: Use the container image in an ECS service
    new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      containerImage,
    });

    // Example: Use the Docker image code in a Lambda function
    new lambda.Function(this, 'DockerLambdaFunction', {
      runtime: lambda.Runtime.FROM_IMAGE,
      code: dockerImageCode,
      handler: lambda.Handler.FROM_IMAGE,
    });
  }
}
```

---

## How It Works

1. **Docker Source**: The construct packages the source code or Dockerfile specified in the `path` property as an S3 asset.
2. **CodeBuild Project**:
   - Uses the packaged asset and build arguments to build the Docker image.
   - Pushes the image to an ECR repository.
3. **Custom Resource**:
   - Triggers the build process using a Lambda function (`onEvent`).
   - Monitors the build status using another Lambda function (`isComplete`).
4. **Outputs**:
   - Provides the Docker image via `.containerImage` for ECS use.
   - Provides the Docker image code via `.dockerImageCode` for Lambda.

---

## IAM Permissions

This construct automatically grants the required IAM permissions for:
- CodeBuild to pull and push images to ECR.
- CodeBuild to write logs to CloudWatch.
- Lambda functions to monitor the build status and retrieve logs.

---

## Notes

- **Build Arguments**: Use the `buildArgs` property to pass custom arguments to the Docker build process. These are transformed into `--build-arg` flags.
- **ECR Repository**: A new ECR repository is created automatically.
- **Custom Resources**: Custom resources are used to handle lifecycle events and ensure the build is completed successfully.

---

## Prerequisites

Ensure you have the following:
1. Docker installed locally if you're testing builds.
2. AWS CDK CLI installed (`npm install -g aws-cdk`).
3. An AWS account and configured credentials.

---

## Troubleshooting

1. **Build Errors**: Check the AWS CodeBuild logs in CloudWatch.
2. **Lambda Function Errors**: Check the `onEvent` and `isComplete` Lambda logs in CloudWatch.
3. **Permissions**: Ensure the IAM role for CodeBuild has the required permissions to interact with ECR and CloudWatch.

---

## Support

Open an issue on [GitHub](https://github.com/AlexTech314/TokenInjectableDockerBuilder) :)

---

## Reference Links
- [npm](https://www.npmjs.com/package/token-injectable-docker-builder)
- [ConstructHub](https://constructs.dev/packages/token-injectable-docker-builder)
