// extension.js
const vscode = require('vscode');
const axios = require('axios');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Extension "pr-celebration" is now active!');

    // Create a status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'pr-celebration.checkPrStatus';
    statusBarItem.text = "$(git-pull-request) PR Monitor";
    statusBarItem.tooltip = "Monitoring PR notifications";
    statusBarItem.show();

    // Register the manual check command
    let checkPrStatusCommand = vscode.commands.registerCommand('pr-celebration.checkPrStatus', async () => {
        vscode.window.showInformationMessage('Checking PR notifications...');
        await checkNotifications();
    });

    // Register test command for debugging
    let testCommand = vscode.commands.registerCommand('pr-celebration.test', () => {
        vscode.window.showInformationMessage('Testing animation');
        // Show test animation
        const testPr = {
            title: "Test PR Animation",
            number: 123,
            html_url: "https://github.com/example/repo/pull/123"
        };
        showCelebrationAnimation(true, testPr);
        showCelebrationAnimation(false, testPr);
    });
    
    // Setup periodic polling for notifications
    setupNotificationPolling(context);

    context.subscriptions.push(checkPrStatusCommand, statusBarItem, testCommand);
}

/**
 * Sets up continuous polling for GitHub notifications
 */
function setupNotificationPolling(context) {
    // Get notification check interval from settings (default: 60 seconds)
    const config = vscode.workspace.getConfiguration('prCelebration');
    const checkIntervalSeconds = config.get('notificationCheckIntervalSeconds') || 60;
    
    console.log(`Setting up notification polling every ${checkIntervalSeconds} seconds`);
    
    // Setup the interval for checking notifications
    const intervalId = setInterval(async () => {
        await checkNotifications();
    }, checkIntervalSeconds * 1000);
    
    // Store the interval ID so we can clear it if needed
    context.subscriptions.push({ dispose: () => clearInterval(intervalId) });
    
    // Also check immediately on startup (with slight delay to let VS Code initialize)
    setTimeout(() => checkNotifications(), 5000);
}

/**
 * Checks for new GitHub notifications related to PRs
 */
async function checkNotifications() {
    try {
        console.log('Checking GitHub notifications');
        
        // Get configuration - only need GitHub token
        const config = vscode.workspace.getConfiguration('prCelebration');
        const githubToken = config.get('githubToken');
        
        if (!githubToken) {
            // Show this message only once per session
            const hasShownMessage = context.globalState.get('hasShownTokenMessage');
            if (!hasShownMessage) {
                vscode.window.showInformationMessage(
                    'PR Celebration needs a GitHub token to monitor notifications. Please add it in settings.',
                    'Open Settings'
                ).then(selection => {
                    if (selection === 'Open Settings') {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'prCelebration.githubToken');
                    }
                });
                context.globalState.update('hasShownTokenMessage', true);
            }
            return;
        }

        // Get all unread notifications
        const notifications = await getGitHubNotifications(githubToken);
        console.log(`Found ${notifications.length} unread notifications`);
        
        // Filter PR-related notifications
        const prNotifications = notifications.filter(notification => 
            notification.subject && notification.subject.type === 'PullRequest'
        );
        
        console.log(`Found ${prNotifications.length} PR-related notifications`);
        
        // Process each PR notification
        for (const notification of prNotifications) {
            try {
                // Extract PR URL
                const prUrl = notification.subject.url;
                if (!prUrl) continue;
                
                console.log(`Processing notification for PR: ${prUrl}`);
                
                // Get PR details from the URL
                const prDetails = await getPrDetailsFromUrl(githubToken, prUrl);
                
                // Get PR comments
                const commentsUrl = prDetails.comments_url;
                const comments = await getCommentsFromUrl(githubToken, commentsUrl);
                
                // Check for merged status or @robodoo r+ comment
                const isMerged = prDetails.merged || false;
                
                const hasApproval = comments.some(comment => 
                    comment.body && comment.body.includes('@robodoo r+')
                );
                
                console.log(`PR status - Merged: ${isMerged}, Approval: ${hasApproval}`);
                
                // Get the repository and PR number information for display
                const prHtmlUrl = prDetails.html_url || '';
                const prNumber = prDetails.number || '';
                const prTitle = prDetails.title || 'Pull Request';
                
                // Show animation based on status
                if (isMerged || hasApproval) {
                    console.log('Showing celebration animation');
                    showCelebrationAnimation(true, {
                        title: prTitle,
                        number: prNumber,
                        html_url: prHtmlUrl
                    });
                } else {
                    // Only show sad animation for recent activity
                    const updatedAt = new Date(prDetails.updated_at || Date.now());
                    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
                    
                    if (updatedAt > tenMinutesAgo) {
                        console.log('Showing sad animation for recent activity');
                        showCelebrationAnimation(false, {
                            title: prTitle,
                            number: prNumber,
                            html_url: prHtmlUrl
                        });
                    }
                }
                
                // Mark notification as read
                await markNotificationAsRead(githubToken, notification.id);
            } catch (notificationError) {
                console.error('Error processing notification:', notificationError);
                // Continue with next notification
            }
        }
        
    } catch (error) {
        console.error('Error checking notifications:', error);
        // Don't show error message to user for background polling
    }
}

