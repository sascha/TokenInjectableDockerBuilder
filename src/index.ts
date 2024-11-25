import * as path from 'path';
import { CustomResource, Stack, Duration } from 'aws-cdk-lib';
import { Project, Source, LinuxBuildImage, BuildSpec } from 'aws-cdk-lib/aws-codebuild';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { ContainerImage } from 'aws-cdk-lib/aws-ecs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime, Code, DockerImageCode, Function } from 'aws-cdk-lib/aws-lambda';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

/**
 * Properties for the `TokenInjectableDockerBuilder` construct.
 */
export interface TokenInjectableDockerBuilderProps {
  /**
   * The path to the directory containing the Dockerfile or source code.
   */
  readonly path: string;

  /**
   * Build arguments to pass to the Docker build process.
   * These are transformed into `--build-arg` flags.
   * @example
   * {
   *   TOKEN: 'my-secret-token',
   *   ENV: 'production'
   * }
   */
  readonly buildArgs?: { [key: string]: string };
}


/**
 * A CDK construct to build and push Docker images to an ECR repository using CodeBuild and Lambda custom resources.
 *
 * @example
 * const dockerBuilder = new TokenInjectableDockerBuilder(this, 'DockerBuilder', {
 *   path: './docker',
 *   buildArgs: {
 *     TOKEN: 'my-secret-token',
 *     ENV: 'production'
 *   },
 * });
 *
 * const containerImage = dockerBuilder.getContainerImage();
 */
export class TokenInjectableDockerBuilder extends Construct {
  public readonly containerImage: ContainerImage;
  public readonly dockerImageCode: DockerImageCode;
  private readonly ecrRepository: Repository;

  /**
   * Creates a new `TokenInjectableDockerBuilder` instance.
   *
   * @param scope The parent construct/stack.
   * @param id The unique ID of the construct.
   * @param props Configuration properties for the construct.
   */
  constructor(scope: Construct, id: string, props: TokenInjectableDockerBuilderProps) {
    super(scope, id);

    const { path: sourcePath, buildArgs } = props; // Default to linux/amd64

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
      }),
    );

    // Grant permissions to CodeBuild for CloudWatch Logs
    codeBuildProject.role!.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ['logs:PutLogEvents', 'logs:CreateLogGroup', 'logs:CreateLogStream'],
        resources: [`arn:aws:logs:${Stack.of(this).region}:${Stack.of(this).account}:*`],
      }),
    );

    // Create Node.js Lambda function for onEvent
    const onEventHandlerFunction = new Function(this, 'OnEventHandlerFunction', {
      runtime: Runtime.NODEJS_LATEST, // Use Node.js runtime
      code: Code.fromAsset(path.resolve(__dirname, './onEvent')), // Path to handler code
      handler: 'onEvent.handler', // Entry point (adjust as needed)
      timeout: Duration.minutes(15),
    });

    onEventHandlerFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['codebuild:StartBuild'],
        resources: [codeBuildProject.projectArn], // Restrict to specific project
      }),
    );

    // Create Node.js Lambda function for isComplete
    const isCompleteHandlerFunction = new Function(this, 'IsCompleteHandlerFunction', {
      runtime: Runtime.NODEJS_LATEST,
      code: Code.fromAsset(path.resolve(__dirname, './isComplete')), // Path to handler code
      handler: 'isComplete.handler', // Entry point (adjust as needed)
      timeout: Duration.minutes(15),
    });

    isCompleteHandlerFunction.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'codebuild:BatchGetBuilds',
          'codebuild:ListBuildsForProject',
          'logs:GetLogEvents',
          'logs:DescribeLogStreams',
          'logs:DescribeLogGroups',
        ],
        resources: ['*'],
      }),
    );

    // Create a custom resource provider
    const provider = new Provider(this, 'CustomResourceProvider', {
      onEventHandler: onEventHandlerFunction,
      isCompleteHandler: isCompleteHandlerFunction,
      queryInterval: Duration.seconds(30),
    });

    // Define the custom resource
    const buildTriggerResource = new CustomResource(this, 'BuildTriggerResource', {
      serviceToken: provider.serviceToken,
      properties: {
        ProjectName: codeBuildProject.projectName,
        Trigger: crypto.randomUUID(),
      },
    });

    buildTriggerResource.node.addDependency(codeBuildProject);
    this.containerImage = ContainerImage.fromEcrRepository(this.ecrRepository);
    this.dockerImageCode = DockerImageCode.fromEcr(this.ecrRepository);
  }
}
