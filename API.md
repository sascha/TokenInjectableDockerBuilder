# API Reference <a name="API Reference" id="api-reference"></a>

## Constructs <a name="Constructs" id="Constructs"></a>

### TokenInjectableDockerBuilder <a name="TokenInjectableDockerBuilder" id="token-injectable-docker-builder.TokenInjectableDockerBuilder"></a>

A CDK construct to build and push Docker images to an ECR repository using CodeBuild and Lambda custom resources.

*Example*

```typescript
const dockerBuilder = new TokenInjectableDockerBuilder(this, 'DockerBuilder', {
  path: './docker',
  buildArgs: {
    TOKEN: 'my-secret-token',
    ENV: 'production'
  },
});

const containerImage = dockerBuilder.getContainerImage();
```


#### Initializers <a name="Initializers" id="token-injectable-docker-builder.TokenInjectableDockerBuilder.Initializer"></a>

```typescript
import { TokenInjectableDockerBuilder } from 'token-injectable-docker-builder'

new TokenInjectableDockerBuilder(scope: Construct, id: string, props: TokenInjectableDockerBuilderProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#token-injectable-docker-builder.TokenInjectableDockerBuilder.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | The parent construct/stack. |
| <code><a href="#token-injectable-docker-builder.TokenInjectableDockerBuilder.Initializer.parameter.id">id</a></code> | <code>string</code> | The unique ID of the construct. |
| <code><a href="#token-injectable-docker-builder.TokenInjectableDockerBuilder.Initializer.parameter.props">props</a></code> | <code><a href="#token-injectable-docker-builder.TokenInjectableDockerBuilderProps">TokenInjectableDockerBuilderProps</a></code> | Configuration properties for the construct. |

---

##### `scope`<sup>Required</sup> <a name="scope" id="token-injectable-docker-builder.TokenInjectableDockerBuilder.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

The parent construct/stack.

---

##### `id`<sup>Required</sup> <a name="id" id="token-injectable-docker-builder.TokenInjectableDockerBuilder.Initializer.parameter.id"></a>

- *Type:* string

The unique ID of the construct.

---

##### `props`<sup>Required</sup> <a name="props" id="token-injectable-docker-builder.TokenInjectableDockerBuilder.Initializer.parameter.props"></a>

- *Type:* <a href="#token-injectable-docker-builder.TokenInjectableDockerBuilderProps">TokenInjectableDockerBuilderProps</a>

Configuration properties for the construct.

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#token-injectable-docker-builder.TokenInjectableDockerBuilder.toString">toString</a></code> | Returns a string representation of this construct. |

---

##### `toString` <a name="toString" id="token-injectable-docker-builder.TokenInjectableDockerBuilder.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#token-injectable-docker-builder.TokenInjectableDockerBuilder.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="token-injectable-docker-builder.TokenInjectableDockerBuilder.isConstruct"></a>

```typescript
import { TokenInjectableDockerBuilder } from 'token-injectable-docker-builder'

TokenInjectableDockerBuilder.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="token-injectable-docker-builder.TokenInjectableDockerBuilder.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#token-injectable-docker-builder.TokenInjectableDockerBuilder.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#token-injectable-docker-builder.TokenInjectableDockerBuilder.property.containerImage">containerImage</a></code> | <code>aws-cdk-lib.aws_ecs.ContainerImage</code> | *No description.* |
| <code><a href="#token-injectable-docker-builder.TokenInjectableDockerBuilder.property.dockerImageCode">dockerImageCode</a></code> | <code>aws-cdk-lib.aws_lambda.DockerImageCode</code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="token-injectable-docker-builder.TokenInjectableDockerBuilder.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `containerImage`<sup>Required</sup> <a name="containerImage" id="token-injectable-docker-builder.TokenInjectableDockerBuilder.property.containerImage"></a>

```typescript
public readonly containerImage: ContainerImage;
```

- *Type:* aws-cdk-lib.aws_ecs.ContainerImage

---

##### `dockerImageCode`<sup>Required</sup> <a name="dockerImageCode" id="token-injectable-docker-builder.TokenInjectableDockerBuilder.property.dockerImageCode"></a>

```typescript
public readonly dockerImageCode: DockerImageCode;
```

- *Type:* aws-cdk-lib.aws_lambda.DockerImageCode

---


## Structs <a name="Structs" id="Structs"></a>

### TokenInjectableDockerBuilderProps <a name="TokenInjectableDockerBuilderProps" id="token-injectable-docker-builder.TokenInjectableDockerBuilderProps"></a>

Properties for the `TokenInjectableDockerBuilder` construct.

#### Initializer <a name="Initializer" id="token-injectable-docker-builder.TokenInjectableDockerBuilderProps.Initializer"></a>

```typescript
import { TokenInjectableDockerBuilderProps } from 'token-injectable-docker-builder'

const tokenInjectableDockerBuilderProps: TokenInjectableDockerBuilderProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#token-injectable-docker-builder.TokenInjectableDockerBuilderProps.property.path">path</a></code> | <code>string</code> | The path to the directory containing the Dockerfile or source code. |
| <code><a href="#token-injectable-docker-builder.TokenInjectableDockerBuilderProps.property.buildArgs">buildArgs</a></code> | <code>{[ key: string ]: string}</code> | Build arguments to pass to the Docker build process. |

---

##### `path`<sup>Required</sup> <a name="path" id="token-injectable-docker-builder.TokenInjectableDockerBuilderProps.property.path"></a>

```typescript
public readonly path: string;
```

- *Type:* string

The path to the directory containing the Dockerfile or source code.

---

##### `buildArgs`<sup>Optional</sup> <a name="buildArgs" id="token-injectable-docker-builder.TokenInjectableDockerBuilderProps.property.buildArgs"></a>

```typescript
public readonly buildArgs: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}

Build arguments to pass to the Docker build process.

These are transformed into `--build-arg` flags.

---

*Example*

```typescript
{
  TOKEN: 'my-secret-token',
  ENV: 'production'
}
```




