# TokenInjectableDockerBuilder

The `TokenInjectableDockerBuilder` is a flexible AWS CDK construct that enables the usage of AWS CDK tokens in the building, pushing, and deployment of Docker images to Amazon Elastic Container Registry (ECR). It leverages AWS CodeBuild and Lambda custom resources. 

---

## Why?

AWS CDK already provides mechanisms for creating deployable assets using Docker, such as [DockerImageAsset](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecr_assets.DockerImageAsset.html) and [DockerImageCode](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.DockerImageCode.html), but these constructs are limited because they cannot accept CDK tokens as build-args. The `TokenInjectableDockerBuilder` allows injecting CDK tokens as build-time arguments into Docker-based assets, enabling more dynamic dependency relationships.

For example, a Next.js frontend Docker image may require an API Gateway URL as an argument to create a reference from the UI to the associated API in a given deployment. With this construct, you can deploy the API Gateway first, then pass its URL as a build-time argument to the Next.js Docker image. As a result, your Next.js frontend can dynamically fetch data from the API Gateway without hardcoding the URL, or needing mutliple sepereate Stacks.

---

## Features

- **Build and Push Docker Images**: Automatically builds and pushes Docker images to ECR.
- **Token Support**: Supports custom build arguments for Docker builds, including CDK tokens resolved at deployment time.
- **Custom Install and Pre-Build Commands**: Allows specifying custom commands to run during the `install` and `pre_build` phases of the CodeBuild build process.
- **VPC Configuration**: Supports deploying the CodeBuild project within a VPC, with customizable security groups and subnet selection.
- **Docker Login**: Supports Docker login using credentials stored in AWS Secrets Manager.
- **ECR Repository Management**: Creates an ECR repository with lifecycle rules and encryption.
- **Integration with ECS and Lambda**: Provides outputs for use in AWS ECS and AWS Lambda.

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

