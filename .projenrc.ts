import { awscdk } from 'projen';
import { NodePackageManager } from 'projen/lib/javascript';

const project = new awscdk.AwsCdkConstructLibrary({
  author: 'AlexTech314',
  authorAddress: 'alest314@gmail.com',
  majorVersion: 1,
  cdkVersion: '2.166.0',
  defaultReleaseBranch: 'main',
  packageManager: NodePackageManager.NPM,
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

const common_exclude = ['cdk.out', 'cdk.context.json', 'coverage'];

project.gitignore.exclude(...common_exclude);
project.npmignore!.exclude(...common_exclude);

project.npmignore!.include('isComplete/*.js', 'onEvent/*.js');

project.synth();
