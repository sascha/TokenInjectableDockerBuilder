import * as crypto from 'crypto';
import * as path from 'path';
import { CustomResource, Duration } from 'aws-cdk-lib';
import { Project, Source, LinuxBuildImage, BuildSpec } from 'aws-cdk-lib/aws-codebuild';
import { Repository, RepositoryEncryption, TagStatus } from 'aws-cdk-lib/aws-ecr';
import { ContainerImage } from 'aws-cdk-lib/aws-ecs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
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

  /**
   * The ARN of the AWS Secrets Manager secret containing Docker login credentials.
   * This secret should store a JSON object with the following structure:
   * ```json
   * {
   *   "username": "my-docker-username",
   *   "password": "my-docker-password"
   * }
   * ```
   * If not provided, the construct will skip Docker login during the build process.
   *
   * @example 'arn:aws:secretsmanager:us-east-1:123456789012:secret:DockerLoginSecret'
   */
  readonly dockerLoginSecretArn?: string;
}

/**
 * A CDK construct to build and push Docker images to an ECR repository using CodeBuild and Lambda custom resources.
 */
export class TokenInjectableDockerBuilder extends Construct {
  private readonly ecrRepository: Repository;
  public readonly containerImage: ContainerImage;
  public readonly dockerImageCode: DockerImageCode;

  constructor(scope: Construct, id: string, props: TokenInjectableDockerBuilderProps) {
    super(scope, id);

    const { path: sourcePath, buildArgs, dockerLoginSecretArn } = props;

    // Define a KMS key for ECR encryption
    const encryptionKey = new Key(this, 'EcrEncryptionKey', {
      enableKeyRotation: true,
    });

    // Create an ECR repository with lifecycle rules, encryption, and image scanning enabled
    this.ecrRepository = new Repository(this, 'ECRRepository', {
      lifecycleRules: [
        {
          rulePriority: 1,
          description: 'Remove stale images',
          tagStatus: TagStatus.ANY,
          maxImageAge: Duration.days(1),
        },
      ],
      encryption: RepositoryEncryption.KMS,
      encryptionKey: encryptionKey,
      imageScanOnPush: true,
    });

    // Package the source code as an asset
    const sourceAsset = new Asset(this, 'SourceAsset', {
      path: sourcePath,
    });

    // Transform buildArgs into a string of --build-arg KEY=VALUE
    const buildArgsString = buildArgs
      ? Object.entries(buildArgs)
        .map(([key, value]) => `--build-arg ${key}=${value}`)
        .join(' ')
      : '';

    // Conditional Dockerhub login commands
    const dockerLoginCommands = dockerLoginSecretArn
      ? [
        'echo "Retrieving Docker credentials from Secrets Manager..."',
        `DOCKER_USERNAME=$(aws secretsmanager get-secret-value --secret-id ${dockerLoginSecretArn} --query SecretString --output text | jq -r .username)`,
        `DOCKER_PASSWORD=$(aws secretsmanager get-secret-value --secret-id ${dockerLoginSecretArn} --query SecretString --output text | jq -r .password)`,
        'echo "Logging in to Docker..."',
        'echo $DOCKER_PASSWORD | docker login --username $DOCKER_USERNAME --password-stdin',
      ]
      : ['echo "No Docker credentials provided. Skipping login step."'];

    // Create a CodeBuild project
    const codeBuildProject = new Project(this, 'UICodeBuildProject', {
      source: Source.s3({
        bucket: sourceAsset.bucket,
        path: sourceAsset.s3ObjectKey,
      }),
      environment: {
        buildImage: LinuxBuildImage.STANDARD_7_0,
        privileged: true,
      },
      environmentVariables: {
        ECR_REPO_URI: { value: this.ecrRepository.repositoryUri },
        BUILD_ARGS: { value: buildArgsString },
      },
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              ...dockerLoginCommands,
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

    // Grant permissions to CodeBuild
    this.ecrRepository.grantPullPush(codeBuildProject);

    codeBuildProject.role!.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ['ecr:GetAuthorizationToken', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchCheckLayerAvailability'],
        resources: [this.ecrRepository.repositoryArn],
      }),
    );

    if (dockerLoginSecretArn) {
      codeBuildProject.role!.addToPrincipalPolicy(
        new PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [dockerLoginSecretArn],
        }),
      );
    }

    // Grant CodeBuild access to the KMS key
    encryptionKey.grantEncryptDecrypt(codeBuildProject.role!);

    // Create Lambda functions for onEvent and isComplete handlers
    const onEventHandlerFunction = new Function(this, 'OnEventHandlerFunction', {
      runtime: Runtime.NODEJS_18_X,
      code: Code.fromAsset(path.resolve(__dirname, '../onEvent')),
      handler: 'onEvent.handler',
      timeout: Duration.minutes(15),
    });

    onEventHandlerFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['codebuild:StartBuild'],
        resources: [codeBuildProject.projectArn], // Restrict to specific project
      }),
    );
    const isCompleteHandlerFunction = new Function(this, 'IsCompleteHandlerFunction', {
      runtime: Runtime.NODEJS_18_X,
      code: Code.fromAsset(path.resolve(__dirname, '../isComplete')),
      handler: 'isComplete.handler',
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

    // Grant Lambda functions access to KMS key and ECR
    encryptionKey.grantEncryptDecrypt(onEventHandlerFunction);
    encryptionKey.grantEncryptDecrypt(isCompleteHandlerFunction);
    this.ecrRepository.grantPullPush(onEventHandlerFunction);
    this.ecrRepository.grantPullPush(isCompleteHandlerFunction);

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
