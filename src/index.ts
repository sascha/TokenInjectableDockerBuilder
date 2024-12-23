import * as crypto from 'crypto';
import * as path from 'path';
import { CustomResource, Duration } from 'aws-cdk-lib';
import { Project, Source, LinuxBuildImage, BuildSpec } from 'aws-cdk-lib/aws-codebuild';
import { IVpc, ISecurityGroup, SubnetSelection } from 'aws-cdk-lib/aws-ec2';
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
   * If not provided (or not needed), the construct will skip Docker Hub login.
   * NOTE: The secret must be in the same region as the stack.
   *
   * @example 'arn:aws:secretsmanager:us-east-1:123456789012:secret:DockerLoginSecret'
   */
  readonly dockerLoginSecretArn?: string;

  /**
   * The VPC in which the CodeBuild project will be deployed.
   * If provided, the CodeBuild project will be launched within the specified VPC.
   * @default No VPC is attached, and the CodeBuild project will use public internet.
   */
  readonly vpc?: IVpc;

  /**
   * The security groups to attach to the CodeBuild project.
   * These should define the network access rules for the CodeBuild project.
   * @default No security groups are attached.
   */
  readonly securityGroups?: ISecurityGroup[];

  /**
   * The subnet selection to specify which subnets to use within the VPC.
   * Allows the user to select private, public, or isolated subnets.
   * @default All subnets in the VPC are used.
   */
  readonly subnetSelection?: SubnetSelection;

  /**
   * Custom commands to run during the install phase.
   *
   * **Example Usage:**
   * ```typescript
   * new TokenInjectableDockerBuilder(this, 'MyDockerBuilder', {
   *   path: path.resolve(__dirname, '../app'),
   *   installCommands: [
   *     'echo "Updating package lists..."',
   *     'apt-get update -y',
   *     'echo "Installing required packages..."',
   *     'apt-get install -y curl dnsutils',
   *   ],
   *   // ... other properties ...
   * });
   * ```
   * @default - No additional install commands.
   */
  readonly installCommands?: string[];

  /**
   * Custom commands to run during the pre_build phase.
   *
   * **Example Usage:**
   * ```typescript
   * new TokenInjectableDockerBuilder(this, 'MyDockerBuilder', {
   *   path: path.resolve(__dirname, '../app'),
   *   preBuildCommands: [
   *     'echo "Fetching configuration from private API..."',
   *     'curl -o config.json https://api.example.com/config',
   *   ],
   *   // ... other properties ...
   * });
   * ```
   * @default - No additional pre-build commands.
   */
  readonly preBuildCommands?: string[];
}

/**
 * A CDK construct to build and push Docker images to an ECR repository using CodeBuild and Lambda custom resources,
 * retrieving the final image digest (SHA) and using that exact digest for ECS or Lambda references.
 */
export class TokenInjectableDockerBuilder extends Construct {
  private readonly ecrRepository: Repository;

  /**
   * An ECS-compatible ContainerImage referencing the *exact* SHA digest of the built Docker image.
   */
  public readonly containerImage: ContainerImage;

  /**
   * A Lambda-compatible DockerImageCode referencing the *exact* SHA digest of the built Docker image.
   */
  public readonly dockerImageCode: DockerImageCode;

