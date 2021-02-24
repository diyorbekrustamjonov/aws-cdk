import '@aws-cdk/assert/jest';
import { ABSENT, ResourcePart, anything } from '@aws-cdk/assert';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as targets from '@aws-cdk/aws-events-targets';
import { ManagedPolicy, Role, ServicePrincipal, AccountPrincipal } from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import * as lambda from '@aws-cdk/aws-lambda';
import * as logs from '@aws-cdk/aws-logs';
import * as s3 from '@aws-cdk/aws-s3';
import * as cdk from '@aws-cdk/core';
import * as cxapi from '@aws-cdk/cx-api';
import { testFutureBehavior } from 'cdk-build-tools/lib/feature-flag';
import * as rds from '../lib';

let stack: cdk.Stack;
let vpc: ec2.Vpc;

describe('instance', () => {
  beforeEach(() => {
    stack = new cdk.Stack();
    vpc = new ec2.Vpc(stack, 'VPC');
  });

  test('create a DB instance', () => {
    // WHEN
    new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.oracleSe2({ version: rds.OracleEngineVersion.VER_19_0_0_0_2020_04_R1 }),
      licenseModel: rds.LicenseModel.BRING_YOUR_OWN_LICENSE,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.MEDIUM),
      multiAz: true,
      storageType: rds.StorageType.IO1,
      credentials: rds.Credentials.fromUsername('syscdk', {
        excludeCharacters: '"@/\\',
      }),
      vpc,
      databaseName: 'ORCL',
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(7),
      monitoringInterval: cdk.Duration.minutes(1),
      enablePerformanceInsights: true,
      cloudwatchLogsExports: [
        'trace',
        'audit',
        'alert',
        'listener',
      ],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_MONTH,
      autoMinorVersionUpgrade: false,
    });

    // THEN
    expect(stack).toHaveResource('AWS::RDS::DBInstance', {
      Properties: {
        DBInstanceClass: 'db.t2.medium',
        AllocatedStorage: '100',
        AutoMinorVersionUpgrade: false,
        BackupRetentionPeriod: 7,
        CopyTagsToSnapshot: true,
        DBName: 'ORCL',
        DBSubnetGroupName: {
          Ref: 'InstanceSubnetGroupF2CBA54F',
        },
        EnableCloudwatchLogsExports: [
          'trace',
          'audit',
          'alert',
          'listener',
        ],
        EnablePerformanceInsights: true,
        Engine: 'oracle-se2',
        EngineVersion: '19.0.0.0.ru-2020-04.rur-2020-04.r1',
        Iops: 1000,
        LicenseModel: 'bring-your-own-license',
        MasterUsername: {
          'Fn::Join': [
            '',
            [
              '{{resolve:secretsmanager:',
              {
                Ref: 'InstanceSecret478E0A47',
              },
              ':SecretString:username::}}',
            ],
          ],
        },
        MasterUserPassword: {
          'Fn::Join': [
            '',
            [
              '{{resolve:secretsmanager:',
              {
                Ref: 'InstanceSecret478E0A47',
              },
              ':SecretString:password::}}',
            ],
          ],
        },
        MonitoringInterval: 60,
        MonitoringRoleArn: {
          'Fn::GetAtt': [
            'InstanceMonitoringRole3E2B4286',
            'Arn',
          ],
        },
        MultiAZ: true,
        PerformanceInsightsRetentionPeriod: 7,
        StorageEncrypted: true,
        StorageType: 'io1',
        VPCSecurityGroups: [
          {
            'Fn::GetAtt': [
              'InstanceSecurityGroupB4E5FA83',
              'GroupId',
            ],
          },
        ],
      },
      DeletionPolicy: 'Snapshot',
      UpdateReplacePolicy: 'Snapshot',
    }, ResourcePart.CompleteDefinition);

    expect(stack).toHaveResource('AWS::RDS::DBSubnetGroup', {
      DBSubnetGroupDescription: 'Subnet group for Instance database',
      SubnetIds: [
        {
          Ref: 'VPCPrivateSubnet1Subnet8BCA10E0',
        },
        {
          Ref: 'VPCPrivateSubnet2SubnetCFCDAA7A',
        },
      ],
    });

    expect(stack).toHaveResource('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Security group for Instance database',
    });

    expect(stack).toHaveResource('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'monitoring.rds.amazonaws.com',
            },
          },
        ],
        Version: '2012-10-17',
      },
      ManagedPolicyArns: [
        {
          'Fn::Join': [
            '',
            [
              'arn:',
              {
                Ref: 'AWS::Partition',
              },
              ':iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole',
            ],
          ],
        },
      ],
    });

    expect(stack).toHaveResource('AWS::SecretsManager::Secret', {
      Description: {
        'Fn::Join': [
          '',
          [
            'Generated by the CDK for stack: ',
            {
              Ref: 'AWS::StackName',
            },
          ],
        ],
      },
      GenerateSecretString: {
        ExcludeCharacters: '\"@/\\',
        GenerateStringKey: 'password',
        PasswordLength: 30,
        SecretStringTemplate: '{"username":"syscdk"}',
      },
    });

    expect(stack).toHaveResource('AWS::SecretsManager::SecretTargetAttachment', {
      SecretId: {
        Ref: 'InstanceSecret478E0A47',
      },
      TargetId: {
        Ref: 'InstanceC1063A87',
      },
      TargetType: 'AWS::RDS::DBInstance',
    });

    expect(stack).toCountResources('Custom::LogRetention', 4);


  });

  test('instance with option and parameter group', () => {
    const optionGroup = new rds.OptionGroup(stack, 'OptionGroup', {
      engine: rds.DatabaseInstanceEngine.oracleSe2({ version: rds.OracleEngineVersion.VER_19_0_0_0_2020_04_R1 }),
      configurations: [
        {
          name: 'XMLDB',
        },
      ],
    });

    const parameterGroup = new rds.ParameterGroup(stack, 'ParameterGroup', {
      engine: rds.DatabaseInstanceEngine.sqlServerEe({
        version: rds.SqlServerEngineVersion.VER_11,
      }),
      description: 'desc',
      parameters: {
        key: 'value',
      },
    });

    // WHEN
    new rds.DatabaseInstance(stack, 'Database', {
      engine: rds.DatabaseInstanceEngine.SQL_SERVER_EE,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.SMALL),
      vpc,
      optionGroup,
      parameterGroup,
    });

    expect(stack).toHaveResource('AWS::RDS::DBInstance', {
      DBParameterGroupName: {
        Ref: 'ParameterGroup5E32DECB',
      },
      OptionGroupName: {
        Ref: 'OptionGroupACA43DC1',
      },
    });


  });

  test('can specify subnet type', () => {
    new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_19,
      }),
      credentials: rds.Credentials.fromUsername('syscdk'),
      vpc,
      vpcPlacement: {
        subnetType: ec2.SubnetType.PRIVATE,
      },
    });

    expect(stack).toHaveResource('AWS::RDS::DBInstance', {
      DBSubnetGroupName: {
        Ref: 'InstanceSubnetGroupF2CBA54F',
      },
      PubliclyAccessible: false,
    });
    expect(stack).toHaveResource('AWS::RDS::DBSubnetGroup', {
      DBSubnetGroupDescription: 'Subnet group for Instance database',
      SubnetIds: [
        {
          Ref: 'VPCPrivateSubnet1Subnet8BCA10E0',
        },
        {
          Ref: 'VPCPrivateSubnet2SubnetCFCDAA7A',
        },
      ],
    });


  });

  describe('DatabaseInstanceFromSnapshot', () => {
    test('create an instance from snapshot', () => {
      new rds.DatabaseInstanceFromSnapshot(stack, 'Instance', {
        snapshotIdentifier: 'my-snapshot',
        engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_12_3 }),
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.LARGE),
        vpc,
      });

      expect(stack).toHaveResource('AWS::RDS::DBInstance', {
        DBSnapshotIdentifier: 'my-snapshot',
      });


    });

    test('can generate a new snapshot password', () => {
      new rds.DatabaseInstanceFromSnapshot(stack, 'Instance', {
        snapshotIdentifier: 'my-snapshot',
        engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_19 }),
        vpc,
        credentials: rds.SnapshotCredentials.fromGeneratedPassword('admin', {
          excludeCharacters: '"@/\\',
        }),
      });

      expect(stack).toHaveResourceLike('AWS::RDS::DBInstance', {
        MasterUsername: ABSENT,
        MasterUserPassword: {
          'Fn::Join': ['', ['{{resolve:secretsmanager:', { Ref: 'InstanceSecret478E0A47' }, ':SecretString:password::}}']],
        },
      });
      expect(stack).toHaveResource('AWS::SecretsManager::Secret', {
        Description: {
          'Fn::Join': ['', ['Generated by the CDK for stack: ', { Ref: 'AWS::StackName' }]],
        },
        GenerateSecretString: {
          ExcludeCharacters: '\"@/\\',
          GenerateStringKey: 'password',
          PasswordLength: 30,
          SecretStringTemplate: '{"username":"admin"}',
        },
      });


    });

    test('fromGeneratedSecret', () => {
      new rds.DatabaseInstanceFromSnapshot(stack, 'Instance', {
        snapshotIdentifier: 'my-snapshot',
        engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_19 }),
        vpc,
        credentials: rds.SnapshotCredentials.fromGeneratedSecret('admin', {
          excludeCharacters: '"@/\\',
        }),
      });

      expect(stack).toHaveResourceLike('AWS::RDS::DBInstance', {
        MasterUsername: ABSENT,
        MasterUserPassword: {
          // logical id of secret has a hash
          'Fn::Join': ['', ['{{resolve:secretsmanager:', { Ref: 'InstanceSecretB6DFA6BE8ee0a797cad8a68dbeb85f8698cdb5bb' }, ':SecretString:password::}}']],
        },
      });


    });

    test('throws if generating a new password without a username', () => {
      expect(() => new rds.DatabaseInstanceFromSnapshot(stack, 'Instance', {
        snapshotIdentifier: 'my-snapshot',
        engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_19 }),
        vpc,
        credentials: { generatePassword: true },
      })).toThrow(/`credentials` `username` must be specified when `generatePassword` is set to true/);


    });

    test('can set a new snapshot password from an existing SecretValue', () => {
      new rds.DatabaseInstanceFromSnapshot(stack, 'Instance', {
        snapshotIdentifier: 'my-snapshot',
        engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_19 }),
        vpc,
        credentials: rds.SnapshotCredentials.fromPassword(cdk.SecretValue.plainText('mysecretpassword')),
      });

      // TODO - Expect this to be broken
      expect(stack).toHaveResourceLike('AWS::RDS::DBInstance', {
        MasterUsername: ABSENT,
        MasterUserPassword: 'mysecretpassword',
      });


    });

    test('can set a new snapshot password from an existing Secret', () => {
      const secret = new rds.DatabaseSecret(stack, 'DBSecret', {
        username: 'admin',
        encryptionKey: new kms.Key(stack, 'PasswordKey'),
      });
      new rds.DatabaseInstanceFromSnapshot(stack, 'Instance', {
        snapshotIdentifier: 'my-snapshot',
        engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_19 }),
        vpc,
        credentials: rds.SnapshotCredentials.fromSecret(secret),
      });

      expect(stack).toHaveResourceLike('AWS::RDS::DBInstance', {
        MasterUsername: ABSENT,
        MasterUserPassword: {
          'Fn::Join': ['', ['{{resolve:secretsmanager:', { Ref: 'DBSecretD58955BC' }, ':SecretString:password::}}']],
        },
      });


    });
  });

  test('create a read replica in the same region - with the subnet group name', () => {
    const sourceInstance = new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.MYSQL,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.SMALL),
      vpc,
    });

    // WHEN
    new rds.DatabaseInstanceReadReplica(stack, 'ReadReplica', {
      sourceDatabaseInstance: sourceInstance,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.LARGE),
      vpc,
    });

    // THEN
    expect(stack).toHaveResource('AWS::RDS::DBInstance', {
      SourceDBInstanceIdentifier: {
        'Fn::Join': ['', [
          'arn:',
          { Ref: 'AWS::Partition' },
          ':rds:',
          { Ref: 'AWS::Region' },
          ':',
          { Ref: 'AWS::AccountId' },
          ':db:',
          { Ref: 'InstanceC1063A87' },
        ]],
      },
      DBSubnetGroupName: {
        Ref: 'ReadReplicaSubnetGroup680C605C',
      },
    });


  });

  test('on event', () => {
    const instance = new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.MYSQL,
      vpc,
    });
    const fn = new lambda.Function(stack, 'Function', {
      code: lambda.Code.fromInline('dummy'),
      handler: 'index.handler',
      runtime: lambda.Runtime.NODEJS_10_X,
    });

    // WHEN
    instance.onEvent('InstanceEvent', { target: new targets.LambdaFunction(fn) });

    // THEN
    expect(stack).toHaveResource('AWS::Events::Rule', {
      EventPattern: {
        source: [
          'aws.rds',
        ],
        resources: [
          {
            'Fn::Join': [
              '',
              [
                'arn:',
                {
                  Ref: 'AWS::Partition',
                },
                ':rds:',
                {
                  Ref: 'AWS::Region',
                },
                ':',
                {
                  Ref: 'AWS::AccountId',
                },
                ':db:',
                {
                  Ref: 'InstanceC1063A87',
                },
              ],
            ],
          },
        ],
      },
      Targets: [
        {
          Arn: {
            'Fn::GetAtt': [
              'Function76856677',
              'Arn',
            ],
          },
          Id: 'Target0',
        },
      ],
    });


  });

  test('on event without target', () => {
    const instance = new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.MYSQL,
      vpc,
    });

    // WHEN
    instance.onEvent('InstanceEvent');

    // THEN
    expect(stack).toHaveResource('AWS::Events::Rule', {
      EventPattern: {
        source: [
          'aws.rds',
        ],
        resources: [
          {
            'Fn::Join': [
              '',
              [
                'arn:',
                {
                  Ref: 'AWS::Partition',
                },
                ':rds:',
                {
                  Ref: 'AWS::Region',
                },
                ':',
                {
                  Ref: 'AWS::AccountId',
                },
                ':db:',
                {
                  Ref: 'InstanceC1063A87',
                },
              ],
            ],
          },
        ],
      },
    });


  });

  test('can use metricCPUUtilization', () => {
    // WHEN
    const instance = new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.MYSQL,
      vpc,
    });

    // THEN
    expect(stack.resolve(instance.metricCPUUtilization())).toEqual({
      dimensions: { DBInstanceIdentifier: { Ref: 'InstanceC1063A87' } },
      namespace: 'AWS/RDS',
      metricName: 'CPUUtilization',
      period: cdk.Duration.minutes(5),
      statistic: 'Average',
    });


  });

  test('can resolve endpoint port and socket address', () => {
    // WHEN
    const instance = new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.MYSQL,
      vpc,
    });

    expect(stack.resolve(instance.instanceEndpoint.port)).toEqual({
      'Fn::GetAtt': ['InstanceC1063A87', 'Endpoint.Port'],
    });

    expect(stack.resolve(instance.instanceEndpoint.socketAddress)).toEqual({
      'Fn::Join': [
        '',
        [
          { 'Fn::GetAtt': ['InstanceC1063A87', 'Endpoint.Address'] },
          ':',
          { 'Fn::GetAtt': ['InstanceC1063A87', 'Endpoint.Port'] },
        ],
      ],
    });


  });

  test('can deactivate backup', () => {
    // WHEN
    new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.MYSQL,
      vpc,
      backupRetention: cdk.Duration.seconds(0),
    });

    // THEN
    expect(stack).toHaveResource('AWS::RDS::DBInstance', {
      BackupRetentionPeriod: 0,
    });


  });

  test('imported instance with imported security group with allowAllOutbound set to false', () => {
    const instance = rds.DatabaseInstance.fromDatabaseInstanceAttributes(stack, 'Database', {
      instanceEndpointAddress: 'address',
      instanceIdentifier: 'identifier',
      port: 3306,
      securityGroups: [ec2.SecurityGroup.fromSecurityGroupId(stack, 'SG', 'sg-123456789', {
        allowAllOutbound: false,
      })],
    });

    // WHEN
    instance.connections.allowToAnyIpv4(ec2.Port.tcp(443));

    // THEN
    expect(stack).toHaveResource('AWS::EC2::SecurityGroupEgress', {
      GroupId: 'sg-123456789',
    });


  });

  test('create an instance with imported monitoring role', () => {
    const monitoringRole = new Role(stack, 'MonitoringRole', {
      assumedBy: new ServicePrincipal('monitoring.rds.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonRDSEnhancedMonitoringRole'),
      ],
    });

    // WHEN
    new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.MYSQL,
      vpc,
      monitoringInterval: cdk.Duration.minutes(1),
      monitoringRole,
    });

    // THEN
    expect(stack).toHaveResource('AWS::RDS::DBInstance', {
      MonitoringInterval: 60,
      MonitoringRoleArn: {
        'Fn::GetAtt': ['MonitoringRole90457BF9', 'Arn'],
      },
    }, ResourcePart.Properties);


  });

  test('create an instance with an existing security group', () => {
    const securityGroup = ec2.SecurityGroup.fromSecurityGroupId(stack, 'SG', 'sg-123456789', {
      allowAllOutbound: false,
    });

    // WHEN
    const instance = new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.MYSQL,
      vpc,
      securityGroups: [securityGroup],
    });
    instance.connections.allowDefaultPortFromAnyIpv4();

    // THEN
    expect(stack).toHaveResource('AWS::RDS::DBInstance', {
      VPCSecurityGroups: ['sg-123456789'],
    });

    expect(stack).toHaveResource('AWS::EC2::SecurityGroupIngress', {
      FromPort: {
        'Fn::GetAtt': [
          'InstanceC1063A87',
          'Endpoint.Port',
        ],
      },
      GroupId: 'sg-123456789',
      ToPort: {
        'Fn::GetAtt': [
          'InstanceC1063A87',
          'Endpoint.Port',
        ],
      },
    });


  });

  test('throws when trying to add rotation to an instance without secret', () => {
    const instance = new rds.DatabaseInstance(stack, 'Database', {
      engine: rds.DatabaseInstanceEngine.SQL_SERVER_EE,
      credentials: rds.Credentials.fromUsername('syscdk', { password: cdk.SecretValue.plainText('tooshort') }),
      vpc,
    });

    // THEN
    expect(() => instance.addRotationSingleUser()).toThrow(/without secret/);


  });

  test('throws when trying to add single user rotation multiple times', () => {
    const instance = new rds.DatabaseInstance(stack, 'Database', {
      engine: rds.DatabaseInstanceEngine.SQL_SERVER_EE,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.SMALL),
      credentials: rds.Credentials.fromUsername('syscdk'),
      vpc,
    });

    // WHEN
    instance.addRotationSingleUser();

    // THEN
    expect(() => instance.addRotationSingleUser()).toThrow(/A single user rotation was already added to this instance/);


  });

  test('throws when timezone is set for non-sqlserver database engine', () => {
    const tzSupportedEngines = [rds.DatabaseInstanceEngine.SQL_SERVER_EE, rds.DatabaseInstanceEngine.SQL_SERVER_EX,
      rds.DatabaseInstanceEngine.SQL_SERVER_SE, rds.DatabaseInstanceEngine.SQL_SERVER_WEB];
    const tzUnsupportedEngines = [rds.DatabaseInstanceEngine.MYSQL, rds.DatabaseInstanceEngine.POSTGRES,
      rds.DatabaseInstanceEngine.ORACLE_EE, rds.DatabaseInstanceEngine.MARIADB];

    // THEN
    tzSupportedEngines.forEach((engine) => {
      expect(new rds.DatabaseInstance(stack, `${engine.engineType}-db`, {
        engine,
        timezone: 'Europe/Zurich',
        vpc,
      })).toBeDefined();
    });

    tzUnsupportedEngines.forEach((engine) => {
      expect(() => new rds.DatabaseInstance(stack, `${engine.engineType}-db`, {
        engine,
        timezone: 'Europe/Zurich',
        vpc,
      })).toThrow(/timezone property can not be configured for/);
    });


  });

  test('create an instance from snapshot with maximum allocated storage', () => {
    // WHEN
    new rds.DatabaseInstanceFromSnapshot(stack, 'Instance', {
      snapshotIdentifier: 'my-snapshot',
      engine: rds.DatabaseInstanceEngine.POSTGRES,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.LARGE),
      vpc,
      maxAllocatedStorage: 200,
    });

    expect(stack).toHaveResource('AWS::RDS::DBInstance', {
      DBSnapshotIdentifier: 'my-snapshot',
      MaxAllocatedStorage: 200,
    });


  });

  test('create a DB instance with maximum allocated storage', () => {
    // WHEN
    new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.MYSQL,
      vpc,
      backupRetention: cdk.Duration.seconds(0),
      maxAllocatedStorage: 250,
    });

    // THEN
    expect(stack).toHaveResource('AWS::RDS::DBInstance', {
      BackupRetentionPeriod: 0,
      MaxAllocatedStorage: 250,
    });


  });

  test('iam authentication - off by default', () => {
    new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_19 }),
      vpc,
    });

    expect(stack).toHaveResourceLike('AWS::RDS::DBInstance', {
      EnableIAMDatabaseAuthentication: ABSENT,
    });


  });

  test('createGrant - creates IAM policy and enables IAM auth', () => {
    const instance = new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_19 }),
      vpc,
    });
    const role = new Role(stack, 'DBRole', {
      assumedBy: new AccountPrincipal(stack.account),
    });
    instance.grantConnect(role);

    expect(stack).toHaveResourceLike('AWS::RDS::DBInstance', {
      EnableIAMDatabaseAuthentication: true,
    });
    expect(stack).toHaveResource('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [{
          Effect: 'Allow',
          Action: 'rds-db:connect',
          Resource: {
            'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':rds:', { Ref: 'AWS::Region' }, ':', { Ref: 'AWS::AccountId' }, ':db:', { Ref: 'InstanceC1063A87' }]],
          },
        }],
        Version: '2012-10-17',
      },
    });


  });

  test('createGrant - throws if IAM auth disabled', () => {
    const instance = new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_19 }),
      vpc,
      iamAuthentication: false,
    });
    const role = new Role(stack, 'DBRole', {
      assumedBy: new AccountPrincipal(stack.account),
    });

    expect(() => { instance.grantConnect(role); }).toThrow(/Cannot grant connect when IAM authentication is disabled/);


  });

  test('domain - sets domain property', () => {
    const domain = 'd-90670a8d36';

    // WHEN
    new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.sqlServerWeb({ version: rds.SqlServerEngineVersion.VER_14_00_3192_2_V1 }),
      vpc,
      domain: domain,
    });

    // THEN
    expect(stack).toHaveResourceLike('AWS::RDS::DBInstance', {
      Domain: domain,
    });


  });

  test('domain - uses role if provided', () => {
    const domain = 'd-90670a8d36';

    // WHEN
    const role = new Role(stack, 'DomainRole', { assumedBy: new ServicePrincipal('rds.amazonaws.com') });
    new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.sqlServerWeb({ version: rds.SqlServerEngineVersion.VER_14_00_3192_2_V1 }),
      vpc,
      domain: domain,
      domainRole: role,
    });

    // THEN
    expect(stack).toHaveResourceLike('AWS::RDS::DBInstance', {
      Domain: domain,
      DomainIAMRoleName: stack.resolve(role.roleName),
    });


  });

  test('domain - creates role if not provided', () => {
    const domain = 'd-90670a8d36';

    // WHEN
    new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.sqlServerWeb({ version: rds.SqlServerEngineVersion.VER_14_00_3192_2_V1 }),
      vpc,
      domain: domain,
    });

    // THEN
    expect(stack).toHaveResourceLike('AWS::RDS::DBInstance', {
      Domain: domain,
      DomainIAMRoleName: anything(),
    });

    expect(stack).toHaveResource('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'rds.amazonaws.com',
            },
          },
        ],
        Version: '2012-10-17',
      },
      ManagedPolicyArns: [
        {
          'Fn::Join': [
            '',
            [
              'arn:',
              {
                Ref: 'AWS::Partition',
              },
              ':iam::aws:policy/service-role/AmazonRDSDirectoryServiceAccess',
            ],
          ],
        },
      ],
    });


  });

  test('throws when domain is set for mariadb database engine', () => {
    const domainSupportedEngines = [rds.DatabaseInstanceEngine.SQL_SERVER_EE, rds.DatabaseInstanceEngine.SQL_SERVER_EX,
      rds.DatabaseInstanceEngine.SQL_SERVER_SE, rds.DatabaseInstanceEngine.SQL_SERVER_WEB, rds.DatabaseInstanceEngine.MYSQL,
      rds.DatabaseInstanceEngine.POSTGRES, rds.DatabaseInstanceEngine.ORACLE_EE];
    const domainUnsupportedEngines = [rds.DatabaseInstanceEngine.MARIADB];

    // THEN
    domainSupportedEngines.forEach((engine) => {
      expect(() => new rds.DatabaseInstance(stack, `${engine.engineType}-db`, {
        engine,
        domain: 'd-90670a8d36',
        vpc,
      })).not.toThrow();
    });

    domainUnsupportedEngines.forEach((engine) => {
      const expectedError = new RegExp(`domain property cannot be configured for ${engine.engineType}`);

      expect(() => new rds.DatabaseInstance(stack, `${engine.engineType}-db`, {
        engine,
        domain: 'd-90670a8d36',
        vpc,
      })).toThrow(expectedError);
    });


  });

  describe('performance insights', () => {
    test('instance with all performance insights properties', () => {
      new rds.DatabaseInstance(stack, 'Instance', {
        engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_19 }),
        vpc,
        enablePerformanceInsights: true,
        performanceInsightRetention: rds.PerformanceInsightRetention.LONG_TERM,
        performanceInsightEncryptionKey: new kms.Key(stack, 'Key'),
      });

      expect(stack).toHaveResource('AWS::RDS::DBInstance', {
        EnablePerformanceInsights: true,
        PerformanceInsightsRetentionPeriod: 731,
        PerformanceInsightsKMSKeyId: { 'Fn::GetAtt': ['Key961B73FD', 'Arn'] },
      });


    });

    test('setting performance insights fields enables performance insights', () => {
      new rds.DatabaseInstance(stack, 'Instance', {
        engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_19 }),
        vpc,
        performanceInsightRetention: rds.PerformanceInsightRetention.LONG_TERM,
      });

      expect(stack).toHaveResource('AWS::RDS::DBInstance', {
        EnablePerformanceInsights: true,
        PerformanceInsightsRetentionPeriod: 731,
      });


    });

    test('throws if performance insights fields are set but performance insights is disabled', () => {
      expect(() => {
        new rds.DatabaseInstance(stack, 'Instance', {
          engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_19 }),
          vpc,
          enablePerformanceInsights: false,
          performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
        });
      }).toThrow(/`enablePerformanceInsights` disabled, but `performanceInsightRetention` or `performanceInsightEncryptionKey` was set/);


    });
  });

  test('reuse an existing subnet group', () => {
    new rds.DatabaseInstance(stack, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_12_3 }),
      vpc,
      subnetGroup: rds.SubnetGroup.fromSubnetGroupName(stack, 'SubnetGroup', 'my-subnet-group'),
    });

    expect(stack).toHaveResourceLike('AWS::RDS::DBInstance', {
      DBSubnetGroupName: 'my-subnet-group',
    });
    expect(stack).toCountResources('AWS::RDS::DBSubnetGroup', 0);


  });

  test('defaultChild returns the DB Instance', () => {
    const instance = new rds.DatabaseInstance(stack, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_12_3 }),
      vpc,
    });

    // THEN
    expect(instance.node.defaultChild instanceof rds.CfnDBInstance).toBeTruthy();


  });

  test("PostgreSQL database instance uses a different default master username than 'admin', which is a reserved word", () => {
    new rds.DatabaseInstance(stack, 'Instance', {
      vpc,
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_12_4,
      }),
    });

    // THEN
    expect(stack).toHaveResourceLike('AWS::SecretsManager::Secret', {
      GenerateSecretString: {
        SecretStringTemplate: '{"username":"postgres"}',
      },
    });


  });

  describe('S3 Import/Export', () => {
    testFutureBehavior('instance with s3 import and export buckets', { [cxapi.S3_GRANT_WRITE_WITHOUT_ACL]: true }, cdk.App, (app) => {
      stack = new cdk.Stack(app);
      vpc = new ec2.Vpc(stack, 'VPC');
      new rds.DatabaseInstance(stack, 'DB', {
        engine: rds.DatabaseInstanceEngine.sqlServerSe({ version: rds.SqlServerEngineVersion.VER_14_00_3192_2_V1 }),
        vpc,
        s3ImportBuckets: [new s3.Bucket(stack, 'S3Import')],
        s3ExportBuckets: [new s3.Bucket(stack, 'S3Export')],
      });

      expect(stack).toHaveResource('AWS::RDS::DBInstance', {
        AssociatedRoles: [
          {
            FeatureName: 'S3_INTEGRATION',
            RoleArn: { 'Fn::GetAtt': ['DBS3ImportRoleEF69B7D7', 'Arn'] },
          },
        ],
        OptionGroupName: { Ref: 'DBInstanceOptionGroup46C68006' },
      });

      // Can read from import bucket, and read/write from export bucket
      expect(stack).toHaveResource('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: [{
            Action: [
              's3:GetObject*',
              's3:GetBucket*',
              's3:List*',
            ],
            Effect: 'Allow',
            Resource: [
              { 'Fn::GetAtt': ['S3ImportD5D5F2EB', 'Arn'] },
              { 'Fn::Join': ['', [{ 'Fn::GetAtt': ['S3ImportD5D5F2EB', 'Arn'] }, '/*']] },
            ],
          },
          {
            Action: [
              's3:GetObject*',
              's3:GetBucket*',
              's3:List*',
              's3:DeleteObject*',
              's3:PutObject',
              's3:Abort*',
            ],
            Effect: 'Allow',
            Resource: [
              { 'Fn::GetAtt': ['S3Export390B8694', 'Arn'] },
              { 'Fn::Join': ['', [{ 'Fn::GetAtt': ['S3Export390B8694', 'Arn'] }, '/*']] },
            ],
          }],
          Version: '2012-10-17',
        },
      });


    });

    test('throws if using s3 import on unsupported engine', () => {
      const s3ImportRole = new Role(stack, 'S3ImportRole', {
        assumedBy: new ServicePrincipal('rds.amazonaws.com'),
      });

      expect(() => {
        new rds.DatabaseInstance(stack, 'DBWithImportBucket', {
          engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_19 }),
          vpc,
          s3ImportBuckets: [new s3.Bucket(stack, 'S3Import')],
        });
      }).toThrow(/Engine 'mysql-8.0.19' does not support S3 import/);
      expect(() => {
        new rds.DatabaseInstance(stack, 'DBWithImportRole', {
          engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_19 }),
          vpc,
          s3ImportRole,
        });
      }).toThrow(/Engine 'mysql-8.0.19' does not support S3 import/);


    });

    test('throws if using s3 export on unsupported engine', () => {
      const s3ExportRole = new Role(stack, 'S3ExportRole', {
        assumedBy: new ServicePrincipal('rds.amazonaws.com'),
      });

      expect(() => {
        new rds.DatabaseInstance(stack, 'DBWithExportBucket', {
          engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_19 }),
          vpc,
          s3ExportBuckets: [new s3.Bucket(stack, 'S3Export')],
        });
      }).toThrow(/Engine 'mysql-8.0.19' does not support S3 export/);
      expect(() => {
        new rds.DatabaseInstance(stack, 'DBWithExportRole', {
          engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_19 }),
          vpc,
          s3ExportRole: s3ExportRole,
        });
      }).toThrow(/Engine 'mysql-8.0.19' does not support S3 export/);


    });

    test('throws if provided two different roles for import/export', () => {
      const s3ImportRole = new Role(stack, 'S3ImportRole', {
        assumedBy: new ServicePrincipal('rds.amazonaws.com'),
      });
      const s3ExportRole = new Role(stack, 'S3ExportRole', {
        assumedBy: new ServicePrincipal('rds.amazonaws.com'),
      });

      expect(() => {
        new rds.DatabaseInstance(stack, 'DBWithExportBucket', {
          engine: rds.DatabaseInstanceEngine.sqlServerEe({ version: rds.SqlServerEngineVersion.VER_14_00_3192_2_V1 }),
          vpc,
          s3ImportRole,
          s3ExportRole,
        });
      }).toThrow(/S3 import and export roles must be the same/);


    });
  });

  test('fromGeneratedSecret', () => {
    // WHEN
    new rds.DatabaseInstance(stack, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_12_3 }),
      vpc,
      credentials: rds.Credentials.fromGeneratedSecret('postgres'),
    });

    // THEN
    expect(stack).toHaveResource('AWS::RDS::DBInstance', {
      MasterUsername: 'postgres', // username is a string
      MasterUserPassword: {
        'Fn::Join': [
          '',
          [
            '{{resolve:secretsmanager:',
            {
              Ref: 'DatabaseSecretC9203AE33fdaad7efa858a3daf9490cf0a702aeb', // logical id is a hash
            },
            ':SecretString:password::}}',
          ],
        ],
      },
    });


  });

  test('fromPassword', () => {
    // WHEN
    new rds.DatabaseInstance(stack, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_12_3 }),
      vpc,
      credentials: rds.Credentials.fromPassword('postgres', cdk.SecretValue.ssmSecure('/dbPassword', '1')),
    });

    // THEN
    expect(stack).toHaveResource('AWS::RDS::DBInstance', {
      MasterUsername: 'postgres', // username is a string
      MasterUserPassword: '{{resolve:ssm-secure:/dbPassword:1}}', // reference to SSM
    });


  });

  test('can set publiclyAccessible to false with public subnets', () => {
    new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_19,
      }),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      publiclyAccessible: false,
    });

    expect(stack).toHaveResource('AWS::RDS::DBInstance', {
      PubliclyAccessible: false,
    });


  });

  test('can set publiclyAccessible to true with private subnets', () => {
    new rds.DatabaseInstance(stack, 'Instance', {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_19,
      }),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE,
      },
      publiclyAccessible: true,
    });

    expect(stack).toHaveResource('AWS::RDS::DBInstance', {
      PubliclyAccessible: true,
    });
  });
});

