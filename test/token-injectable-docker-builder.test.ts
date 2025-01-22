import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { Vpc, SecurityGroup, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { TokenInjectableDockerBuilder } from '../src';

describe('TokenInjectableDockerBuilder', () => {
  test('creates required resources with default properties', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');

    new TokenInjectableDockerBuilder(stack, 'TestDockerImageAsset', {
      path: path.resolve(__dirname, './blank'), // Path to Docker context
      buildArgs: { ENV: 'test' },
    });

    const template = Template.fromStack(stack);

    // Verify that an ECR repository is created
    template.resourceCountIs('AWS::ECR::Repository', 1);

    // Verify that a CodeBuild project is created with expected properties
    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Environment: {
        ComputeType: 'BUILD_GENERAL1_SMALL',
        PrivilegedMode: true,
        Image: 'aws/codebuild/standard:7.0',
      },
      Source: {
        Type: 'S3',
      },
    });

    // Verify the Custom Resource is created with the expected service token
    template.resourceCountIs('AWS::CloudFormation::CustomResource', 1);
  });

  test('creates resources with dockerLoginSecretArn', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');

    const secretArn = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:DockerLoginSecret';

    new TokenInjectableDockerBuilder(stack, 'TestDockerImageAsset', {
      path: path.resolve(__dirname, './blank'),
      dockerLoginSecretArn: secretArn,
    });

    const template = Template.fromStack(stack);

    // Verify that the CodeBuild project has the secret ARN in its policies
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'secretsmanager:GetSecretValue',
            Resource: secretArn,
          }),
        ]),
      },
    });
  });

  test('creates resources with VPC configuration', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');

    const vpc = new Vpc(stack, 'TestVPC');
    const securityGroup = new SecurityGroup(stack, 'TestSG', { vpc });

    new TokenInjectableDockerBuilder(stack, 'TestDockerImageAsset', {
      path: path.resolve(__dirname, './blank'),
      vpc,
      securityGroups: [securityGroup],
      subnetSelection: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
    });

    const template = Template.fromStack(stack);

    // Verify that the CodeBuild project has VPC configuration
    template.hasResourceProperties('AWS::CodeBuild::Project', {
      VpcConfig: {
        SecurityGroupIds: [
          {
            'Fn::GetAtt': [
              Match.stringLikeRegexp('TestSG.*'),
              'GroupId',
            ],
          },
        ],
        Subnets: Match.anyValue(),
        VpcId: {
          Ref: Match.stringLikeRegexp('TestVPC.*'),
        },
      },
    });
  });

  test('includes custom install and pre_build commands', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');

    const installCommands = [
      'apt-get update -y',
      'apt-get install -y curl',
    ];

    const preBuildCommands = [
      'curl -o config.json https://api.example.com/config',
    ];

    new TokenInjectableDockerBuilder(stack, 'TestDockerImageAsset', {
      path: path.resolve(__dirname, './blank'),
      installCommands,
      preBuildCommands,
    });

    const template = Template.fromStack(stack);

    // Verify that the CodeBuild project's BuildSpec includes the custom commands
    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Source: {
        BuildSpec: Match.serializedJson(Match.objectLike({
          phases: {
            install: {
              commands: Match.arrayWith(installCommands),
            },
            pre_build: {
              commands: Match.arrayWith(preBuildCommands),
            },
          },
        })),
      },
    });
  });

  test('construct provides containerImage and dockerImageCode', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');

    const builder = new TokenInjectableDockerBuilder(stack, 'TestDockerImageAsset', {
      path: path.resolve(__dirname, './blank'),
    });

    expect(builder.containerImage).toBeDefined();
    expect(builder.dockerImageCode).toBeDefined();
  });
});
