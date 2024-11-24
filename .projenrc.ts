import { awscdk } from 'projen';

const project = new awscdk.AwsCdkConstructLibrary({
  author: 'AlexTech314',
  authorAddress: 'alest314@gmail.com',
  autoApproveOptions: {
    allowedUsernames: ['AlexTech314'],
  },
  majorVersion: 1,
  autoDetectBin: true,
  cdkVersion: '2.166.0',
  defaultReleaseBranch: 'main',
  depsUpgradeOptions: {
    workflowOptions: {
      labels: ['auto-approve'],
    },
  },
  jsiiVersion: '~5.5.0',
  name: 'token-injectable-docker-builder',
  projenrcTs: true,
  repositoryUrl: 'https://github.com/AlexTech314/TokenInjectableDockerBuilder.git',
  description: 'The TokenInjectableDockerBuilder is a flexible AWS CDK construct that enables the usage of AWS CDK tokens in the building, pushing, and deployment of Docker images to Amazon Elastic Container Registry (ECR). It leverages AWS CodeBuild and Lambda custom resources.',
  packageName: 'token-injectable-docker-builder',
  keywords: [
    'aws',
    'cdk',
    'aws-cdk',
    'docker',
    'ecr',
    'lambda',
    'custom-resource',
    'docker-build',
    'codebuild',
    'token-injection',
    'docker-image',
    'aws-codebuild',
    'aws-ecr',
    'docker-builder',
    'cdk-construct',
    'lambda-custom-resource',
    'container-image',
    'aws-lambda',
    'aws-cdk-lib',
    'cloud-development-kit',
    'ci-cd',
    'aws-ci-cd',
    'infrastructure-as-code',
    'awscdk',
  ],
  license: 'MIT',
  publishToPypi: {
    distName: 'token-injectable-docker-builder',
    module: 'token_injectable_docker_builder',
  },
});

project.gitignore.exclude('cdk.out', 'cdk.context.json', 'yarn-error.log', 'coverage');
project.npmignore!.exclude('cdk.out', 'cdk.context.json', 'yarn-error.log', 'coverage', 'integ');

project.gitignore.include('src/**');
project.npmignore!.include('src/**');

project.synth();