test.each([
  [cdk.RemovalPolicy.RETAIN, 'Retain', 'Retain'],
  [cdk.RemovalPolicy.SNAPSHOT, 'Snapshot', ABSENT],
  [cdk.RemovalPolicy.DESTROY, 'Delete', ABSENT],
])('if Instance RemovalPolicy is \'%s\', the instance has DeletionPolicy \'%s\' and the DBSubnetGroup has \'%s\'', (instanceRemovalPolicy, instanceValue, subnetValue) => {
  // GIVEN
  stack = new cdk.Stack();
  vpc = new ec2.Vpc(stack, 'VPC');

  // WHEN
  new rds.DatabaseInstance(stack, 'Instance', {
    engine: rds.DatabaseInstanceEngine.mysql({
      version: rds.MysqlEngineVersion.VER_8_0_19,
    }),
    vpc,
    vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    removalPolicy: instanceRemovalPolicy,
  });

  // THEN
  expect(stack).toHaveResourceLike('AWS::RDS::DBInstance', {
    DeletionPolicy: instanceValue,
    UpdateReplacePolicy: instanceValue,
  }, ResourcePart.CompleteDefinition);

  expect(stack).toHaveResourceLike('AWS::RDS::DBSubnetGroup', {
    DeletionPolicy: subnetValue,
    UpdateReplacePolicy: subnetValue,
  }, ResourcePart.CompleteDefinition);
});

