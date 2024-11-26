# TokenInjectableDockerBuilder

The `TokenInjectableDockerBuilder` is a flexible AWS CDK construct that enables the usage of AWS CDK tokens in the building, pushing, and deployment of Docker images to Amazon Elastic Container Registry (ECR). It leverages AWS CodeBuild and Lambda custom resources.

---

## Why?

AWS CDK already provides mechanisms for creating deployable assets using Docker, such as [DockerImageAsset](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecr_assets.DockerImageAsset.html) and [DockerImageCode](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.DockerImageCode.html), but these Constructs are limited because they cannot accept CDK tokens as build-args. The `TokenInjectableDockerBuilder` allows injecting CDK tokens as build-time arguments into Docker-based assets, enabling more dynamic dependency relationships.

For example, a Next.js frontend Docker image may require an API Gateway URL. With this construct, you can deploy the API Gateway first, then pass its URL as a build-time argument to the Next.js Docker image.

---

## Features

- Automatically builds and pushes Docker images to ECR.
- Supports custom build arguments for Docker builds, including CDK tokens resolved at deployment time.
- Retrieves Docker images for use in ECS or Lambda.

---

## Installation

### For NPM

Install the construct using NPM:

```bash
npm install token-injectable-docker-builder
```

### For Python

Install the construct using pip:

```bash
pip install token-injectable-docker-builder
```

---

## Constructor

### `TokenInjectableDockerBuilder`

#### Parameters

- **`scope`**: The construct's parent scope.
- **`id`**: The construct ID.
- **`props`**: Configuration properties.

#### Properties in `TokenInjectableDockerBuilderProps`

| Property               | Type               | Required | Description                                                                                           |
|------------------------|--------------------|----------|-------------------------------------------------------------------------------------------------------|
| `path`                 | `string`          | Yes      | The file path to the Dockerfile or source code directory.                                             |
| `buildArgs`            | `{ [key: string]: string }` | No | Build arguments to pass to the Docker build process.                                                  |
| `dockerLoginSecretArn` | `string`          | No       | ARN of an AWS Secrets Manager secret for Docker credentials. Skips login if not provided.             |

---

## Usage Examples

### TypeScript/NPM Example

Here is how to use `TokenInjectableDockerBuilder` in an AWS CDK project with TypeScript:

```typescript
import * as cdk from 'aws-cdk-lib';
import { TokenInjectableDockerBuilder } from 'token-injectable-docker-builder';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class MyStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const dockerBuilder = new TokenInjectableDockerBuilder(this, 'MyDockerBuilder', {
      path: './docker',
      buildArgs: {
        TOKEN: 'my-secret-token',
        ENV: 'production',
      },
      dockerLoginSecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:DockerLoginSecret',
    });

    // Use in ECS
    new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      containerImage: dockerBuilder.containerImage,
    });

    // Use in Lambda
    new lambda.Function(this, 'DockerLambdaFunction', {
      runtime: lambda.Runtime.FROM_IMAGE,
      code: dockerBuilder.dockerImageCode,
      handler: lambda.Handler.FROM_IMAGE,
    });
  }
}
```

---

### Python Example

Here is how to use `TokenInjectableDockerBuilder` in an AWS CDK project with Python:

```python
from aws_cdk import core as cdk
from token_injectable_docker_builder import TokenInjectableDockerBuilder
from aws_cdk import aws_ecs as ecs
from aws_cdk import aws_lambda as lambda_

class MyStack(cdk.Stack):

    def __init__(self, scope: cdk.App, id: str, **kwargs):
        super().__init__(scope, id, **kwargs)

        docker_builder = TokenInjectableDockerBuilder(self, "MyDockerBuilder",
            path="./docker",
            build_args={
                "TOKEN": "my-secret-token",
                "ENV": "production"
            },
            docker_login_secret_arn="arn:aws:secretsmanager:us-east-1:123456789012:secret:DockerLoginSecret"
        )

        # Use in ECS
        ecs.FargateTaskDefinition(self, "TaskDefinition",
            container_image=docker_builder.container_image
        )

        # Use in Lambda
        lambda_.Function(self, "DockerLambdaFunction",
            runtime=lambda_.Runtime.FROM_IMAGE,
            code=docker_builder.docker_image_code,
            handler=lambda_.Handler.FROM_IMAGE
        )
```

---

## How It Works

1. **Docker Source**: Packages the source code or Dockerfile specified in the `path` property as an S3 asset.
2. **CodeBuild Project**:
   - Uses the packaged asset and `buildArgs` to build the Docker image.
   - Pushes the image to an ECR repository.
3. **Custom Resource**:
   - Triggers the build process using a Lambda function (`onEvent`).
   - Monitors the build status using another Lambda function (`isComplete`).
4. **Outputs**:
   - `.containerImage`: Returns the Docker image for ECS.
   - `.dockerImageCode`: Returns the Docker image code for Lambda.

---

## IAM Permissions

The construct automatically grants permissions for:
- CodeBuild to pull and push images to ECR.
- Lambda to monitor build status and retrieve logs.
- Encryption via a custom KMS key.

---

## Notes

- **Build Arguments**: Pass custom arguments via `buildArgs` as `--build-arg` flags.
- **ECR Repository**: Automatically creates an ECR repository with lifecycle rules.
- **Custom Resources**: Manages lifecycle events for builds using custom Lambda handlers.

---

## Troubleshooting

1. **Build Errors**: Check CodeBuild logs in CloudWatch.
2. **Lambda Errors**: Check `onEvent` and `isComplete` Lambda logs in CloudWatch.
3. **Permissions**: Ensure IAM roles have the required permissions for CodeBuild, ECR, and Secrets Manager.

---

## Support

Open an issue on [GitHub](https://github.com/AlexTech314/TokenInjectableDockerBuilder).

---

## Reference Links
[![View on Construct Hub](https://constructs.dev/badge?package=token-injectable-docker-builder)](https://constructs.dev/packages/token-injectable-docker-builder)