  constructor(scope: Construct, id: string, props: TokenInjectableDockerBuilderProps) {
    super(scope, id);

    const {
      path: sourcePath,
      buildArgs,
      dockerLoginSecretArn,
      vpc,
      securityGroups,
      subnetSelection,
      installCommands,
      preBuildCommands,
    } = props;

    // Generate a unique tag for this build.
    const imageTag = crypto.randomUUID();

    // KMS key for ECR encryption
    const encryptionKey = new Key(this, 'EcrEncryptionKey', {
      enableKeyRotation: true,
    });

    // ECR repository
    this.ecrRepository = new Repository(this, 'ECRRepository', {
      lifecycleRules: [
        {
          rulePriority: 1,
          description: 'Remove untagged images after 1 day',
          tagStatus: TagStatus.UNTAGGED,
          maxImageAge: Duration.days(1),
        },
      ],
      encryption: RepositoryEncryption.KMS,
      encryptionKey,
      imageScanOnPush: true,
    });

    // Package source code
    const sourceAsset = new Asset(this, 'SourceAsset', {
      path: sourcePath,
    });

    // Build args
    const buildArgsString = buildArgs
      ? Object.entries(buildArgs)
        .map(([k, v]) => `--build-arg ${k}=${v}`)
        .join(' ')
      : '';

    // Docker Hub login commands
    const dockerLoginCommands = dockerLoginSecretArn
      ? [
        'echo "Retrieving Docker credentials from Secrets Manager..."',
        'apt-get update -y && apt-get install -y jq',
        `DOCKER_USERNAME=$(aws secretsmanager get-secret-value --secret-id ${dockerLoginSecretArn} --query SecretString --output text | jq -r .username)`,
        `DOCKER_PASSWORD=$(aws secretsmanager get-secret-value --secret-id ${dockerLoginSecretArn} --query SecretString --output text | jq -r .password)`,
        'echo "Logging in to Docker Hub..."',
        // Use non-stdin login to avoid TTY error:
        'echo $DOCKER_PASSWORD | docker login --username $DOCKER_USERNAME --password-stdin',
      ]
      : ['echo "No Docker credentials provided. Skipping Docker Hub login."'];

    // BuildSpec
    const buildSpecObj = {
      version: '0.2',
      phases: {
        install: {
          commands: [
            'echo "Beginning install phase..."',
            ...(installCommands || []),
          ],
        },
        pre_build: {
          commands: [
            ...(preBuildCommands || []),
            ...dockerLoginCommands,
            'echo "Retrieving AWS Account ID..."',
            'export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)',
            'echo "Logging in to Amazon ECR..."',
            'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
          ],
        },
        build: {
          commands: [
            'echo "Build phase: Building the Docker image..."',
            `docker build ${buildArgsString} -t $ECR_REPO_URI:${imageTag} $CODEBUILD_SRC_DIR`,
          ],
        },
        post_build: {
          commands: [
            `echo "Post-build phase: Pushing the Docker image with tag ${imageTag}..."`,
            `docker push $ECR_REPO_URI:${imageTag}`,
            `export IMAGE_DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' $ECR_REPO_URI:${imageTag})`,
            'echo "Image digest: $IMAGE_DIGEST"',
            'echo "{ \\"ImageDigest\\": \\"$IMAGE_DIGEST\\" }" > imageDetail.json',
          ],
        },
      },
      artifacts: {
        files: ['imageDetail.json'],
        name: 'imageDetail',
      },
    };

    // CodeBuild project
    const codeBuildProject = new Project(this, 'CodeBuildProject', {
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
      },
      vpc,
      securityGroups,
      subnetSelection,
      buildSpec: BuildSpec.fromObject(buildSpecObj),
    });

    // Permissions
    this.ecrRepository.grantPullPush(codeBuildProject);
    codeBuildProject.role?.addToPrincipalPolicy(
      new PolicyStatement({
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchCheckLayerAvailability',
        ],
        resources: [this.ecrRepository.repositoryArn],
      }),
    );

    if (dockerLoginSecretArn) {
      codeBuildProject.role?.addToPrincipalPolicy(
        new PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [dockerLoginSecretArn],
        }),
      );
    }

    encryptionKey.grantEncryptDecrypt(codeBuildProject.role!);

    // onEvent handler
    const onEventHandlerFunction = new Function(this, 'OnEventHandlerFunction', {
      runtime: Runtime.NODEJS_18_X,
      code: Code.fromAsset(path.resolve(__dirname, '../onEvent')),
      handler: 'onEvent.handler',
      timeout: Duration.minutes(15),
    });

    onEventHandlerFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['codebuild:StartBuild'],
        resources: [codeBuildProject.projectArn],
      }),
    );

    // isComplete handler
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
          's3:GetObject',
          's3:GetBucketLocation',
        ],
        resources: ['*'],
      }),
    );

    encryptionKey.grantEncryptDecrypt(onEventHandlerFunction);
    encryptionKey.grantEncryptDecrypt(isCompleteHandlerFunction);
    this.ecrRepository.grantPullPush(onEventHandlerFunction);
    this.ecrRepository.grantPullPush(isCompleteHandlerFunction);

    // Provider
    const provider = new Provider(this, 'CustomResourceProvider', {
      onEventHandler: onEventHandlerFunction,
      isCompleteHandler: isCompleteHandlerFunction,
      queryInterval: Duration.seconds(30),
    });

    // Custom resource
    const buildTriggerResource = new CustomResource(this, 'BuildTriggerResource', {
      serviceToken: provider.serviceToken,
      properties: {
        ProjectName: codeBuildProject.projectName,
        ImageTag: imageTag,
        Trigger: crypto.randomUUID(),
      },
    });

    buildTriggerResource.node.addDependency(codeBuildProject);

    // Grab the SHA from the custom resource's response (set in isComplete handler)
    const imageDigest = buildTriggerResource.getAttString('ImageDigest');

    // ECS-compatible from ECR by digest
    this.containerImage = ContainerImage.fromEcrRepository(this.ecrRepository, imageDigest);

    // Lambda-compatible from ECR by digest
    this.dockerImageCode = DockerImageCode.fromEcr(this.ecrRepository, {
      tagOrDigest: imageDigest,
    });
  }
}
