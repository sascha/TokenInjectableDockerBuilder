import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { DockerImageFunction } from 'aws-cdk-lib/aws-lambda';
import { TokenInjectableDockerBuilder } from './index';

const app = new cdk.App();
const stack = new cdk.Stack(app, 'IntegTestingStack');

// -------------------------------------------------------------------------------------
// 1) PublicBuilder with Docker Hub Login
// -------------------------------------------------------------------------------------
const publicBuilder = new TokenInjectableDockerBuilder(stack, 'PublicBuilder', {
  path: path.resolve(__dirname, '../test-docker/public-internet'),
  buildArgs: {
    SAMPLE_ARG_1: 'SAMPLE_VALUE_1',
    SAMPLE_ARG_2: 'SAMPLE_VALUE_2',
    SAMPLE_ARG_3: 'SAMPLE_VALUE_3',
    SAMPLE_ARG_4: 'SAMPLE_VALUE_4',
    SAMPLE_ARG_5: 'SAMPLE_VALUE_5',
    SAMPLE_ARG_6: 'SAMPLE_VALUE_6',
  },
  dockerLoginSecretArn: 'arn:aws:secretsmanager:us-west-1:281318412783:secret:DockerLogin-k04Usw',
});

// Create a test Lambda that uses the publicBuilder's Docker image
const publicBuilderTestLambda = new DockerImageFunction(stack, 'PublicBuilderTestLambda', {
  code: publicBuilder.dockerImageCode,
  // Minimal handler example. The Docker container can have any logic you want.
  environment: {
    TEST_ENV_VAR: 'HelloFromPublicBuilder',
  },
});

publicBuilderTestLambda.node.addDependency(publicBuilder);

// -------------------------------------------------------------------------------------
// 2) PublicBuilderNoDockerLogin
// -------------------------------------------------------------------------------------
const publicBuilderNoLogin = new TokenInjectableDockerBuilder(stack, 'PublicBuilderNoDockerLogin', {
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

const publicNoLoginTestLambda = new DockerImageFunction(stack, 'PublicNoLoginTestLambda', {
  code: publicBuilderNoLogin.dockerImageCode,
  environment: {
    TEST_ENV_VAR: 'HelloFromNoLoginBuilder',
  },
});

publicNoLoginTestLambda.node.addDependency(publicBuilderNoLogin);

// // -------------------------------------------------------------------------------------
// // 3) Create a simple VPC + Private API to test the "private" scenario
// // -------------------------------------------------------------------------------------
// const vpc = new Vpc(stack, 'TestVPC', {
//   maxAzs: 2,
//   subnetConfiguration: [
//     { subnetType: SubnetType.PUBLIC, name: 'PublicSubnet' },
//     { subnetType: SubnetType.PRIVATE_WITH_EGRESS, name: 'PrivateSubnet' },
//   ],
// });

// const apiSecurityGroup = new SecurityGroup(stack, 'ApiSecurityGroup', {
//   vpc,
//   allowAllOutbound: true,
// });
// apiSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(443), 'Allow HTTPS traffic');

// // Private Endpoint for API Gateway
// const apiGatewayEndpoint = vpc.addInterfaceEndpoint('ApiGatewayVpcEndpoint', {
//   service: InterfaceVpcEndpointAwsService.APIGATEWAY,
//   subnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
//   securityGroups: [apiSecurityGroup],
//   privateDnsEnabled: true,
// });

// // A simple Lambda that returns a JSON object
// const testConfigLambda = new Function(stack, 'TestConfigLambda', {
//   runtime: Runtime.NODEJS_18_X,
//   handler: 'index.handler',
//   code: Code.fromInline(`
//     exports.handler = async () => ({
//       statusCode: 200,
//       body: JSON.stringify({ SAMPLE_CONFIG: "This is a test configuration" }),
//     });
//   `),
//   vpc,
//   securityGroups: [apiSecurityGroup],
// });

// // A Private API with a resource "/test-config" -> testConfigLambda
// const privateApi = new RestApi(stack, 'PrivateApi', {
//   endpointTypes: [EndpointType.PRIVATE],
//   defaultIntegration: new LambdaIntegration(testConfigLambda),
//   policy: new PolicyDocument({
//     statements: [
//       new PolicyStatement({
//         effect: Effect.ALLOW,
//         principals: [new AnyPrincipal()],
//         actions: ['execute-api:Invoke'],
//         resources: ['execute-api:/*'],
//         conditions: {
//           StringEquals: { 'aws:SourceVpce': apiGatewayEndpoint.vpcEndpointId },
//         },
//       }),
//     ],
//   }),
// });

// Create a resource + GET method for test-config
// const testConfigResource = privateApi.root.addResource('test-config');
// testConfigResource.addMethod('GET');

// -------------------------------------------------------------------------------------
// 4) (Optional) Use a private builder that fetches the /test-config data
//    Uncomment to see a private-subnet CodeBuild scenario that curls from the private API
// -------------------------------------------------------------------------------------
// const privateBuilder = new TokenInjectableDockerBuilder(stack, 'PrivateBuilder', {
//   path: path.resolve(__dirname, '../test-docker/private-subnet'),
//   buildArgs: {
//     API_URL: privateApi.urlForPath('/test-config'),
//   },
//   vpc,
//   securityGroups: [apiSecurityGroup],
//   subnetSelection: {
//     subnetType: SubnetType.PRIVATE_WITH_EGRESS,
//   },
//   installCommands: [
//     'echo "Updating package lists..."',
//     'apt-get update -y',
//     'echo "Installing required packages..."',
//     'apt-get install -y curl dnsutils',
//   ],
//   preBuildCommands: [
//     'echo "Fetching configuration file..."',
//     'curl -o config.json $API_URL',
//   ],
// });
// privateBuilder.node.addDependency(privateApi);
// privateBuilder.node.addDependency(testConfigResource);

// A test Lambda referencing the PrivateBuilder's Docker image, if uncommented above
// const privateBuilderTestLambda = new DockerImageFunction(stack, 'PrivateBuilderTestLambda', {
//   code: privateBuilder.dockerImageCode,
//   environment: {
//     TEST_ENV_VAR: 'HelloFromPrivateBuilder',
//   },
// });

// // Optionally add a resource to the PrivateApi for that private builder's Lambda
// // const privateBuilderResource = privateApi.root.addResource('private-builder-test');
// // privateBuilderResource.addMethod('GET', new LambdaIntegration(privateBuilderTestLambda));

// // -------------------------------------------------------------------------------------
// // 5) Expose Lambdas for "publicBuilder" & "publicBuilderNoLogin" as new resources
// //    on the PrivateApi (for demonstration). In reality, you might use a public API or direct invocation.
// // -------------------------------------------------------------------------------------
// const publicBuilderResource = privateApi.root.addResource('public-builder-test');
// publicBuilderResource.addMethod('GET', new LambdaIntegration(publicBuilderTestLambda));

// const publicNoLoginResource = privateApi.root.addResource('public-builder-no-login-test');
// publicNoLoginResource.addMethod('GET', new LambdaIntegration(publicNoLoginTestLambda));
