import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { RestApi, EndpointType, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';
import { Vpc, SubnetType, SecurityGroup, Peer, Port, InterfaceVpcEndpointAwsService } from 'aws-cdk-lib/aws-ec2';
import { PolicyDocument, PolicyStatement, Effect, AnyPrincipal } from 'aws-cdk-lib/aws-iam';
import { Runtime, Code, Function } from 'aws-cdk-lib/aws-lambda';
import { TokenInjectableDockerBuilder } from './index';

const app = new cdk.App();
const stack = new cdk.Stack(app, 'IntegTestingStack');

// The TokenInjectableDockerBuilder construct can be used to build Docker images in public internet and docker login scenario.
new TokenInjectableDockerBuilder(stack, 'PublicBuilder', {
  path: path.resolve(__dirname, '../test-docker/public-internet'),
  buildArgs: {
    SAMPLE_ARG_1: 'SAMPLE_VALUE_1',
    SAMPLE_ARG_2: 'SAMPLE_VALUE_2',
    SAMPLE_ARG_3: 'SAMPLE_VALUE_3',
    SAMPLE_ARG_4: 'SAMPLE_VALUE_4',
    SAMPLE_ARG_5: 'SAMPLE_VALUE_5',
    SAMPLE_ARG_6: 'SAMPLE_VALUE_6',
  },
  dockerLoginSecretArn: 'arn:aws:secretsmanager:us-east-1:281318412783:secret:DockerLogin-jR8U8w',
});

// The TokenInjectableDockerBuilder construct can be used to build Docker images in public internet without docker login scenario.
new TokenInjectableDockerBuilder(stack, 'PublicBuilderNoDockerLogin', {
  path: path.resolve(__dirname, '../test-docker/public-internet'),
  buildArgs: {
    SAMPLE_ARG_1: 'SAMPLE_VALUE_1',
    SAMPLE_ARG_2: 'SAMPLE_VALUE_2',
    SAMPLE_ARG_3: 'SAMPLE_VALUE_3',
    SAMPLE_ARG_4: 'SAMPLE_VALUE_4',
    SAMPLE_ARG_5: 'SAMPLE_VALUE_5',
    SAMPLE_ARG_6: 'SAMPLE_VALUE_6',
  },
});

// The TokenInjectableDockerBuilder construct can be used to build Docker images in private subnet without docker login scenario.
// Create a VPC with private and public subnets
const vpc = new Vpc(stack, 'TestVPC', {
  maxAzs: 2,
  subnetConfiguration: [
    {
      subnetType: SubnetType.PUBLIC,
      name: 'PublicSubnet',
    },
    {
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      name: 'PrivateSubnet',
    },
  ],
});

// Create a security group for the private API Gateway and CodeBuild
const apiSecurityGroup = new SecurityGroup(stack, 'ApiSecurityGroup', {
  vpc,
  allowAllOutbound: true,
});

// Allow inbound HTTPS traffic from the VPC (for the VPC endpoint)
apiSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(443), 'Allow HTTPS traffic');

// Create a VPC endpoint for API Gateway
const apiGatewayEndpoint = vpc.addInterfaceEndpoint('ApiGatewayVpcEndpoint', {
  service: InterfaceVpcEndpointAwsService.APIGATEWAY,
  subnets: {
    subnetType: SubnetType.PRIVATE_WITH_EGRESS, // Use private subnets
  },
  securityGroups: [apiSecurityGroup], // Attach the security group
  privateDnsEnabled: true, // Enable private DNS
});

// Lambda function to provide test configurations
const testConfigLambda = new Function(stack, 'TestConfigLambda', {
  runtime: Runtime.NODEJS_18_X,
  handler: 'index.handler',
  code: Code.fromInline(`
    exports.handler = async (event) => {
      return {
        statusCode: 200,
        body: JSON.stringify({
          SAMPLE_CONFIG: "This is a test configuration",
        }),
      };
    };
  `),
  vpc,
  securityGroups: [apiSecurityGroup],
});

// Update the API Gateway resource policy
const privateApi = new RestApi(stack, 'PrivateApi', {
  endpointTypes: [EndpointType.PRIVATE],
  defaultIntegration: new LambdaIntegration(testConfigLambda),
  policy: new PolicyDocument({
    statements: [
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new AnyPrincipal()],
        actions: ['execute-api:Invoke'],
        resources: ['execute-api:/*'],
        conditions: {
          StringEquals: {
            'aws:SourceVpce': apiGatewayEndpoint.vpcEndpointId,
          },
        },
      }),
    ],
  }),
});

// Add a resource and method to the private API Gateway
const testConfigResource = privateApi.root.addResource('test-config');
testConfigResource.addMethod('GET');

// TokenInjectableDockerBuilder: Fetch configuration from the private API
new TokenInjectableDockerBuilder(stack, 'PrivateBuilder', {
  path: path.resolve(__dirname, '../test-docker/private-subnet'),
  buildArgs: {
    API_URL: privateApi.urlForPath('/test-config'),
  },
  vpc,
  securityGroups: [apiSecurityGroup],
  subnetSelection: {
    subnetType: SubnetType.PRIVATE_WITH_EGRESS,
  },
  installCommands: [
    'echo "Updating package lists..."',
    'apt-get update -y',
    'echo "Installing required packages..."',
    'apt-get install -y curl dnsutils',
  ],
  preBuildCommands: [
    'echo "Fetching configuration file..."',
    'curl -o config.json $API_URL',
  ],
});
