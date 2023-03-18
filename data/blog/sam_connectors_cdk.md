---
publishDate: "Mar 08 2023"
title: "AWS CDK & AWS SAM: Better together for least privilege?"
description: "Can we bring Sam Connectors and Sam Policy Templates into the CDK?"
image: "https://ermetic.com/wp-content/uploads/2020/08/cloude-header.jpg"
imageCreditUrl: https://ermetic.com
tags: [aws, cdk, sam, security]
---

Creating permissions that only give the minimum amount of permissions needed for the job can be a tedious task.

Depending on the service the documentation itself points out that Administrator permissions are needed. That's not very good. Some services do have aws managed policies, which can serve as a starting point, but more often than not the engineer has to start from scratch.

Interestingly, AWS Sam has recently come out with a couple of related announcements:
- 10th of Oct 2022: The release of SAM Connectors ([AWS What's New?](https://aws.amazon.com/about-aws/whats-new/2022/10/aws-sam-serverless-connectors/) announcement). A new custom resource that wants to `to simplify granting the appropriate level of access to the resources in their application’s infrastructure.`
- Feb 9th, 2023: Sam Connectors can now also be defined on the resource itself, not only the lambda function ([AWS What's New?](https://aws.amazon.com/about-aws/whats-new/2023/02/aws-sam-connectors-resource-parameter/) announcement)

So as we're using the CDK in our company, the question for this blog post is: Using the CDK, can we leverage sam connectors? And  what even are Sam Connectors?

AWS themselves have already said that [SAM and the CDK are better together](https://aws.amazon.com/blogs/compute/better-together-aws-sam-and-aws-cdk/), as SAM can run cdk resources locally:
```bash
cdk synth --no-staging
sam local invoke MyFunction --no-event -t ./cdk.out/CdkSamExampleStack.template.json
```

But can it also help with least privilege? 👀

We will first have a look at the sam connectors by using them as intended in sam itself, and then we'll attempt to port that into CDK.

Looking at the [sam permissions](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-permissions.html) guide, sam actually has another handy approach for permissions: [community templates](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-policy-templates.html). So we will also have a look at that further down in the blog.

But let's first have a look at the Sam Connectors.

## What are Sam Connectors?

Let's look at this by example. Following the usual shebang of installing sam, cloning a hello world app (sam helps here) and opening up that old free tier aws account again, we can finally start.

Our app will do a simple thing, it will create a lambda function which can read and write to a s3 bucket. The interesting part can be found from line 4 to 11:

```yaml
Resources:
  HelloWorldFunction:
    Type: AWS::Serverless::Function
    Connectors:
      MyConn:
        Properties:
          Destination:
            Id: S3Bucket
          Permissions:
            - Write
            - Read
    Properties:
      CodeUri: hello-world/
      Handler: app.lambdaHandler
      Runtime: nodejs16.x
      Architectures:
        - x86_64
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: "es2020"
        EntryPoints:
          - app.ts
  S3Bucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: "wopwopw123"
```

Executing first `sam build` and then `sam deploy --guided` a bunch of times (why isn't that the same command btw), and then spamming enter to answer the deployment guide, we have ourselves a deployed stack.

As sam connectors are a custom resource, we cannot see the role in the cloudformation stack **until after it is deployed**. The sam demo template itself points out that it is `an implicit resource` further down in the output section.

Opening the function role, along with the `AWSLambdaBasicExecutionRole` default policy we find the following custom policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Action": [
                "s3:GetObject",
                "s3:GetObjectAcl",
                "s3:GetObjectLegalHold",
                "s3:GetObjectRetention",
                "s3:GetObjectTorrent",
                "s3:GetObjectVersion",
                "s3:GetObjectVersionAcl",
                "s3:GetObjectVersionForReplication",
                "s3:GetObjectVersionTorrent",
                "s3:ListBucket",
                "s3:ListBucketMultipartUploads",
                "s3:ListBucketVersions",
                "s3:ListMultipartUploadParts"
            ],
            "Resource": [
                "arn:aws:s3:::wopwopw123",
                "arn:aws:s3:::wopwopw123/*"
            ],
            "Effect": "Allow"
        },
        {
            "Action": [
                "s3:AbortMultipartUpload",
                "s3:DeleteObject",
                "s3:DeleteObjectVersion",
                "s3:PutObject",
                "s3:PutObjectLegalHold",
                "s3:PutObjectRetention",
                "s3:RestoreObject"
            ],
            "Resource": [
                "arn:aws:s3:::wopwopw123",
                "arn:aws:s3:::wopwopw123/*"
            ],
            "Effect": "Allow"
        }
    ]
}
```

That's quite a lot of permissions. 😃

Interesting are the two different statements, the **first one** is for the **read connector**, the **second one** for **write**. Noteworthy is that the write statement grants permission to the bucket resource itself, though none of the granted actions work on the bucket level.

It can be debated how useful such an automatically generated policy is that you cannot alter or pin down further, but that might be the whole point - you are supposed to be lifted off the burdon of least privilege.

Interesting are also the supported recources for sam connectors. Generally the permission model knows only `Read` and `Write`, and the list of supported can be found in the [reference](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/reference-sam-connector.html). Generally by the time of writing the supported resources are:
- Lambda Functions
- SNS Topics
- S3 Buckets
- Dynamodb Tables
- API Gateways
- Eventbridge Rule
- SQS Queues
- Step Functions

Extra mutations occur because of the custom `Serverless::` resource types introduced by SAM. Now that we have a first taste of sam connectors, let's move over to the policies.

## What are Sam Policy Templates?

[Sam Policy templates](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-policy-templates.html) or as we dub them "community templates" - since the repo is open for [submissions](https://github.com/aws/serverless-application-model/blob/develop/samtranslator/policy_templates_data/policy_templates.json) - are another approach for better policies.

Notably the set of policies doesn't only differentiate between `Read` and `Write` like the connectors, but it also has policies  that are for general crud, full access or service specific (i.e. `SQSPollerPolicy`). The docs contain a whole [list of policies](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-policy-templates.html#serverless-policy-template-table) and for our example [S3ReadPolicy](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-policy-template-list.html#s3-read-policy) and [S3WritePolicy](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-policy-template-list.html#s3-read-policy) look handy.

```yaml
Resources:
  HelloWorldFunction:
    Type: AWS::Serverless::Function 
    Properties:
      CodeUri: hello-world/
      Handler: app.lambdaHandler
      Runtime: nodejs16.x
      Architectures:
        - x86_64
      Policies:
        - S3ReadPolicy:
            BucketName: !Ref S3Bucket
        - S3WritePolicy:
            BucketName: !Ref S3Bucket
    Metadata: 
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: "es2020"
        EntryPoints:
          - app.ts
  S3Bucket:
    Type: AWS::S3::Bucket
```

Again since these are custom resource, we can see them only after the deployment or directly from the docs.

Together with the `AWSLambdaBasicExecutionRole` we have these attached as seperate custom inline policies. One for read:

```json
{
    "Statement": [
        {
            "Action": [
                "s3:GetObject",
                "s3:ListBucket",
                "s3:GetBucketLocation",
                "s3:GetObjectVersion",
                "s3:GetLifecycleConfiguration"
            ],
            "Resource": [
                "arn:aws:s3:::policy-templates-sam-s3bucket-uki97i022xe3",
                "arn:aws:s3:::policy-templates-sam-s3bucket-uki97i022xe3/*"
            ],
            "Effect": "Allow"
        }
    ]
}
```

and one for write:
```json
{
    "Statement": [
        {
            "Action": [
                "s3:PutObject",
                "s3:PutObjectAcl",
                "s3:PutLifecycleConfiguration"
            ],
            "Resource": [
                "arn:aws:s3:::policy-templates-sam-s3bucket-uki97i022xe3",
                "arn:aws:s3:::policy-templates-sam-s3bucket-uki97i022xe3/*"
            ],
            "Effect": "Allow"
        }
    ]
}
```

These grant different from the policies granted by the sam connectors, but at least this time in the write policy the access to the bucket resource is justified, as PutLifecycleConfiguration is granted, which is a bucket operation.

## Checking in

Having looked at both sam connectors and sam policy templates, the policy templates seem a bit more promising. Often you need more differentiated policies outside of the simple categories of read and write. A central place for community contributions might be the thing that is needed to centrally collect useful least privilege policies and unlock more potential in this area. Could save some engineers some headaches scrolling through cloudtrail messages for sure. 😃

For this reason lets start integrating the sam policy templates into a sample cdk stack.

But before we do that, lets take a look what the CDK can provide for us out of the box.

## CDK and least privilege

It is not like the CDK doesnt already have policy templates. Using the [lambda-function-nodejs](https://www.npmjs.com/package/@aws-cdk/aws-lambda-nodejs) construct we can quickly have ourselves a lambda function. The NodejsFunction construct here also creates an implicit iam role for us by default.

```javascript
const myfunc = new NodejsFunction(this, "nodejs", {
  entry: path.join(__dirname, '../hello-world/app.ts'),
  handler: "index.lambdaHandler",
  runtime: Runtime.NODEJS_16_X,
})

const bucket = new Bucket(this, "bucket", {})
```

Now adding only a single function call we can get our read write access for the s3 bucket. The function docs dont claim least privilege, but it is a policy template:

> Grants read/write permissions for this bucket and it's contents to an IAM principal (Role/Group/User).` 

```javascript
const grant = bucket.grantReadWrite(myfunc)
```

Once deployed we can again find our permissions like this. As usual with the `AWSLambdaBasicExecutionRole` policy attached, but also with the following inline policy: 

```yaml
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Action": [
                "s3:Abort*",
                "s3:DeleteObject*",
                "s3:GetBucket*",
                "s3:GetObject*",
                "s3:List*",
                "s3:PutObject",
                "s3:PutObjectLegalHold",
                "s3:PutObjectRetention",
                "s3:PutObjectTagging",
                "s3:PutObjectVersionTagging"
            ],
            "Resource": [
                "arn:aws:s3:::cdkdefaultstack-bucket43879c71-nutf5dje22gg",
                "arn:aws:s3:::cdkdefaultstack-bucket43879c71-nutf5dje22gg/*"
            ],
            "Effect": "Allow"
        }
    ]
}
```

But those are not the only grants that can be provided by the cdk. At the time of writing we have also:
- grantDelete
- grantPublicAccess
- grantPut
- grantPutAcl
- grantRead
- grantReadWrite
- grantWrite

For the cdk SQS queue which we had touched on earlier we also have a bunch of ready-made grants: 
- grantConsumeMessages
- grantPurge
- grantSendMessages

So the CDK already has a selection of predefined policies, which can even be customized. After a certain point of chipping away unneeded permissions it might be easier to start just from scratch and create your own policy.

But can we still marry the CDK and sam together, to get the best of both worlds?

## CDK meets Sam Connectors?

Having looked at sam connectors, it really doesnt look like they could challenge the default permission grant functions provided from the CDK.

The CDK does make it possible to create sam serverless functions, but only via the low level L1 Cloudformation resources:

```javascript
import * as sam from 'aws-cdk-lib/aws-sam';

new sam.CfnFunction(this, "sam-function", {
  runtime: "nodejs16.x",
})
```

For the cdk to really add higher level integrations with sam wouldn't make too much sense here, as the the cdk and sam here really have a very similar use-case.

So let's jump right over to the policy templates!

## CDK meets Sam Policy Templates

As the Sam policy templates are in a nice json format, it is indeed possible to import them into a cdk stack.

After messing with just a little bit of code generation it is possible to import any policy from Sam into the CDK:
```javascript
import * as sampolicies from "./../../cdk-sam-policy-templates/";
// ...
sampolicies.PinpointEndpointAccessPolicy(this, { PinpointApplicationId: "pin123", RoleName: myfunc.role?.roleName! })
```
We have build this mainly via `cloudformation-include`, as the sam policies themselves are not just json but raw cloudformation and use its intrinsic functions. Gladly the cdk is still smart enough to create References from resources attributes used in the policy, which will ensure the appropriate dependencies in the stack, and a correct deployment order.

What's nice about this is that you can contribute your policy as Cloudformation into the sam policy templates repo. From there, it could be taken either as is, for example in the serverless framework, or be used in sam and the cdk as well. This could make the sam policy templates a central place for sharing community policies with a larger audience.

Would we recommend it? Probably not. A community-driven sync from sam policies to cdk seems like a weird approach. To share policies between IaC frameworks it would probably be easier to build a site where people can simply submit and vote on helpful policy templates. Such a library would be bound to blow up the voting could keep it in check. Paired with with a decent search it could actually save people some time.

If you still want to have a look at the code its over [here](https://github.com/flyck/cdk-sam-policy-templates).
## Rounding up

Rounding up the post it might be said that we might have fallen victim to a bit of a marketing scam and the general aws announcement hype. Looking a bit deeper Sam Connectors were disappointing. Simple `Read`and `Write` will not be good enough for least privilege.

It was interesting to see that while similar, none of the provided policy templates from sam and the cdk were the same. All of them provided a slightly different flavor, making different assumptions about the use-case, some being more, some being less permissive.

Community driven policies tailored for specific usecases should be the answer here, but it wont be as easy as simply differentiated between read and write.