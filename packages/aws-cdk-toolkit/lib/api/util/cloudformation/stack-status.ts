/**
 * A utility class to inspect CloudFormation stack statuses.
 *
 * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-describing-stacks.html
 */
export class StackStatus {
    constructor(readonly name: string) {}

    get isCreationFailure(): boolean {
        return this.name === 'ROLLBACK_COMPLETE'
            || this.name === 'ROLLBACK_FAILED';
    }

    get isDeleted(): boolean {
        return this.name.startsWith('DELETE_');
    }

    get isFailure(): boolean {
        return this.name.endsWith('FAILED');
    }

    get isRollback(): boolean {
        return this.name.indexOf('ROLLBACK') !== -1;
    }

    get isStable(): boolean {
        return !this.name.endsWith('_IN_PROGRESS');
    }

    get isSuccess(): boolean {
        return !this.isRollback && !this.isFailure;
    }
}