/**
 * Gets PR details from the GitHub URL
 */
async function getPrDetailsFromUrl(token, url) {
    console.log(`Fetching PR details from: ${url}`);
    
    const response = await axios.get(url, {
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });
    
    return response.data;
}

/**
 * Gets comments from the GitHub URL
 */
async function getCommentsFromUrl(token, url) {
    console.log(`Fetching comments from: ${url}`);
    
    const response = await axios.get(url, {
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });
    
    return response.data;
}

/**
 * Gets all unread GitHub notifications
 */
async function getGitHubNotifications(token) {
    const url = 'https://api.github.com/notifications';
    console.log(`Fetching notifications from: ${url}`);
    
    const response = await axios.get(url, {
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });
    
    return response.data;
}

/**
 * Marks a notification as read
 */
async function markNotificationAsRead(token, notificationId) {
    const url = `https://api.github.com/notifications/threads/${notificationId}`;
    console.log(`Marking notification as read: ${notificationId}`);
    
    await axios.patch(url, {}, {
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });
}

function showCelebrationAnimation(isHappy, pr) {
    // Create and show webview panel
    const panel = vscode.window.createWebviewPanel(
        'prCelebration',
        isHappy ? 'PR Celebration!' : 'PR Status',
        vscode.ViewColumn.Two,
        { enableScripts: true }
    );
    
    // Set webview content
    panel.webview.html = getWebviewContent(isHappy, pr);
    
    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        message => {
            if (message.command === 'openExternalLink') {
                vscode.env.openExternal(vscode.Uri.parse(message.url));
            }
        },
        undefined,
        []
    );
}