| Property                 | Type                        | Required | Description                                                                                                                                                           |
|--------------------------|-----------------------------|----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `path`                   | `string`                    | Yes      | The file path to the Dockerfile or source code directory.                                                                                                             |
| `buildArgs`              | `{ [key: string]: string }` | No       | Build arguments to pass to the Docker build process. These are transformed into `--build-arg` flags. To use in Dockerfile, leverage the `ARG` keyword. For more details, please see the [official Docker docs](https://docs.docker.com/build/building/variables/).                                                                  |
| `dockerLoginSecretArn`   | `string`                    | No       | ARN of an AWS Secrets Manager secret for Docker credentials. Skips login if not provided.                                                                              |
| `vpc`                    | `IVpc`                      | No       | The VPC in which the CodeBuild project will be deployed. If provided, the CodeBuild project will be launched within the specified VPC.                                 |
| `securityGroups`         | `ISecurityGroup[]`          | No       | The security groups to attach to the CodeBuild project. These should define the network access rules for the CodeBuild project.                                        |
| `subnetSelection`        | `SubnetSelection`           | No       | The subnet selection to specify which subnets to use within the VPC. Allows the user to select private, public, or isolated subnets.                                   |
| `installCommands`        | `string[]`                  | No       | Custom commands to run during the `install` phase of the CodeBuild build process. Will be executed before Docker image is built. Useful for installing necessary dependencies for running pre-build scripts.                                                                                   |
| `preBuildCommands`       | `string[]`                  | No       | Custom commands to run during the `pre_build` phase of the CodeBuild build process. Will be executed before Docker image is built. Useful for running pre-build scripts, such as to fetch configs.                                                                                   |

---

## Usage Examples

### Simple Usage Example

This example demonstrates the most basic usage of the `TokenInjectableDockerBuilder`, where you specify the path to your Docker context and provide simple build arguments.

#### TypeScript/NPM Example

```typescript
import * as cdk from 'aws-cdk-lib';
import { TokenInjectableDockerBuilder } from 'token-injectable-docker-builder';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class SimpleStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const dockerBuilder = new TokenInjectableDockerBuilder(this, 'SimpleDockerBuilder', {
      path: './docker', // Path to your Dockerfile or Docker context
      buildArgs: {
        ENV: 'production', // Simple build argument
      },
    });

    // Use in ECS
    new ecs.ContainerDefinition(this, 'SimpleContainer', {
      image: dockerBuilder.containerImage,
      // ... other container properties ...
    });

    // Use in Lambda
    new lambda.Function(this, 'SimpleDockerLambdaFunction', {
      runtime: lambda.Runtime.FROM_IMAGE,
      code: dockerBuilder.dockerImageCode,
      handler: lambda.Handler.FROM_IMAGE,
    });
  }
}
```

#### Python Example

```python
from aws_cdk import (
    aws_ecs as ecs,
    aws_lambda as lambda_,
    core as cdk,
)
from token_injectable_docker_builder import TokenInjectableDockerBuilder

class SimpleStack(cdk.Stack):

    def __init__(self, scope: cdk.App, id: str, **kwargs):
        super().__init__(scope, id, **kwargs)

        docker_builder = TokenInjectableDockerBuilder(self, "SimpleDockerBuilder",
            path="./docker",  # Path to your Dockerfile or Docker context
            build_args={
                "ENV": "production",  # Simple build argument
            },
        )

        # Use in ECS
        ecs.ContainerDefinition(self, "SimpleContainer",
            image=docker_builder.container_image,
            # ... other container properties ...
        )

        # Use in Lambda
        lambda_.Function(self, "SimpleDockerLambdaFunction",
            runtime=lambda_.Runtime.FROM_IMAGE,
            code=docker_builder.docker_image_code,
            handler=lambda_.Handler.FROM_IMAGE
        )
```

---

### Advanced Usage Example

This example demonstrates more advanced usage, including using CDK tokens as build arguments, specifying custom install and pre-build commands, and configuring VPC settings.

#### TypeScript/NPM Example

```typescript
import * as cdk from 'aws-cdk-lib';
import { TokenInjectableDockerBuilder } from 'token-injectable-docker-builder';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class MyStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Example VPC and security group (optional)
    const vpc = new ec2.Vpc(this, 'MyVpc');
    const securityGroup = new ec2.SecurityGroup(this, 'MySecurityGroup', {
      vpc,
    });

    // Example of using CDK tokens as build arguments
    const myApiGateway = /* ... create or import your API Gateway ... */;

    const dockerBuilder = new TokenInjectableDockerBuilder(this, 'MyDockerBuilder', {
      path: './docker',
      buildArgs: {
        API_URL: myApiGateway.url, // Using CDK token
        ENV: 'production',
      },
      dockerLoginSecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:DockerLoginSecret',
      vpc,
      securityGroups: [securityGroup],
      subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      installCommands: [
        'echo "Updating package lists..."',
        'apt-get update -y',
        'echo "Installing required packages..."',
        'apt-get install -y curl dnsutils',
      ],
      preBuildCommands: [
        'echo "Fetching configuration from private API..."',
        'curl -o config.json https://api.example.com/config',
      ],
    });

    // Use in ECS
    new ecs.ContainerDefinition(this, 'MyContainer', {
      image: dockerBuilder.containerImage,
      // ... other container properties ...
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

#### Python Example

```python
from aws_cdk import (
    aws_ec2 as ec2,
    aws_ecs as ecs,
    aws_lambda as lambda_,
    core as cdk,
)
from token_injectable_docker_builder import TokenInjectableDockerBuilder

class MyStack(cdk.Stack):

    def __init__(self, scope: cdk.App, id: str, **kwargs):
        super().__init__(scope, id, **kwargs)

        # Example VPC and security group (optional)
        vpc = ec2.Vpc(self, "MyVpc")
        security_group = ec2.SecurityGroup(self, "MySecurityGroup", vpc=vpc)

        # Example of using CDK tokens as build arguments
        my_api_gateway = # ... create or import your API Gateway ...

        docker_builder = TokenInjectableDockerBuilder(self, "MyDockerBuilder",
            path="./docker",
            build_args={
                "API_URL": my_api_gateway.url,  # Using CDK token
                "ENV": "production"
            },
            docker_login_secret_arn="arn:aws:secretsmanager:us-east-1:123456789012:secret:DockerLoginSecret",
            vpc=vpc,
            security_groups=[security_group],
            subnet_selection=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS),
            install_commands=[
                'echo "Updating package lists..."',
                'apt-get update -y',
                'echo "Installing required packages..."',
                'apt-get install -y curl dnsutils',
            ],
            pre_build_commands=[
                'echo "Fetching configuration from private API..."',
                'curl -o config.json https://api.example.com/config',
            ],
        )

        # Use in ECS
        ecs.ContainerDefinition(self, "MyContainer",
            image=docker_builder.container_image,
            # ... other container properties ...
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
   - Executes any custom `installCommands` and `preBuildCommands` during the build process.
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

- **CodeBuild**:
  - Pull and push images to ECR.
  - Access to AWS Secrets Manager if `dockerLoginSecretArn` is provided.
  - Access to the KMS key for encryption.
- **Lambda Functions**:
  - Start and monitor CodeBuild builds.
  - Access CloudWatch Logs.
  - Access to the KMS key for encryption.
  - Pull and push images to ECR.

---

## Notes

- **Build Arguments**: Pass custom arguments via `buildArgs` as `--build-arg` flags. CDK tokens can be used to inject dynamic values resolved at deployment time.
- **Custom Commands**: Use `installCommands` and `preBuildCommands` to run custom shell commands during the build process. This can be useful for installing dependencies or fetching configuration files.
- **VPC Configuration**: If your build process requires access to resources within a VPC, you can specify the VPC, security groups, and subnet selection.
- **Docker Login**: If you need to log in to a private Docker registry before building the image, provide the ARN of a secret in AWS Secrets Manager containing the Docker credentials.
- **ECR Repository**: Automatically creates an ECR repository with lifecycle rules to manage image retention, encryption with a KMS key, and image scanning on push.

---

## Troubleshooting

1. **Build Errors**: Check the CodeBuild logs in CloudWatch Logs for detailed error messages.
2. **Lambda Errors**: Check the `onEvent` and `isComplete` Lambda function logs in CloudWatch Logs.
3. **Permissions**: Ensure IAM roles have the required permissions for CodeBuild, ECR, Secrets Manager, and KMS if applicable.
4. **Network Access**: If the build requires network access (e.g., to download dependencies), ensure that the VPC configuration allows outbound internet access, or use a NAT gateway if in private subnets.

---

## Support

For issues or feature requests, please open an issue on [GitHub](https://github.com/AlexTech314/TokenInjectableDockerBuilder).

---

## Reference Links

[![View on Construct Hub](https://constructs.dev/badge?package=token-injectable-docker-builder)](https://constructs.dev/packages/token-injectable-docker-builder)

---

# License

This project is licensed under the terms of the MIT license.

---

# Acknowledgements

- Inspired by the need for more dynamic Docker asset management in AWS CDK.
- Thanks to the AWS CDK community for their continuous support and contributions.

---

Feel free to reach out if you have any questions or need further assistance!
