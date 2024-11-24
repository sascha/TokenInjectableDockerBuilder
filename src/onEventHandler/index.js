const AWS = require('aws-sdk');

exports.handler = async (event, context) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    const codebuild = new AWS.CodeBuild();

    // Set the PhysicalResourceId
    let physicalResourceId = event.PhysicalResourceId || event.LogicalResourceId;

    if (event.RequestType === 'Create' || event.RequestType === 'Update') {
        const params = {
            projectName: event.ResourceProperties.ProjectName,
        };

        try {
            const build = await codebuild.startBuild(params).promise();
            console.log('Started build:', JSON.stringify(build, null, 2));
        } catch (error) {
            console.error('Error starting build:', error);

            return {
                PhysicalResourceId: physicalResourceId,
                Data: {},
                Reason: error.message,
            };
        }
    } else if (event.RequestType === 'Delete') {
        // No action needed for delete, but ensure PhysicalResourceId remains the same
        console.log('Delete request received. No action required.');
    }

    return {
        PhysicalResourceId: physicalResourceId,
        Data: {}
    };
};