test.each([
  [cdk.RemovalPolicy.RETAIN, 'Retain', 'Retain'],
  [cdk.RemovalPolicy.SNAPSHOT, 'Snapshot', ABSENT],
  [cdk.RemovalPolicy.DESTROY, 'Delete', ABSENT],
])('if Instance RemovalPolicy is \'%s\', the instance has DeletionPolicy \'%s\' and the DBSubnetGroup has \'%s\'', (instanceRemovalPolicy, instanceValue, subnetValue) => {
  // WHEN
  new rds.DatabaseInstance(stack, 'Instance', {
    engine: rds.DatabaseInstanceEngine.mysql({
      version: rds.MysqlEngineVersion.VER_8_0_19,
    }),
    vpc,
    vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    removalPolicy: instanceRemovalPolicy,
  });

  // THEN
  expect(stack).to(haveResourceLike('AWS::RDS::DBInstance', {
    DeletionPolicy: instanceValue,
    UpdateReplacePolicy: instanceValue,
  }, ResourcePart.CompleteDefinition));

  expect(stack).to(haveResourceLike('AWS::RDS::DBSubnetGroup', {
    DeletionPolicy: subnetValue,
    UpdateReplacePolicy: subnetValue,
  }, ResourcePart.CompleteDefinition));
});
