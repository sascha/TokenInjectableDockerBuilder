const AWS = require('aws-sdk');

exports.handler = async (event, context) => {
    console.log('isCompleteHandler Event:', JSON.stringify(event, null, 2));
    const codebuild = new AWS.CodeBuild();
    const cloudwatchlogs = new AWS.CloudWatchLogs();

    try {
        const projectName = event.ResourceProperties.ProjectName;

        if (!projectName) {
            throw new Error('ProjectName is required in ResourceProperties');
        }

        console.log(`Checking status for CodeBuild project: ${projectName}`);

        // Retrieve the latest build for the given project
        const listBuildsResp = await codebuild.listBuildsForProject({
            projectName: projectName,
            sortOrder: 'DESCENDING',
            maxResults: 1
        }).promise();

        const buildIds = listBuildsResp.ids;
        if (!buildIds || buildIds.length === 0) {
            throw new Error(`No builds found for project: ${projectName}`);
        }

        const buildId = buildIds[0];
        console.log(`Latest Build ID: ${buildId}`);

        // Get build details
        const buildDetailsResp = await codebuild.batchGetBuilds({ ids: [buildId] }).promise();
        const build = buildDetailsResp.builds[0];

        if (!build) {
            throw new Error(`Build details not found for Build ID: ${buildId}`);
        }

        const buildStatus = build.buildStatus;
        console.log(`Build Status: ${buildStatus}`);

        if (buildStatus === 'IN_PROGRESS') {
            // Build is still in progress
            console.log('Build is still in progress.');
            return { IsComplete: false };
        } else if (buildStatus === 'SUCCEEDED') {
            // Build succeeded
            console.log('Build succeeded.');
            return { IsComplete: true };
        } else if (['FAILED', 'FAULT', 'STOPPED', 'TIMED_OUT'].includes(buildStatus)) {
            // Build failed; retrieve last 5 log lines
            const logsInfo = build.logs;
            if (logsInfo && logsInfo.groupName && logsInfo.streamName) {
                console.log(`Retrieving logs from CloudWatch Logs Group: ${logsInfo.groupName}, Stream: ${logsInfo.streamName}`);
                
                // Fetch the last 5 log events
                const logEventsResp = await cloudwatchlogs.getLogEvents({
                    logGroupName: logsInfo.groupName,
                    logStreamName: logsInfo.streamName,
                    startFromHead: false, // Start from the end to get latest logs
                    limit: 5
                }).promise();

                const logEvents = logEventsResp.events;
                const lastFiveMessages = logEvents.map(event => event.message).reverse().join('\n');

                const errorMessage = `Build failed with status: ${buildStatus}\nLast 5 build logs:\n${lastFiveMessages}`;
                console.error(errorMessage);

                // Throw an error to indicate failure to the CDK provider
                throw new Error(errorMessage);
            } else {
                const errorMessage = `Build failed with status: ${buildStatus}, but logs are not available.`;
                console.error(errorMessage);
                throw new Error(errorMessage);
            }
        } else {
            const errorMessage = `Unknown build status: ${buildStatus}`;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }
    } catch (error) {
        console.error('Error in isCompleteHandler:', error);
        // Rethrow the error to inform the CDK provider of the failure
        throw error;
    }
};
