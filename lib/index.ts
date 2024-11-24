import * as path from 'path';
import { Duration, CustomResource, Stack } from 'aws-cdk-lib';
import { Project, Source, LinuxBuildImage, BuildSpec } from 'aws-cdk-lib/aws-codebuild';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Code, DockerImageCode, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { ContainerImage } from 'aws-cdk-lib/aws-ecs';
import * as crypto from 'crypto';
import { Function } from 'aws-cdk-lib/aws-lambda';

export interface TokenInjectableDockerBuilderProps {
  path: string;
  buildArgs?: { [key: string]: string };
}

export class TokenInjectableDockerBuilder extends Construct {
  private readonly ecrRepository: Repository;
  private readonly buildTriggerResource: CustomResource;

  constructor(scope: Construct, id: string, props: TokenInjectableDockerBuilderProps) {
    super(scope, id);

    const { path: sourcePath, buildArgs } = props; // Default to linux/amd64

    // Define absolute paths for Lambda handlers
    const onEventHandlerPath = path.resolve(__dirname, '../src/onEventHandler');
    const isCompleteHandlerPath = path.resolve(__dirname, '../src/isCompleteHandler');

    // Create an ECR repository
    this.ecrRepository = new Repository(this, 'ECRRepository');

    // Package the source code as an asset
    const sourceAsset = new Asset(this, 'SourceAsset', {
      path: sourcePath, // Path to the Dockerfile or source code
    });

    // Transform buildArgs into a string of --build-arg KEY=VALUE
    const buildArgsString = buildArgs
      ? Object.entries(buildArgs)
          .map(([key, value]) => `--build-arg ${key}=${value}`)
          .join(' ')
      : '';

    // Pass the buildArgsString and platform as environment variables
    const environmentVariables: { [name: string]: { value: string } } = {
      ECR_REPO_URI: { value: this.ecrRepository.repositoryUri },
      BUILD_ARGS: { value: buildArgsString },
    };

    // Create a CodeBuild project
    const codeBuildProject = new Project(this, 'UICodeBuildProject', {
      source: Source.s3({
        bucket: sourceAsset.bucket,
        path: sourceAsset.s3ObjectKey,
      }),
      environment: {
        buildImage: LinuxBuildImage.STANDARD_7_0,
        privileged: true, // Required for Docker builds
      },
      environmentVariables: environmentVariables,
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo "Retrieving AWS Account ID..."',
              'export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)',
              'echo "Logging in to Amazon ECR..."',
              'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
            ],
          },
          build: {
            commands: [
              'echo Build phase: Building the Docker image...',
              'docker build $BUILD_ARGS -t $ECR_REPO_URI:latest $CODEBUILD_SRC_DIR',
            ],
          },
          post_build: {
            commands: [
              'echo Post-build phase: Pushing the Docker image...',
              'docker push $ECR_REPO_URI:latest',
            ],
          },
        },
      }),
    });

    // Grant permissions to interact with ECR
    this.ecrRepository.grantPullPush(codeBuildProject);

    codeBuildProject.role!.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      })
    );

    // Grant permissions to CodeBuild for CloudWatch Logs
    codeBuildProject.role!.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ['logs:PutLogEvents', 'logs:CreateLogGroup', 'logs:CreateLogStream'],
        resources: [`arn:aws:logs:${Stack.of(this).region}:${Stack.of(this).account}:*`],
      })
    );

    // Create Node.js Lambda function for onEvent
    const onEventHandlerFunction = new Function(this, 'OnEventHandlerFunction', {
      runtime: Runtime.NODEJS_18_X, // Use Node.js runtime
      code: Code.fromAsset(onEventHandlerPath), // Path to handler code
      handler: 'index.handler', // Entry point (adjust as needed)
      timeout: Duration.minutes(15),
    });

    onEventHandlerFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['codebuild:StartBuild'],
        resources: [codeBuildProject.projectArn], // Restrict to specific project
      })
    );

    // Create Node.js Lambda function for isComplete
    const isCompleteHandlerFunction = new Function(this, 'IsCompleteHandlerFunction', {
      runtime: Runtime.NODEJS_18_X,
      code: Code.fromAsset(isCompleteHandlerPath),
      handler: 'index.handler',
      timeout: Duration.minutes(15),
    });

    isCompleteHandlerFunction.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'codebuild:BatchGetBuilds',
          'codebuild:ListBuildsForProject',
          'logs:GetLogEvents',
          'logs:DescribeLogStreams',
          'logs:DescribeLogGroups'
        ],
        resources: ['*'],
      })
    );

    // Create a custom resource provider
    const provider = new Provider(this, 'CustomResourceProvider', {
      onEventHandler: onEventHandlerFunction,
      isCompleteHandler: isCompleteHandlerFunction,
      queryInterval: Duration.minutes(1),
    });

    // Define the custom resource
    this.buildTriggerResource = new CustomResource(this, 'BuildTriggerResource', {
      serviceToken: provider.serviceToken,
      properties: {
        ProjectName: codeBuildProject.projectName,
        Trigger: crypto.randomUUID(),
      },
    });

    this.buildTriggerResource.node.addDependency(codeBuildProject);
  }

  public getContainerImage(): ContainerImage {
    return ContainerImage.fromEcrRepository(this.ecrRepository, 'latest');
  }

  public getDockerImageCode(): DockerImageCode {
    return DockerImageCode.fromEcr(this.ecrRepository);
  }
}
