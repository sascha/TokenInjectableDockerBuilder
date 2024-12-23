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

export interface TokenInjectableDockerBuilderProps {
  readonly path: string;
  readonly buildArgs?: { [key: string]: string };
  readonly dockerLoginSecretArn?: string;
  readonly vpc?: IVpc;
  readonly securityGroups?: ISecurityGroup[];
  readonly subnetSelection?: SubnetSelection;
  readonly installCommands?: string[];
  readonly preBuildCommands?: string[];
}

export class TokenInjectableDockerBuilder extends Construct {
  private readonly ecrRepository: Repository;
  public readonly containerImage: ContainerImage;
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

    // Generate a unique tag for this build (any method: date, random, etc.)
    const imageTag = crypto.randomUUID();

    // Define a KMS key for ECR encryption
    const encryptionKey = new Key(this, 'EcrEncryptionKey', {
      enableKeyRotation: true,
    });

    // Create an ECR repository
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

    // Package the source code as an S3 asset
    const sourceAsset = new Asset(this, 'SourceAsset', {
      path: sourcePath,
    });

    // Transform buildArgs into --build-arg KEY=VALUE
    const buildArgsString = buildArgs
      ? Object.entries(buildArgs)
          .map(([key, value]) => `--build-arg ${key}=${value}`)
          .join(' ')
      : '';

    // Docker login commands (if a Secrets Manager ARN was provided)
    const dockerLoginCommands = dockerLoginSecretArn
      ? [
          'echo "Retrieving Docker credentials from Secrets Manager..."',
          `DOCKER_USERNAME=$(aws secretsmanager get-secret-value --secret-id ${dockerLoginSecretArn} --query SecretString --output text | jq -r .username)`,
          `DOCKER_PASSWORD=$(aws secretsmanager get-secret-value --secret-id ${dockerLoginSecretArn} --query SecretString --output text | jq -r .password)`,
          'echo "Logging in to Docker..."',
          'echo $DOCKER_PASSWORD | docker login --username $DOCKER_USERNAME --password-stdin',
        ]
      : ['echo "No Docker credentials provided. Skipping Docker Hub login."'];

    // Create the CodeBuild project that builds/pushes the Docker image with a unique tag
    const codeBuildProject = new Project(this, 'UICodeBuildProject', {
      source: Source.s3({
        bucket: sourceAsset.bucket,
        path: sourceAsset.s3ObjectKey,
      }),
      environment: {
        buildImage: LinuxBuildImage.STANDARD_7_0,
        privileged: true, // needed for Docker builds
      },
      environmentVariables: {
        ECR_REPO_URI: { value: this.ecrRepository.repositoryUri },
        IMAGE_TAG: { value: imageTag },
        BUILD_ARGS: { value: buildArgsString },
        ...(buildArgs &&
          Object.fromEntries(
            Object.entries(buildArgs).map(([k, v]) => [k, { value: v }])
          )),
      },
      vpc,
      securityGroups,
      subnetSelection,
      buildSpec: BuildSpec.fromObject({
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
              'echo "Building the Docker image with tag $IMAGE_TAG..."',
              'docker build $BUILD_ARGS -t $ECR_REPO_URI:$IMAGE_TAG $CODEBUILD_SRC_DIR',
            ],
          },
          post_build: {
            commands: [
              'echo "Pushing the Docker image with tag $IMAGE_TAG..."',
              'docker push $ECR_REPO_URI:$IMAGE_TAG',
            ],
          },
        },
      }),
    });

    // Grant CodeBuild permissions
    this.ecrRepository.grantPullPush(codeBuildProject);
    codeBuildProject.role?.addToPrincipalPolicy(
      new PolicyStatement({
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchCheckLayerAvailability',
        ],
        resources: [this.ecrRepository.repositoryArn],
      })
    );
    if (dockerLoginSecretArn) {
      codeBuildProject.role?.addToPrincipalPolicy(
        new PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [dockerLoginSecretArn],
        })
      );
    }
    encryptionKey.grantEncryptDecrypt(codeBuildProject.role!);

    // Create the Lambda functions for the custom resource handlers
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
      })
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
      })
    );

    // Grant Lambdas access to the key & ECR
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

    // Trigger the build on each deploy by changing the 'Trigger' property
    const buildTriggerResource = new CustomResource(this, 'BuildTriggerResource', {
      serviceToken: provider.serviceToken,
      properties: {
        ProjectName: codeBuildProject.projectName,
        Trigger: crypto.randomUUID(), // ensures CF sees a change each time
      },
    });
    buildTriggerResource.node.addDependency(codeBuildProject);

    // Finally, define the container images that reference the *exact* tag
    this.containerImage = ContainerImage.fromEcrRepository(this.ecrRepository, imageTag);
    this.dockerImageCode = DockerImageCode.fromEcr(this.ecrRepository, {
      tagOrDigest: imageTag,
    });
  }
}
