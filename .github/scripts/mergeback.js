let ciUser;

module.exports = async ({ github, context }, env = {}) => {
  const sourceBranch = 'main';
  const targetBranch = env.TARGET_BRANCH;
  const sourceSha = env.SOURCE_SHA;
  ciUser = env.CI_USER ?? '';

  console.log(`Creating mergeback PR from ${sourceBranch} to ${targetBranch}`);
  console.log(`Using SHA: ${sourceSha}`);

  await createMergeBackPullRequest({ github, context }, sourceBranch, targetBranch, sourceSha);
  console.log('Finished creating pull request');
};

async function createMergeBackPullRequest({ github, context }, sourceBranch, targetBranch, sourceSha) {
  const sourceBranchWithSha = `${sourceSha.substring(0, 7)}/${sourceBranch}`;

  try {
    const newBranchName = `merge-back-${sourceBranchWithSha}-into-${targetBranch}`;
    console.log(`Creating mergeback: ${newBranchName}`);

    // Check if branch already exists
    let branchExists = false;
    try {
      await github.rest.git.getRef({
        owner: context.repo.owner,
        repo: context.repo.repo,
        ref: `heads/${newBranchName}`,
      });
      branchExists = true;
      console.log(`Branch ${newBranchName} already exists, using existing branch`);
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
    }

    // Create new branch from base branch if it doesn't exist
    if (!branchExists) {
      await github.rest.git.createRef({
        owner: context.repo.owner,
        repo: context.repo.repo,
        ref: `refs/heads/${newBranchName}`,
        sha: sourceSha,
      });
      console.log(`Created branch ${newBranchName}`);
    }

    const user = context.payload.sender.login;
    const assignees = [];
    // Exclude CI account from tagging
    if (user !== ciUser) {
      assignees.push(user);
    }

    // Check if PR already exists
    const existingPRs = await github.rest.pulls.list({
      owner: context.repo.owner,
      repo: context.repo.repo,
      head: `${context.repo.owner}:${newBranchName}`,
      base: targetBranch,
      state: 'open',
    });

    if (existingPRs.data.length > 0) {
      console.log(`PR already exists: ${existingPRs.data[0].html_url}`);
      return;
    }

    // Create pull request to merge
    const createdPR = await github.rest.pulls.create({
      owner: context.repo.owner,
      repo: context.repo.repo,
      title: `[BOT] Merge back: ${sourceBranchWithSha} into ${targetBranch} 🤖`,
      body: `Automatic merging back ${sourceBranchWithSha} into ${targetBranch}! ${assignees
        .map((assignee) => `@${assignee}`)
        .join(' ')} Please verify that the merge is correct.`,
      head: newBranchName,
      base: targetBranch,
    });

    // Add responsible author as an assignee
    await github.rest.issues.addAssignees({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: createdPR.data.number,
      assignees,
    });

    console.log(`Successfully created PR: ${createdPR.data.html_url}`);
  } catch (error) {
    console.error(`Failed to create pull request from ${sourceBranchWithSha} into ${targetBranch}`);
    console.error(`Error details: ${error.message}`);
    throw error;
  }
}