function getWebviewContent(isHappy, pr) {
    const prTitle = pr ? pr.title : '';
    const prNumber = pr ? pr.number : '';
    const prUrl = pr ? pr.html_url : '';
    
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${isHappy ? 'PR Celebration!' : 'PR Status'}</title>
        <style>
            body {
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background-color: ${isHappy ? '#e6ffe6' : '#ffe6e6'};
                overflow: hidden;
                font-family: Arial, sans-serif;
            }
            .stick-figure {
                position: relative;
                width: 100px;
                height: 200px;
            }
            .head {
                position: absolute;
                top: 0;
                left: 35px;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                background-color: #000;
            }
            .body {
                position: absolute;
                top: 30px;
                left: 49px;
                width: 2px;
                height: 80px;
                background-color: #000;
            }
            .left-arm, .right-arm, .left-leg, .right-leg {
                position: absolute;
                width: 2px;
                height: 60px;
                background-color: #000;
                transform-origin: top;
            }
            .left-arm {
                top: 40px;
                left: 49px;
            }
            .right-arm {
                top: 40px;
                left: 49px;
            }
            .left-leg {
                top: 110px;
                left: 49px;
            }
            .right-leg {
                top: 110px;
                left: 49px;
            }
            .message {
                text-align: center;
                font-size: 24px;
                margin-top: 20px;
                color: ${isHappy ? 'green' : 'red'};
                font-weight: bold;
            }
            .pr-info {
                margin-top: 20px;
                text-align: center;
                max-width: 500px;
            }
            .pr-title {
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 10px;
            }
            .pr-number {
                font-size: 14px;
                margin-bottom: 10px;
            }
            .pr-link {
                color: blue;
                text-decoration: underline;
                cursor: pointer;
            }
            @keyframes dance-left-arm {
                0%, 100% { transform: rotate(-45deg); }
                50% { transform: rotate(45deg); }
            }
            @keyframes dance-right-arm {
                0%, 100% { transform: rotate(45deg); }
                50% { transform: rotate(-45deg); }
            }
            @keyframes dance-left-leg {
                0%, 100% { transform: rotate(-20deg); }
                50% { transform: rotate(20deg); }
            }
            @keyframes dance-right-leg {
                0%, 100% { transform: rotate(20deg); }
                50% { transform: rotate(-20deg); }
            }
            @keyframes head-bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-5px); }
            }
            @keyframes sad-left-arm {
                0%, 100% { transform: rotate(-15deg); }
            }
            @keyframes sad-right-arm {
                0%, 100% { transform: rotate(15deg); }
            }
            @keyframes sad-legs {
                0%, 100% { transform: rotate(0); }
            }
            .dancing .head {
                animation: head-bounce 0.8s infinite;
            }
            .dancing .left-arm {
                animation: dance-left-arm 0.8s infinite;
            }
            .dancing .right-arm {
                animation: dance-right-arm 0.8s infinite;
            }
            .dancing .left-leg {
                animation: dance-left-leg 0.8s infinite;
            }
            .dancing .right-leg {
                animation: dance-right-leg 0.8s infinite;
            }
            .sad .left-arm {
                animation: sad-left-arm 1s infinite;
                transform: rotate(-15deg);
            }
            .sad .right-arm {
                animation: sad-right-arm 1s infinite;
                transform: rotate(15deg);
            }
            .sad .left-leg, .sad .right-leg {
                animation: sad-legs 1s infinite;
            }
            .face {
                position: absolute;
                width: 20px;
                height: 10px;
                top: 15px;
                left: 5px;
            }
            .eyes {
                position: relative;
                display: flex;
                justify-content: space-between;
                width: 20px;
            }
            .eye {
                width: 5px;
                height: 5px;
                background-color: white;
                border-radius: 50%;
            }
            .mouth {
                position: relative;
                top: 2px;
                width: 14px;
                height: 7px;
                margin: 0 auto;
                background-color: transparent;
                border: 2px solid white;
                border-radius: ${isHappy ? '0 0 10px 10px' : '10px 10px 0 0'};
                border-top: ${isHappy ? '0' : '2px solid white'};
                border-bottom: ${isHappy ? '2px solid white' : '0'};
            }
        </style>
    </head>
    <body>
        <div class="stick-figure ${isHappy ? 'dancing' : 'sad'}">
            <div class="head">
                <div class="face">
                    <div class="eyes">
                        <div class="eye"></div>
                        <div class="eye"></div>
                    </div>
                    <div class="mouth"></div>
                </div>
            </div>
            <div class="body"></div>
            <div class="left-arm"></div>
            <div class="right-arm"></div>
            <div class="left-leg"></div>
            <div class="right-leg"></div>
        </div>
        <div class="message">
            ${isHappy ? 'Woohoo! PR approved or merged!' : 'Still waiting for approval...'}
        </div>
        ${pr ? `
        <div class="pr-info">
            <div class="pr-title">${prTitle}</div>
            <div class="pr-number">PR #${prNumber}</div>
            <a class="pr-link" href="#" onclick="openLink('${prUrl}'); return false;">View on GitHub</a>
        </div>
        <script>
            function openLink(url) {
                const vscode = acquireVsCodeApi();
                vscode.postMessage({
                    command: 'openExternalLink',
                    url: url
                });
            }
        </script>
        ` : ''}
    </body>
    </html>`;
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
