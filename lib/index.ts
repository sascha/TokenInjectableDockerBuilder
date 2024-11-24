import { Duration, CustomResource, Stack } from 'aws-cdk-lib';
import { Project, Source, LinuxBuildImage, BuildSpec } from 'aws-cdk-lib/aws-codebuild';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { DockerImageFunction, DockerImageCode } from 'aws-cdk-lib/aws-lambda';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import * as crypto from 'crypto';

export interface DockerImageAssetProps {
  path: string;
  buildArgs?: { [key: string]: string };
}

export class DockerImageAsset extends Construct {

  constructor(scope: Construct, id: string, props: DockerImageAssetProps) {
    super(scope, id);

    const { path, buildArgs } = props

    // Create an ECR repository
    const ecrRepo = new Repository(this, 'ECRRepository');

    // Package the source code as an asset
    const sourceAsset = new Asset(this, 'SourceAsset', {
      path: path
    });

    // Transform buildArgs into a string of --build-arg KEY=VALUE
    const buildArgsString = buildArgs 
      ? Object.entries(buildArgs)
          .map(([key, value]) => `--build-arg ${key}=${value}`)
          .join(' ')
      : '';

    // Pass the buildArgsString as an environment variable
    const environmentVariables: { [name: string]: { value: string } } = {
      ECR_REPO_URI: { value: ecrRepo.repositoryUri },
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
        privileged: true,
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
    ecrRepo.grantPullPush(codeBuildProject);

    codeBuildProject.role!.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      })
    );

    // Grant permissions to CodeBuild for CloudWatch Logs
    codeBuildProject.role!.addToPrincipalPolicy(
      new PolicyStatement({
        actions: [
          'logs:PutLogEvents',
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
        ],
        resources: [
          `arn:aws:logs:${Stack.of(this).region}:${Stack.of(this).account}:*`,
        ],
      })
    );

    const onEventHandlerFunction = new DockerImageFunction(this, 'BuildTriggerLambdaFunction', {
      code: DockerImageCode.fromImageAsset('./src/onEventHandler'),
      timeout: Duration.minutes(15),
      environment: {
        CODEBUILD_PROJECT_NAME: codeBuildProject.projectName,
      },
    });

    onEventHandlerFunction.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'codebuild:StartBuild',
        ],
        resources: [codeBuildProject.projectArn], // Restrict to specific project
      })
    );

    const isCompleteHandlerFunction = new DockerImageFunction(this, 'IsCompleteHandlerFunction', {
      code: DockerImageCode.fromImageAsset('./src/isCompleteHandler'),
      timeout: Duration.minutes(15),
    });

    isCompleteHandlerFunction.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'codebuild:BatchGetBuilds',
          'logs:GetLogEvents',
          'logs:DescribeLogStreams',
          'logs:DescribeLogGroups',
        ],
        resources: ['*'],
      })
    );

    const provider = new Provider(this, 'CustomResourceProvider', {
      onEventHandler: onEventHandlerFunction,
      isCompleteHandler: isCompleteHandlerFunction,
      queryInterval: Duration.minutes(1)
    });

    const buildTriggerResource = new CustomResource(this, 'BuildTriggerResource', {
      serviceToken: provider.serviceToken,
      properties: {
        ProjectName: codeBuildProject.projectName,
        Trigger: crypto.randomUUID(),
      },
    });

    buildTriggerResource.node.addDependency(codeBuildProject)
  }
}
