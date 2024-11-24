import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { TokenInjectableDockerBuilder } from '../lib/index';

test('DockerImageAsset creates required resources', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack');

  new TokenInjectableDockerBuilder(stack, 'TestDockerImageAsset', {
    path: './src/onEventHandler', // Path to Docker context
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
